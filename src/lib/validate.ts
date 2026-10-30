/**
 * Filename validation. These names are user-controlled but only ever end up
 * (a) in the user's Google Drive and (b) in our database. They are NEVER used
 * to build a server-side filesystem path. Still, we apply light validation so
 * that pathological inputs (empty, control chars, 10 MB filenames) are
 * rejected at the route layer.
 */
const MAX_FILENAME = 255;

export function isValidFilename(name: string): boolean {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.trim().length === 0) return false;
  if (name.length > MAX_FILENAME) return false;
  if (name.includes("\u0000")) return false;
  // Allow any non-control unicode character, plus spaces, dashes, dots, parens.
  // Disallow path separators and newlines.
  if (/[\\/\n\r\t]/.test(name)) return false;
  return true;
}

const MIME_RE = /^[a-zA-Z0-9!#$&^_.+-]{1,128}\/[a-zA-Z0-9!#$&^_.+-]{1,128}$/;

/**
 * MIME-type validation. We accept `type/subtype` per RFC 6838 syntax subset.
 * Drive will accept any string the user provides, so we keep this loose —
 * its purpose is to reject obviously empty or malicious values.
 */
export function isValidMime(mime: string): boolean {
  if (typeof mime !== "string") return false;
  if (mime.length === 0) return false;
  return MIME_RE.test(mime);
}

/**
 * Sanitise a link-flow error code before it is rendered in the dashboard.
 *
 * The OAuth callback redirects to `/dashboard?link_error=<code>` and the
 * dashboard reflects that value into the page. The code may be supplied by
 * the OAuth provider (the `error` query param) or by us, but it still
 * arrives as an untrusted query string.
 *
 * Two things go wrong if we reflect it verbatim:
 *   1. `decodeURIComponent` throws `URIError` on malformed percent-escapes
 *      (e.g. `%E0%A4%A`), which crashes the dashboard with a 500.
 *   2. The raw value is unbounded and may contain provider-internal detail
 *      (e.g. a full token-exchange error body) that we should not echo.
 *
 * We therefore decode defensively, then reduce the result to a short,
 * printable, single-line token. Anything unrecognised collapses to a
 * generic code so we never leak arbitrary text into the DOM.
 */
const KNOWN_LINK_ERRORS = new Set([
  "expired_state",
  "state_mismatch",
  "email_not_verified",
  "exchange_failed",
  "userinfo_failed",
  "rate_limited",
  "access_denied",
  "server_error",
  "temporarily_unavailable",
  "invalid_scope",
  "consent_denied",
]);

export const GENERIC_LINK_ERROR = "link_failed";

export function sanitizeLinkError(raw: string): string {
  if (typeof raw !== "string") return GENERIC_LINK_ERROR;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-escape — fall through with the raw value.
    decoded = raw;
  }

  // Normalise to a safe token shape: lowercase alphanumerics and underscores.
  const token = decoded.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");

  if (!token || token.length > 64) return GENERIC_LINK_ERROR;
  if (KNOWN_LINK_ERRORS.has(token)) return token;
  return GENERIC_LINK_ERROR;
}

/**
 * Normalise a client-supplied MIME type.
 *
 * The browser's `File.type` is attacker-controlled: a client can send any
 * string it likes in the multipart part's `Content-Type`. We validate the
 * shape and fall back to a safe generic type when it does not parse, rather
 * than forwarding an arbitrary string into the Drive API.
 */
export function normalizeMimeType(raw: string | undefined | null): string {
  if (!raw) return "application/octet-stream";
  const trimmed = raw.split(";")[0].trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 128) return "application/octet-stream";
  if (!isValidMime(trimmed)) return "application/octet-stream";
  return trimmed;
}
