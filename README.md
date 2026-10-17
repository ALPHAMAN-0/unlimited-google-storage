# Unlimited Google Storage

> Distribute uploads across multiple Google accounts and get **N × 15 GB** of free storage.

Every Google account ships with 15 GB of free Google Drive storage. **Unlimited Google Storage** lets you sign in once, link as many Google accounts as you own, and then drop files in. The app automatically picks the linked account with the most free space for every upload, and tracks which file lives where so you can download, delete, and manage everything from a single dashboard.

## Features

- 🔗 **Link unlimited Google accounts** — each one adds 15 GB (or whatever its plan allows) to your pool.
- 🚀 **Auto-distribute uploads** — the app picks the account with the most free space; ties broken by least-recently-used.
- 📁 **Single dashboard** — see all your files regardless of which account they're on.
- 📥 **Resumable uploads** — drop a multi-GB file and the network can drop out, the upload picks up where it left off.
- 🔐 **Encrypted tokens at rest** — OAuth refresh tokens are AES-256-GCM encrypted in the database.
- 🛡 **Minimal Drive scope** — we only request `drive.file`, so we can never read files you didn't upload through the app.
- 🔒 **Row-level ownership** — every file belongs to one user; downloads and deletes are auth-gated and ownership-checked.

## Quickstart

```bash
git clone https://github.com/ALPHAMAN-0/unlimited-google-storage.git
cd unlimited-google-storage
cp .env.example .env.local       # fill in values (see below)
npm ci
npx prisma migrate dev
npm run dev
```

Open <http://localhost:3000>, sign in with Google, then click **Add another Google account** on the dashboard to link more.

### Required environment variables

| Var | What |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. `postgresql://user:pass@localhost:5432/ugs` |
| `NEXTAUTH_SECRET` | Random 32+ char string. `openssl rand -base64 32` |
| `NEXTAUTH_URL` | `http://localhost:3000` in dev, your prod URL otherwise |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | Same as above |
| `TOKEN_ENCRYPTION_KEY` | 32 random bytes, base64. `openssl rand -base64 32` |
| `MAX_UPLOAD_BYTES` | Optional, default `5368709120` (5 TB) |
| `CRON_SECRET` | Optional, protects `/api/cron/sync` |

### Google Cloud project setup (one-time)

1. Go to <https://console.cloud.google.com>.
2. Create a new project.
3. **APIs & Services → Library** → enable **Google Drive API**.
4. **APIs & Services → OAuth consent screen** → External → fill in app name + your email.
5. **Credentials → Create credentials → OAuth client ID** → Web application.
6. Authorized JavaScript origins: `http://localhost:3000` (and your prod URL).
7. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` AND `http://localhost:3000/api/auth/callback/link`.
8. Copy client ID and secret into `.env.local`.

## Production deployment

See [`docs/DEPLOY.md`](./docs/DEPLOY.md). The short version:

- App: Vercel (or any Node host).
- Database: Neon / Supabase / RDS Postgres.
- Build command: `prisma generate && next build`.
- Set a Vercel Cron to hit `/api/cron/sync` every 10 minutes with the `CRON_SECRET` header.

## Architecture

- **Next.js 14** App Router, TypeScript, Tailwind, shadcn/ui.
- **NextAuth v5** for sign-in (one Google account) and a separate `/api/auth/link` flow for linking additional accounts.
- **Prisma** for typed database access; PostgreSQL in prod.
- **`googleapis`** for the Drive v3 client (resumable uploads, about quota, file create/delete/get).
- **AES-256-GCM** token encryption via Node's `crypto`.

```
src/
  app/                 ← pages, layouts, API routes
  components/          ← UI components
  lib/                 ← shared utilities (auth, crypto, validation)
  server/
    storage/           ← drive-client, picker, uploader, sync
prisma/
  schema.prisma
tests/
  unit/  integration/  e2e/
```

## License

MIT — see [`LICENSE`](./LICENSE).
