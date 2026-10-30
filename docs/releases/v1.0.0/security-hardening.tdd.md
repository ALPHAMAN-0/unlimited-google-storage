# TDD evidence report — security hardening

Date: 2026-10-30
Skills applied: `tdd-workflow`, `security-review`, verification loop
Scope: full repository review of `unlimited-google-storage`

No `*.plan.md` was supplied — the journeys below were derived during this TDD
run from the security-review checklist.

## User journeys

1. As a signed-out visitor, I want every API route to reject my request, so
   that no user's files are ever exposed to me.
2. As a signed-in user, I want a request from another website to be rejected,
   so that an attacker's page cannot make my browser perform actions on my
   behalf.
3. As a signed-in user, I want to be unable to read or delete another user's
   files, so that a leaked file id is not enough to compromise my account.
4. As a user, I want a malformed OAuth error to be handled gracefully,
   so that a hostile redirect cannot crash the page or inject content.
5. As a user, I want the app to load and hydrate under a strict
   Content-Security-Policy, so that an XSS elsewhere in the stack cannot run.
6. As an operator, I want the database schema to actually exist after the
   migrations run, so that CI exercises the real schema.
7. As an operator, I want `npm audit` on production dependencies to be clean,
   so that known RCEs in the framework are not shipped.
8. As an operator, I want the repository to be free of obfuscated payloads
   and to fail CI if one returns, so that a force-push cannot silently
   reintroduce a crypto-miner onto every build machine and CI runner.

## Task report

### 1. CSRF protection on state-changing routes

**Summary** — Added an Origin/Referer allow-list plus a double-submit CSRF
token, enforced by `requireUserForMutation()` before any database access.

**Validation** — `npx vitest run tests/unit/csrf.test.ts tests/integration/api-guards.test.ts`

```
✓ tests/unit/csrf.test.ts (23 tests)
✓ tests/integration/api-guards.test.ts (24 tests)
```

**RED evidence** — The first implementation of `allowedOrigins()` took the
request's own `Origin` header and added it to the allow-list, which made every
origin trusted. Five tests in `tests/unit/csrf.test.ts` failed with the
intended assertion (`isSameOrigin` returned `true` for
`https://evil.example.com`). Fixed by deriving the trusted origin from
`req.url` and `NEXTAUTH_URL` instead.

**GREEN evidence** — Same command, all 47 tests pass.

**What is guaranteed** — A state-changing request is rejected with 403 unless
it comes from a trusted origin *and* carries a matching `x-csrf-token`. The
guard runs before any Prisma call, so a rejected request touches nothing.

### 2. IDOR / ownership enforcement

**Summary** — Every file and link query is scoped to the signed-in user's id;
cross-user access returns 404 rather than 403 so existence is not disclosed.

**Validation** — `npx vitest run tests/integration/api-guards.test.ts`

```
✓ tests/integration/api-guards.test.ts (24 tests)
```

**What is guaranteed** — `GET /api/files` filters by `userId` and
`deletedAt: null`; `DELETE /api/files/[id]`, `GET .../download` and
`DELETE /api/links/[id]` all return 404 for another user's resource and make
no mutation call.

### 3. Information disclosure and input validation

**Summary** — `sanitizeLinkError()` whitelists OAuth error codes;
`normalizeMimeType()` validates client-supplied MIME types; internal errors
return a generic message.

**Validation** — `npx vitest run tests/unit/sanitize.test.ts tests/integration/uploads.test.ts`

```
✓ tests/unit/sanitize.test.ts (17 tests)
✓ tests/integration/uploads.test.ts (14 tests)
```

**What is guaranteed** — An unknown error code becomes `link_failed`; a
malformed MIME type becomes `application/octet-stream` and is never forwarded
to Drive; a 500 response body contains neither the error message nor the word
`Prisma`.

### 4. Cron secret compared in constant time

**Summary** — Replaced `got !== env.CRON_SECRET` with a `timingSafeEqual`
comparison.

**Validation** — `npx vitest run tests/integration/cron-security.test.ts`

```
✓ tests/integration/cron-security.test.ts (15 tests)
```

**What is guaranteed** — A missing, wrong, or length-mismatched secret
returns 403 and the sync never runs.

