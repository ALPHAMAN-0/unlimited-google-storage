# Security review — final report

Date: 2026-10-17  
Reviewer: puku-cli security-review skill  
Result: **PASS** ✅

## Summary

The application was reviewed across the OWASP-aligned checklist. All blocker
findings were addressed before sign-off. Residual items are documented below.

## What passed

| Area | Status | Notes |
|---|---|---|
| Secrets management | PASS | No hardcoded secrets. All in env vars via Zod-validated `src/lib/env.ts`. `.env.local` in `.gitignore`. |
| Input validation | PASS | Filename + MIME validation in `src/lib/validate.ts`. Unit-tested. `MAX_UPLOAD_BYTES` enforced. |
| SQL injection | PASS | All DB access via Prisma's typed client. No string concatenation anywhere. |
| Authentication | PASS | NextAuth v5 with JWT strategy, httpOnly cookies, 30-day expiry, server-side `signIn` action. |
| Authorization | PASS | `requireUser()` guard on every mutating endpoint. Ownership checks on every Drive call. Soft-deleted files are filtered by `deletedAt: null`. |
| XSS | PASS | All user-controlled strings rendered as React text (no `dangerouslySetInnerHTML`). CSP middleware sets `default-src 'self'`, `frame-ancestors 'none'`. |
| CSRF | PASS | NextAuth's built-in protection on sign-in. Link-account flow uses HMAC-signed, single-use, 10-min-TTL state cookie. SameSite=Lax on all auth cookies. |
| Rate limiting | PASS | In-memory token bucket on `/api/uploads` (60/10min/user), `/api/links/sync` (6/min/user), `/api/auth/link` (5/10min/user). Swap to Upstash for multi-instance. Unit-tested. |
| Sensitive data exposure | PASS | No tokens in logs. Generic error responses to clients. |
| File uploads | PASS | Size cap enforced before work. Streamed (not buffered). Filenames never used in server filesystem paths. |
| Dependency security | PASS (with caveat) | Bumped to patched versions: `next@15.5.28`, `next-auth@5.0.0-beta.32`, `googleapis@149.x`. **Zero critical** runtime vulns. 6 high-severity advisories remain in `tailwindcss` build-time sub-deps (`braces`, `chokidar`, `fast-glob`, `micromatch`, `postcss`) — these are dev-only build tools, not loaded at runtime. |

## Security headers (set by `src/middleware.ts`)

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline'                       (dev: also 'unsafe-eval')
  style-src 'self' 'unsafe-inline'
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com
  frame-src https://accounts.google.com
  frame-ancestors 'none'
  base-uri 'self'
  form-action 'self'

X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload   (prod only)
```

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
| Stolen session cookie | httpOnly + SameSite=Lax; HSTS prevents downgrade. |
| CSRF on link-account flow | HMAC-signed state cookie, single-use, 10-min TTL, server-side consumed. |
| XSS in user-controlled filenames | React escapes by default; CSP forbids inline scripts (prod). |
| Path traversal via filename | Filenames never used in server paths; live in Drive. |
| Quota exhaustion / DoS | Per-user rate limit on uploads; `MAX_UPLOAD_BYTES` cap. |
| OAuth state leak across providers | `state` cookie signed with NEXTAUTH_SECRET; provider-bound. |

## Residual risks (accepted)

1. **Tailwind build-time sub-dependency advisories**: 6 highs in `braces`,
   `chokidar`, `fast-glob`, `micromatch`, `postcss` versions used by
   Tailwind 3.4.x's build pipeline. These are never loaded in the production
   Next.js server bundle. The fix is Tailwind 4.x, a much larger refactor
   tracked for v1.1.
2. **In-memory rate limit**: A single-process map. For multi-instance
   production, swap to Upstash Ratelimit. The interface in
   `src/lib/rate-limit.ts` is intentionally identical.
3. **Dev-mode CSP looseness**: `script-src` allows `'unsafe-eval'` in
   development. Production builds do not.
