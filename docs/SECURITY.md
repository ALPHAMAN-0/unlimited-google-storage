# Security review — final report

Date: 2026-10-30  
Reviewer: puku-cli security-review skill  
Result: **PASS** ✅

## Summary

The application was reviewed across the OWASP-aligned checklist, and the
findings below were fixed under a TDD red/green cycle. Every guard listed
here is covered by an automated test that runs in CI on every push.

## What passed

| Area | Status | Notes |
|---|---|---|
| Secrets management | PASS | No hardcoded secrets. All in env vars via Zod-validated `src/lib/env.ts`. `.env.local` in `.gitignore`. |
| Input validation | PASS | Filename + MIME validation in `src/lib/validate.ts`. Client-supplied MIME types are normalised (`normalizeMimeType`), never trusted. `MAX_UPLOAD_BYTES` enforced before any Drive call. Empty files rejected. |
| SQL injection | PASS | All DB access via Prisma's typed client. No string concatenation anywhere. |
| Authentication | PASS | NextAuth v5 with JWT strategy, httpOnly cookies, 30-day expiry, server-side `signIn` action. |
| Authorization | PASS | `requireUser()` on every endpoint. Ownership checks on every Drive call. Soft-deleted files are filtered by `deletedAt: null`. Cross-user access returns **404**, not 403, so resource existence is not disclosed. |
| XSS | PASS | All user-controlled strings rendered as React text (no `dangerouslySetInnerHTML`). **Nonce-based CSP** — see below. |
| CSRF | PASS | Two independent layers. See "CSRF protection" below. |
| Rate limiting | PASS | In-memory token bucket on `/api/uploads` (60/10min/user), `/api/links/sync` (6/min/user), `/api/auth/link` (5/10min/user). Swap to Upstash for multi-instance. Unit-tested. |
| Sensitive data exposure | PASS | No tokens in logs. Generic error responses to clients — internal messages are logged server-side only, never returned. |
| File uploads | PASS | Size cap enforced before work. Streamed (not buffered). Filenames never used in server filesystem paths. |
| Secret comparison | PASS | The cron secret is compared with `timingSafeEqual`, not `===`, so a timing side channel cannot recover it byte by byte. |
| Dependency security | PASS | `npm audit --omit=dev` reports **0 vulnerabilities** at every severity. See "Dependency security" below. |

## CSRF protection

Two independent layers, both required for a state-changing request to succeed:

1. **Origin / Referer allow-list** — `isSameOrigin()` in `src/lib/csrf.ts`.
   The trusted origins come from `NEXTAUTH_URL` and the request's own URL —
   never from the request's `Origin` header, which the client controls.
2. **Double-submit token** — a 32-byte random token is stored in an httpOnly,
   `SameSite=Strict` cookie (`ugs_csrf`) and echoed back by the client in the
   `x-csrf-token` header. `verifyCsrfPair()` compares the two with
   `timingSafeEqual`.

`requireUserForMutation()` in `src/server/auth/require-user.ts` enforces both
on every mutating route. A failure returns a generic `403 {error:"forbidden"}`
before any database work happens.

The token is issued by `ensureCsrfToken()` during server render of the
dashboard and is passed to client components as a prop, so the value is never
readable by injected script.

## Content-Security-Policy

Set by `src/middleware.ts` on every response.

### Production

```
default-src 'self';
script-src 'self' 'nonce-<per-request-random>';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com;
frame-src https://accounts.google.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
media-src 'none';
worker-src 'self' blob:;
manifest-src 'self';
upgrade-insecure-requests
```

**There is no `'unsafe-inline'` and no `'unsafe-eval'` in `script-src` in
production.** A fresh 16-byte nonce is generated per request, embedded in the
policy, and Next.js stamps it onto every script it emits.

Two subtleties that are easy to get wrong, both covered by tests:

- The policy must be set on the **request** headers as well as the response.
  Next.js reads the nonce out of the incoming `Content-Security-Policy`
  header (`getScriptNonceFromHeader`); setting it only on the response leaves
  the inline bootstrap scripts un-nonced and the page renders blank.
- Every route must render **per request**. Next.js only applies the nonce
  while rendering HTML at request time. A statically prerendered page is built
  ahead of time with no request context, so its scripts carry no nonce and the
  browser blocks them. `src/app/layout.tsx` therefore declares
  `export const dynamic = "force-dynamic"` at the **root layout**, which
  covers every route beneath it — including the built-in `_not-found` page and
  any route added later.

### Development

`script-src 'self' 'unsafe-eval' 'unsafe-inline'` — React Fast Refresh needs
`eval`, and the dev overlay injects inline scripts that cannot be nonced.

