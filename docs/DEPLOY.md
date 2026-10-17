# Deployment

## Vercel (recommended)

1. Push your fork to GitHub.
2. Import the repo in Vercel.
3. Set environment variables (see `.env.example`):
   - `DATABASE_URL` — point at a managed Postgres (Neon / Supabase / RDS).
   - `NEXTAUTH_SECRET` — `openssl rand -base64 32`.
   - `NEXTAUTH_URL` — your production URL, e.g. `https://ugs.example.com`.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
   - `TOKEN_ENCRYPTION_KEY` — `openssl rand -base64 32`. **Back this up; if you lose it, all stored tokens become unrecoverable.**
   - `MAX_UPLOAD_BYTES` (default 5 TB).
   - `CRON_SECRET` — random string, sent by Vercel Cron.
4. Add the same `GOOGLE_CLIENT_ID` redirect URIs in Google Cloud Console:
   - `https://ugs.example.com/api/auth/callback/google`
   - `https://ugs.example.com/api/auth/callback/link`
5. Build command: `prisma generate && next build` (Vercel detects this from `package.json`).
6. Cron: create a Vercel Cron that hits `POST /api/cron/sync` every 10 minutes with the `CRON_SECRET` as the `x-cron-secret` header.
7. First deploy: run `npx prisma migrate deploy` against your production DB (Vercel build does not run migrations on Postgres by default; either add a postinstall step or run migrations manually).

## Self-host (Docker)

```bash
docker compose up -d
```

This starts the app on `:3000` and a Postgres on `:5432`. The app container runs migrations on startup (`prisma migrate deploy`).

## Backups

- **Database**: managed Postgres (Neon/Supabase/RDS) handles automated backups.
- **TOKEN_ENCRYPTION_KEY**: store in your secret manager (Vercel env, AWS Secrets Manager, etc.). Without it, you cannot decrypt stored tokens and users will need to re-link their Google accounts.