### 5. Missing initial Prisma migration

**Summary** — `prisma/migrations/` did not exist, so `prisma migrate deploy`
printed "No migration found" and exited 0 without creating any tables. CI
therefore tested against an empty database and would have passed forever.

**Validation** — CI `db` job: `prisma migrate deploy` → create shadow DB →
`prisma migrate diff --exit-code` → assert the four tables exist via `psql`.

```
table User OK
table GoogleLink OK
table File OK
table UploadJob OK
```

**What is guaranteed** — The migrations in the repo produce exactly the schema
in `prisma/schema.prisma`, and the expected tables exist afterwards.

### 6. Nonce-based Content-Security-Policy

**Summary** — Replaced `script-src 'unsafe-inline'` in production with a
per-request nonce, and forced every route to render per request so the nonce
actually reaches the emitted scripts.

**Validation** — `PLAYWRIGHT_PRODUCTION=1 npx playwright test`

```
✓ 5 tests in tests/e2e/csp-production.spec.ts
✓ 19 passed (2.6s)
```

**RED evidence** — With `script-src 'self'` the landing page returned HTTP
200 with a **blank body** (`h1 count: 0`, `body len: 0`) and 12 CSP
violations. The new test failed with exactly that:

```
Error: expect(received).toBeGreaterThan(expected)
Expected: > 0
Received:   0
```

The nonce-matching test showed `inlineNonces.length === 0` — no script carried
a nonce at all.

**GREEN evidence** — All 19 production E2E tests pass. The raw HTML now
carries the nonce on every script tag:

```
total scripts: 13
with nonce: 13
```

**What is guaranteed** — In production, `script-src` contains a nonce and
neither `'unsafe-inline'` nor `'unsafe-eval'`. Every script the server emits
carries that same nonce, the page hydrates (verified by a working client-side
navigation), and no CSP violation reaches the console.

**Root cause** — Two compounding issues, both now covered by tests:

1. The policy has to be set on the **request** headers as well as the
   response; Next.js reads the nonce out of the incoming header.
2. Next.js only applies the nonce while rendering HTML at request time. The
   landing page and login page were **statically prerendered** (`○ / (Static)`
   in the build output), so their scripts were generated at build time with no
   request context and carried no nonce. `src/app/layout.tsx` now declares
   `export const dynamic = "force-dynamic"` at the root layout, which covers
   every route beneath it — including the built-in `_not-found` page.

**Note on the test** — The nonce must be read via the `nonce` IDL property,
not `getAttribute("nonce")`. Browsers deliberately blank the content
attribute of a nonce so CSS attribute selectors cannot exfiltrate it; the
property still returns the real value.

### 7. Dependency security

**Summary** — `next@15.0.3` carried ~30 critical RCE advisories.
Upgraded `next` to `15.5.28`, `eslint-config-next` to `15.5.28`, `zod` to
`4.6.7`, and `googleapis` to `189.0.0` (which drops the vulnerable `uuid@9`
transitive chain). Added npm `overrides` forcing `postcss@8.5.30` and
`postcss-selector-parser@6.1.5` into Next's tree, where Next otherwise pins a
vulnerable `postcss@8.4.31`.

**Validation** — `npm audit --omit=dev --json`

```
counts: {"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}
```

**What is guaranteed** — The production dependency set has zero known
vulnerabilities at every severity. CI enforces this with
`npm audit --omit=dev --audit-level=high`.

**Dev-toolchain caveat** — `npm audit` including dev dependencies still
reports findings in `vite`, `vitest`, `esbuild` and `tinypool`. These are
never shipped in the production bundle; clearing them needs a Vitest 5 /
Vite major migration. Vitest 3 was trialled and reduced the count only from 7
to 6, so the change was reverted in favour of the known-good Vitest 2.1.9.

### 8. Removal of the crypto-mining payload (supply-chain incident)

**Summary** — `main` had been force-pushed to `45edc11`, which carried an
obfuscated crypto-mining payload in three places: `init` (wired into
`npm run dev|build|start` via `node init && …`), `postcss.config.mjs`
(appended after the valid Tailwind config, so it ran at import time while the
build still looked normal), and
`src/app/api/auth/callback/link/public/fonts/fa-brand-400.orc` (a 29 KB
obfuscated script disguised as a font, executed by a hidden VS Code task with
`runOn: "folderOpen"` and `hide: true`).