### Other headers

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload   (prod only)
```

## Dependency security

`npm audit --omit=dev` → **0 vulnerabilities** (0 critical, 0 high, 0 moderate, 0 low).

| Package | Version | Why |
|---|---|---|
| `next` | `15.5.28` (exact) | `15.0.3` carried ~30 critical RCE advisories. |
| `eslint-config-next` | `15.5.28` (exact) | Matched to `next`. |
| `zod` | `4.6.7` (exact) | Patched; `src/lib/env.ts` behaviour pinned by `tests/unit/env.test.ts`. |
| `googleapis` | `189.0.0` (exact) | Drops the vulnerable `uuid@9` transitive chain. |

`package.json` uses npm `overrides` to force `postcss@8.5.30` (patched) and
`postcss-selector-parser@6.1.5` into Next's dependency tree, where Next
otherwise pins a vulnerable `postcss@8.4.31`. The direct `postcss`
devDependency is pinned to the same version, because npm rejects an override
that conflicts with a direct dependency.

## Scope minimization

The link flow requests exactly:

- `openid email`
- `https://www.googleapis.com/auth/drive.file` (per-file access; we can only read/write files we created via this app)

We do **not** request:

- `drive` (full Drive access) — would let us read the user's existing files.
- `drive.activity` — not needed.
- Any Gmail, Calendar, Contacts, etc. scope.

## Token storage

- `GoogleLink.accessToken` and `GoogleLink.refreshToken` are AES-256-GCM
  encrypted with a 32-byte key from `TOKEN_ENCRYPTION_KEY` (base64-encoded).
- The key is never persisted to the database; losing it makes all stored
  tokens unrecoverable (users would re-link their accounts).
- Auth-tag verification on decrypt means tampered ciphertext throws rather
  than silently returning garbage.

## Threat-model answers

| Threat | Mitigation |
|---|---|
| DB dump leaks Drive access | Tokens encrypted at rest; AES-GCM with auth tag. |
| Stolen session cookie | httpOnly + SameSite=Strict; HSTS prevents downgrade. |
| CSRF on state-changing API routes | Origin allow-list **and** double-submit token, both enforced before any DB access. |
| CSRF on link-account flow | HMAC-signed state cookie, single-use, 10-min TTL, server-side consumed. |
| XSS in user-controlled filenames | React escapes by default; production CSP allows no inline script without the per-request nonce. |
| Reflected parameter injection | Link-flow error codes are whitelisted (`sanitizeLinkError`); unknown values collapse to a generic code. The raw value is never echoed into the redirect. |
| Path traversal via filename | Filenames never used in server paths; live in Drive. |
| Quota exhaustion / DoS | Per-user rate limit on uploads; `MAX_UPLOAD_BYTES` cap. |
| OAuth state leak across providers | `state` cookie signed with NEXTAUTH_SECRET; provider-bound. |
| Timing attack on the cron secret | Constant-time `timingSafeEqual` comparison. |
| IDOR across users | Every query is scoped to the signed-in user's id; cross-user access returns 404. |
| Information disclosure via errors | Client gets a generic message; the real error is logged server-side only. |

## Residual risks (accepted)

1. **Dev-toolchain advisories.** `npm audit` (including dev deps) still reports
   findings in `vite`, `vitest`, `esbuild` and `tinypool`. These affect only
   the local dev server and the test runner — they are never shipped in the
   production bundle. Clearing them requires a Vitest 5 / Vite major
   migration. The CI audit job runs `npm audit --omit=dev --audit-level=high`,
   so the runtime dependency set is enforced to be clean.
2. **In-memory rate limit.** A single-process map. For multi-instance
   production, swap to Upstash Ratelimit. The interface in
   `src/lib/rate-limit.ts` is intentionally identical.
3. **Dev-mode CSP looseness.** `script-src` allows `'unsafe-eval'` and
   `'unsafe-inline'` in development, because React Fast Refresh needs `eval`.
   Production builds do not — `tests/e2e/csp-production.spec.ts` asserts this
   against a real production server.
4. **`style-src 'unsafe-inline'`.** Next.js injects critical CSS inline.
   Styles are not a script execution vector in the same way, and the app has
   no user-supplied HTML, so the risk is low relative to the breakage a
   strict style policy would cause.

## Test coverage

`tests/e2e/csp-production.spec.ts` runs against a **production** build
(`PLAYWRIGHT_PRODUCTION=1`), not the dev server. This matters: the dev server
keeps `'unsafe-inline'` in `script-src`, so a broken production CSP is
invisible to a dev-server test suite. A strict `script-src 'self'` shipped
once and rendered a completely blank page while every dev test still passed.
The production E2E job in CI exists specifically to catch that class of bug.
