# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.0] — 2026-10-17

### Added
- NextAuth v5 sign-in with Google (one account as the primary sign-in).
- Separate OAuth flow to *link* additional Google accounts under `drive.file` scope.
- AES-256-GCM encryption of OAuth tokens at rest.
- Auto-distributing storage engine: uploads go to the linked account with the most free space (LRU tie-break).
- Drive client wrapper with automatic token refresh.
- Resumable uploads via Google Drive v3.
- Dashboard: linked-account cards, drag-and-drop dropzone, file manager table, per-account storage meter.
- Pagination, soft-delete, and ownership checks on every endpoint.
- Per-user rate limiting on uploads (60/10min), link (5/10min), and sync (6/min).
- Security headers via `src/middleware.ts`: strict CSP, HSTS (prod), X-Frame-Options, Referrer-Policy, Permissions-Policy.
- Health endpoint at `GET /api/health` for uptime monitoring.
- Cron endpoint at `POST /api/cron/sync` for periodic storage-quota refresh, protected by `CRON_SECRET`.
- Prisma schema (User, GoogleLink, File, UploadJob) for Postgres.
- Vitest unit tests (35 cases) for the storage picker, crypto, link state, rate limiter, validators, and formatters.
- Playwright e2e smoke tests for the landing/login/dashboard routes.
- `docs/DEPLOY.md` and `docs/SECURITY.md`.

### Security
- Bumped to patched versions: `next@15.0.3`, `next-auth@5.0.0-beta.32`, `googleapis@149.x`.
- Zero critical runtime vulnerabilities (6 highs remain in Tailwind build-time sub-deps, documented).
- Full security review report in `docs/SECURITY.md` — PASS.
