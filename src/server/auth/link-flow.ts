/**
 * "Link a Google account" OAuth flow.
 *
 * This is a *separate* OAuth client of our own, distinct from NextAuth's.
 * NextAuth is responsible for sign-in. Linking is initiated while the user
 * is already signed in, and the resulting tokens belong to a *Drive* scope
 * (`drive.file`) so we can upload to that account.
 *
 * Flow:
 *   1. User clicks "Add another Google account" → GET /api/auth/link.
 *   2. We generate a CSRF `state` nonce, store it in a short-lived
 *      signed cookie alongside the `userId`, and 302 to Google.
 *   3. Google redirects to /api/auth/callback/link with `code` + `state`.
 *   4. We verify the state, exchange `code` for tokens, encrypt them, and
 *      upsert a `GoogleLink` row.
 *
 * We request the minimal Drive scope: `drive.file`. This means we can only
 * read/write files *we* created via this app — we never have access to the
 * user's existing Drive contents. If the user later unlinks the account we
 * revoke the refresh token server-side.
 */
import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export const LINK_STATE_COOKIE = "ugs_link_state";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface LinkState {
  state: string;
  userId: string;
  issuedAt: number;
}

function secret(): Buffer {
  return Buffer.from(env.NEXTAUTH_SECRET, "utf8");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function verify(payload: string, sig: string): boolean {
  const expected = Buffer.from(sign(payload), "utf8");
  const actual = Buffer.from(sig, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function buildLinkStateCookie(userId: string): { cookie: string; state: string } {
  const state = randomBytes(24).toString("base64url");
  const payload = JSON.stringify({ state, userId, issuedAt: Date.now() });
  const sig = sign(payload);
  const cookieValue = Buffer.from(payload, "utf8").toString("base64url") + "." + sig;
  return { cookie: cookieValue, state };
}

export function parseAndVerifyLinkStateCookie(raw: string): LinkState | null {
  const parts = raw.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const payload = Buffer.from(body, "base64url").toString("utf8");
  if (!verify(payload, sig)) return null;
  try {
    const parsed = JSON.parse(payload) as LinkState;
    if (Date.now() - parsed.issuedAt > STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  id_token?: string;
  token_type: string;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<GoogleTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as GoogleTokens;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google user info: ${res.status}`);
  }
  return (await res.json()) as GoogleUserInfo;
}

export async function revokeGoogleToken(token: string): Promise<void> {
  // Best-effort: a failed revocation isn't fatal (we still delete our record).
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  }).catch(() => undefined);
}

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const OPENID_EMAIL_SCOPE = "openid email";

export function buildAuthorizationUrl(opts: {
  state: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: opts.redirectUri,
    scope: `${OPENID_EMAIL_SCOPE} ${DRIVE_FILE_SCOPE}`,
    access_type: "offline",
    prompt: "consent", // force a refresh_token to be issued
    state: opts.state,
    include_granted_scopes: "true",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Read the CSRF cookie, verify its HMAC, and clear it (one-time use).
 * Returns `null` if the cookie is missing, malformed, or expired.
 */
export async function consumeLinkStateCookie(): Promise<LinkState | null> {
  const c = await cookies();
  const raw = c.get(LINK_STATE_COOKIE)?.value;
  if (!raw) return null;
  const parsed = parseAndVerifyLinkStateCookie(raw);
  // Always clear the cookie, even on failure, so a single cookie can never
  // be replayed against a future link attempt.
  c.delete(LINK_STATE_COOKIE);
  return parsed;
}

export async function setLinkStateCookie(userId: string): Promise<{ state: string }> {
  const { cookie, state } = buildLinkStateCookie(userId);
  const c = await cookies();
  c.set(LINK_STATE_COOKIE, cookie, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 minutes
  });
  return { state };
}
