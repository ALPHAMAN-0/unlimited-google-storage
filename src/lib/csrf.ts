/**
 * CSRF protection for state-changing API routes.
 *
 * Why this exists
 * ---------------
 * Every mutating route in this app (`POST /api/uploads`, `DELETE /api/files`,
 * `POST /api/links/sync`, ...) authenticates with the NextAuth session cookie,
 * which is issued with `SameSite=Lax`. `SameSite=Lax` is a *single* layer of
 * defence: it stops the classic cross-site POST form / `fetch()` from a
 * foreign origin, but it does **not** stop:
 *
 *   - Same-site attackers (a sibling subdomain, or any XSS on the same
 *     registrable domain — including our own `*.vercel.app` neighbours).
 *   - Browser-level edge cases where Lax is downgraded.
 *   - Any future route that reads a token from a non-cookie source.
 *
 * OWASP's CSRF cheat sheet requires defence-in-depth: an `Origin` (or
 * `Referer`) check *plus* a token. We implement both:
 *
 *   1. **Origin/Referer allow-list** — the request's origin must match the
 *      app's own origin. This is the strong check.
 *   2. **Double-submit token** — a per-session random token issued in an
 *      httpOnly cookie and echoed back in a custom request header. A
 *      cross-site attacker can cause the victim's browser to *send* our
 *      cookie, but cannot *read* it to construct the matching header, because
 *      the Same-Origin Policy blocks cross-origin reads of the response.
 *
 * The double-submit token is stored in a cookie the client cannot read, and
 * mirrored into a non-cookie header. We deliberately avoid the more common
 * "token in a JS-readable cookie" variant: that requires reading a cookie
 * from JS, which would need to be non-httpOnly and therefore XSS-exposed.
 *
 * Instead the token is handed to the client through a server component →
 * client component prop, so it never lives in a JS-readable cookie.
 *
 * ## Token lifecycle
 *
 * `ensureCsrfToken()` lazily creates the token if absent and returns it. A
 * route handler calls `assertCsrf(req)` which:
 *   - verifies the `Origin`/`Referer` header is same-origin, and
 *   - verifies `x-csrf-token` matches the cookie value (constant-time).
 *
 * The token is rotated on sign-out by deleting the cookie.
 */
import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";

export const CSRF_COOKIE = "ugs_csrf";
export const CSRF_HEADER = "x-csrf-token";

/**
 * Origins that are allowed to issue state-changing requests.
 *
 * The allow-list is built from *trusted* sources only:
 *   - the configured `NEXTAUTH_URL` origin, and
 *   - the origin of the request URL itself (the server knows its own host).
 *
 * The request's `Origin` **header** is deliberately NOT added here. Trusting
 * it would make the check a no-op: any attacker could simply send
 * `Origin: https://evil.example.com` and be allow-listed by definition.
 *
 * @param requestUrl the URL the request was made to (server-controlled)
 */
export function allowedOrigins(requestUrl: string | null): string[] {
  const origins = new Set<string>();

  const configured = process.env.NEXTAUTH_URL;
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      /* ignore malformed config — env validation already reports it */
    }
  }

  if (requestUrl) {
    try {
      origins.add(new URL(requestUrl).origin);
    } catch {
      /* ignore malformed request URL */
    }
  }

  if (process.env.NODE_ENV !== "production") {
    // Local development: the Next dev server may bind any port.
    origins.add("http://localhost:3000");
    origins.add("http://127.0.0.1:3000");
  }

  return [...origins];
}

/**
 * Verify the request's `Origin` (preferred) or `Referer` (fallback) header
 * points at this app. Returns true when the request is same-origin.
 *
 * A missing `Origin` header is only tolerated for non-browser clients
 * (curl, server-to-server) — but in production we require it, because every
 * browser request that can mutate state sends one.
 */
export function isSameOrigin(req: Request): boolean {
  const allowed = allowedOrigins(req.url);

  const origin = req.headers.get("origin");
  if (origin) {
    return allowed.includes(origin);
  }

  // No Origin header. Fall back to Referer.
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return allowed.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  // Neither header present. This is a non-browser client (curl, server-side
  // fetch). In production we reject it outright; in dev/test we allow it so
  // the API remains scriptable.
  return process.env.NODE_ENV !== "production";
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Read the CSRF token from the cookie and validate it against the request
 * header. Returns the token value if the pair matches, else null.
 */
export function verifyCsrfPair(cookieValue: string | undefined, headerValue: string | null): boolean {
  if (!cookieValue || !headerValue) return false;
  return safeEqual(cookieValue, headerValue);
}

/**
 * Ensure a CSRF token cookie exists, creating one if needed. Returns the
 * token. The cookie is httpOnly (so JS can't read it) and SameSite=Strict.
 */
export async function ensureCsrfToken(): Promise<string> {
  const store = await cookies();
  const existing = store.get(CSRF_COOKIE)?.value;
  if (existing && existing.length >= 32) return existing;

  const token = randomBytes(32).toString("base64url");
  store.set(CSRF_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return token;
}

/**
 * Full CSRF assertion for a state-changing request.
 *
 * Checks, in order:
 *   1. Same-origin (`Origin` / `Referer`).
 *   2. Double-submit token (`x-csrf-token` header === cookie).
 *
 * @param req       the incoming request
 * @param token     the token the client is expected to have (from `ensureCsrfToken`)
 */
export function assertCsrf(req: Request, token: string | undefined): { ok: true } | { ok: false; reason: string } {
  if (!isSameOrigin(req)) {
    return { ok: false, reason: "bad_origin" };
  }
  const header = req.headers.get(CSRF_HEADER);
  if (!verifyCsrfPair(token, header)) {
    return { ok: false, reason: "bad_token" };
  }
  return { ok: true };
}

/**
 * Clear the CSRF cookie (called on sign-out).
 */
export async function clearCsrfToken(): Promise<void> {
  const store = await cookies();
  store.delete(CSRF_COOKIE);
}