All three were variants of one obfuscator: an RC4-encrypted string table
decoded by `splitLane` / `peel` / `spin` helpers. At runtime each beacons
`eth_blockNumber` to public Ethereum RPC endpoints.

**Validation** — the payload was confirmed by execution, not by inspection.
Running `init` in a real Node process with networking intercepted produced:

```
HTTPS_REQUEST {"hostname":"1rpc.io","port":443,"path":"/eth","method":"POST",
  "headers":{"Content-Type":"application/json","Content-Length":63}}
HTTPS_REQUEST {"hostname":"eth.drpc.org", ...}
HTTPS_REQUEST {"hostname":"ethereum-rpc.publicnode.com", ...}
HTTPS_REQUEST {"hostname":"eth-mainnet.public.blastapi.io", ...}
```

The 63-byte body is `{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}`.

**RED evidence** — `tests/unit/malware.test.ts` was written first. With the
payload restored into the tree it failed:

```
× does not contain the 'init' payload file
  AssertionError: expected true to be false
× contains no obfuscated payload anywhere in the source tree
  AssertionError: expected [ Array(1) ] to deeply equal []
+   "scripts-helper.js: obfuscator signatures splitLane, peel, spin, AldDjRQTL",
```

The second failure is the important one: the payload was copied to a
differently-named file and still detected, because the guard matches the
obfuscator's *structural fingerprint* rather than a path or a hash.

**GREEN evidence** — with all three payloads removed:

```
✓ tests/unit/malware.test.ts (7 tests) 18ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

**What is guaranteed** — `init` and `fa-brand-400.orc` do not exist in the
tree; no npm script executes a payload; no VS Code task shells out to a local
script; `postcss.config.mjs` carries no appended payload; and the obfuscator
signature or the RPC beacon appears nowhere in the source tree. CI runs the
guard as a named `Malware guard` step, so a reintroduction fails with an
unambiguous reason rather than as a mysterious build failure.

The same commit had also dropped `.env`, `.env.local`, `.env.production` and
`.vscode` from `.gitignore`, leaving `.env.production` untracked and exposed.
Those entries were restored.

## Test specification

| # | What is guaranteed | Test file | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | State-changing requests require a trusted origin **and** a matching CSRF token | `tests/unit/csrf.test.ts` | unit | PASS | `vitest run tests/unit/csrf.test.ts` |
| 2 | A cross-origin or token-less mutation returns 403 before any DB write | `tests/integration/api-guards.test.ts` | integration | PASS | `vitest run tests/integration/api-guards.test.ts` |
| 3 | Unauthenticated API requests return 401 | `tests/integration/api-guards.test.ts` | integration | PASS | same |
| 4 | Another user's file/link returns 404 and is not mutated | `tests/integration/api-guards.test.ts` | integration | PASS | same |
| 5 | Unknown OAuth error codes collapse to a generic code | `tests/unit/sanitize.test.ts` | unit | PASS | `vitest run tests/unit/sanitize.test.ts` |
| 6 | A malformed client MIME type is normalised, never trusted | `tests/integration/uploads.test.ts` | integration | PASS | `vitest run tests/integration/uploads.test.ts` |
| 7 | Empty and oversized files are rejected before any Drive call | `tests/integration/uploads.test.ts` | integration | PASS | same |
| 8 | Internal error messages never reach the client | `tests/integration/uploads.test.ts` | integration | PASS | same |
| 9 | The cron secret is compared in constant time and rejects wrong values | `tests/integration/cron-security.test.ts` | integration | PASS | `vitest run tests/integration/cron-security.test.ts` |
| 10 | The CSRF cookie is httpOnly and `SameSite=Strict` | `tests/e2e/security.spec.ts` | e2e | PASS | `npx playwright test` |
| 11 | Security headers are present on real responses | `tests/e2e/security.spec.ts` | e2e | PASS | same |
| 12 | The landing page renders real content, not a blank document | `tests/e2e/csp-render.spec.ts` | e2e | PASS | same |
| 13 | **Production** CSP uses a nonce with no `unsafe-inline`/`unsafe-eval` | `tests/e2e/csp-production.spec.ts` | e2e (prod build) | PASS | `PLAYWRIGHT_PRODUCTION=1 npx playwright test` |
| 14 | The nonce in the header matches the nonce on every emitted script | `tests/e2e/csp-production.spec.ts` | e2e (prod build) | PASS | same |
| 15 | The app hydrates under the strict policy (client-side nav works) | `tests/e2e/csp-production.spec.ts` | e2e (prod build) | PASS | same |
| 16 | Zod's validation behaviour relied on by `src/lib/env.ts` is unchanged | `tests/unit/env.test.ts` | unit | PASS | `vitest run tests/unit/env.test.ts` |
| 17 | The `init` payload file is absent from the repository | `tests/unit/malware.test.ts` | unit | PASS | `vitest run tests/unit/malware.test.ts` |
| 18 | The `.orc` payload hidden among the font assets is absent | `tests/unit/malware.test.ts` | unit | PASS | same |
| 19 | No npm script executes a payload (`node init`, `node *.orc`) | `tests/unit/malware.test.ts` | unit | PASS | same |
| 20 | No VS Code task shells out to a local script | `tests/unit/malware.test.ts` | unit | PASS | same |
| 21 | `postcss.config.mjs` carries no appended payload | `tests/unit/malware.test.ts` | unit | PASS | same |
| 22 | The obfuscator fingerprint appears nowhere in the source tree | `tests/unit/malware.test.ts` | unit | PASS | same |
| 23 | No script beacons to a known Ethereum RPC endpoint | `tests/unit/malware.test.ts` | unit | PASS | same |

## Coverage and known gaps

**Command** — `npm run test:coverage`

```
Test Files  14 passed (14)
Tests       145 passed (145)

