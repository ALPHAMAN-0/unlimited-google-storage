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
 *
 * ## CSP and nonces
 *
 * Next.js emits inline bootstrap scripts for React Server Component payloads.
 * A plain `script-src 'self'` therefore blocks the app from rendering at
 * all — we verified this: the page came back blank with "Executing inline
 * script violates the following Content Security Policy directive" errors.
 *
 * The correct fix is a **nonce-based** CSP. We generate a random nonce per
 * request, put it in the CSP header, and Next.js reads that same nonce out
 * of the header and stamps it onto every inline script it emits. The result
 * is a strict policy with no `'unsafe-inline'`, while the app still works.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Generate a per-request nonce.
 *
 * The middleware runs on the Edge runtime, which has no `node:crypto`, so we
 * use the Web Crypto API. `crypto.getRandomValues` is available in Edge and
 * in Node 18+.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function middleware(req: NextRequest) {
  // One nonce per request. Next.js picks this up from the CSP header itself
  // and applies it to the inline scripts it injects.
  const nonce = generateNonce();

  const scriptSrc =
    process.env.NODE_ENV === "development"
      ? // The dev server needs eval for React Fast Refresh, and its HMR
        // client injects inline scripts that we cannot nonce.
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
      : // Production: nonce-based, no 'unsafe-inline' anywhere.
        //
        // Note: we deliberately do NOT add `'strict-dynamic'`. In CSP3,
        // `strict-dynamic` disables the `'self'` host-source for script
        // elements, which would block Next.js's own external `<script
        // src="/_next/static/...">` bundles — we verified that it breaks the
        // app with "Loading the script ... violates the following Content
        // Security Policy directive". With `'self'` plus a nonce, external
        // same-origin bundles load and only *injected* inline scripts need
        // the nonce, which Next.js supplies.
        `script-src 'self' 'nonce-${nonce}'`;

  const csp = [
    "default-src 'self'",
    scriptSrc,
    // Next.js injects critical CSS inline; styles are not a script
    // execution vector in the same way, so 'unsafe-inline' stays here.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://accounts.google.com https://www.googleapis.com https://oauth2.googleapis.com",
    "frame-src https://accounts.google.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "media-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join("; ");

  // Next.js reads the nonce out of the *request*'s Content-Security-Policy
  // header (see `getScriptNonceFromHeader` in next/dist/server/app-render).
  // Setting it only on the response leaves the inline bootstrap scripts
  // un-nonced, and the browser blocks them — the page renders blank.
  // So we forward the policy on the request as well.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set(
    "Permissions-Policy",
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), microphone=(), payment=(), usb=()"
  );
  if (process.env.NODE_ENV === "production") {
    res.headers.set(
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
