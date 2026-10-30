"use client";

/**
 * Client-side CSRF token plumbing.
 *
 * The token itself lives in an httpOnly cookie (so XSS cannot read it from
 * `document.cookie`). Instead, the server component that renders the page
 * reads the token server-side and passes it down as a prop. This module
 * holds that prop in React state and exposes it for attaching to
 * state-changing requests as the `x-csrf-token` header.
 *
 * A cross-site attacker can make the victim's browser *send* our cookie,
 * but the Same-Origin Policy prevents them from *reading* it — so they
 * cannot construct a matching header, and the request is rejected.
 */
import { useCallback, useState } from "react";

export const CSRF_HEADER = "x-csrf-token";

export interface CsrfHandle {
  /** The current token, or "" before it has been provided. */
  token: string;
  /** Build fetch init with the CSRF header attached. */
  withCsrf: (init?: RequestInit) => RequestInit;
}

export function useCsrf(initialToken: string): CsrfHandle {
  const [token] = useState(initialToken);

  const withCsrf = useCallback(
    (init: RequestInit = {}): RequestInit => ({
      ...init,
      headers: {
        ...(init.headers ?? {}),
        [CSRF_HEADER]: token,
      },
    }),
    [token]
  );

  return { token, withCsrf };
}