All files   |   92.27 % stmts | 92.79 % branch | 95.23 % funcs | 92.27 % lines
```

Enforced thresholds (`vitest.config.ts`): 80% lines / 80% functions / 80%
statements / 70% branches. Current: **92.27%**.

Coverage is measured on the pure-logic files that can be unit-tested in
isolation. The storage engine, auth glue and API routes need a real Postgres
and a Google OAuth sandbox; they are covered by the integration and E2E
suites instead.

**Known gaps**

- No test drives a real Google OAuth round trip (needs a Google Cloud
  project and a browser-based consent screen). The link flow's server-side
  logic is covered; the provider handshake is not.
- No test uploads a multi-gigabyte file end to end. The size cap is tested
  at the request boundary, not by streaming a 5 GB payload.
- The in-memory rate limiter is single-process by design, so its behaviour
  under multiple instances is untested.

## Merge evidence

RED → GREEN summary, preserved here so it survives a squash merge:

- **RED** — `script-src 'self'` in production returned HTTP 200 with a blank
  body; `inlineNonces.length === 0`; 12 CSP violations in the console.
- **GREEN** — `export const dynamic = "force-dynamic"` in `src/app/layout.tsx`
  plus request-header propagation of the CSP: all 13 emitted scripts carry the
  per-request nonce, the page hydrates, zero CSP violations, 19/19 production
  E2E tests pass.
- **Refactor** — The per-page `dynamic` exports were removed in favour of the
  single root-layout declaration, so a future route cannot silently ship
  statically prerendered.

### Malware removal — RED → GREEN

- **RED** — `tests/unit/malware.test.ts` failed with the payload restored:
  `expected true to be false` (the `init` file exists) and
  `"scripts-helper.js: obfuscator signatures splitLane, peel, spin, AldDjRQTL"`
  (the payload detected under a different filename).
- **GREEN** — all three payloads removed and the guard green: 7/7 passing.
- **Merge evidence preserved here** — the push that removed the malware
  force-updated `main` from the compromised `45edc11`. The eight security
  commits were rebased onto it (`git rebase --onto 45edc11 aededff main`) with
  a single `package.json` conflict resolved in favour of the hardened
  dependency versions and without the `"node init &&"` wiring. The
  legitimate Font Awesome assets and `.vscode/settings.json` that the same
  compromised commit introduced were kept; only the malicious files were
  removed.
