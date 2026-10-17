/**
 * Next.js middleware: sets a strict, modern set of security headers on every
 * response. We intentionally do not set a CSP `connect-src` for blob: since
 * we don't use it; the only third-party origin we contact is Google, which
 * goes through Next.js server-side API routes, not the browser.
 *
 * Notes:
 *  - `frame-ancestors 'none'` — clickjacking protection.
 *  - `X-Content-Type-Options: nosniff` — prevent MIME sniffing.
 *  - `Referrer-Policy: strict-origin-when-cross-origin` — only send origin to
 *    other origins, full URL on same-origin.
 *  - HSTS only in production (we're talking to localhost in dev).
 *  - Permissions-Policy disabled all the things we don't use (camera, mic,
 *    geolocation, etc.) so an XSS can't enable them.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
  const headers = res.headers;

  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // Next.js dev tooling needs eval; the production build does not.
      process.env.NODE_ENV === "development"
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com",
      "frame-src https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()"
  );
  if (process.env.NODE_ENV === "production") {
    headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    );
  }

  return res;
}

export const config = {
  matcher: [
    // Run on everything except static files and the favicon.
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
