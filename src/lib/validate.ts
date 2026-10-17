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
