import { describe, it, expect } from "vitest";
import {
  sanitizeLinkError,
  normalizeMimeType,
  GENERIC_LINK_ERROR,
} from "@/lib/validate";

/**
 * Input-sanitisation tests for values that are reflected back into the
 * dashboard or forwarded to the Drive API.
 */

describe("sanitizeLinkError", () => {
  it("passes through known error codes unchanged", () => {
    expect(sanitizeLinkError("expired_state")).toBe("expired_state");
    expect(sanitizeLinkError("state_mismatch")).toBe("state_mismatch");
    expect(sanitizeLinkError("email_not_verified")).toBe("email_not_verified");
    expect(sanitizeLinkError("rate_limited")).toBe("rate_limited");
  });

  it("collapses an unknown code to the generic error", () => {
    expect(sanitizeLinkError("some_unknown_thing")).toBe(GENERIC_LINK_ERROR);
  });

  it("does not throw on a malformed percent-escape", () => {
    // "%E0%A4%A" is an invalid UTF-8 percent-escape. decodeURIComponent
    // throws URIError on it — the dashboard must not 500.
    expect(() => sanitizeLinkError("%E0%A4%A")).not.toThrow();
    expect(sanitizeLinkError("%E0%A4%A")).toBe(GENERIC_LINK_ERROR);
  });

  it("decodes a percent-encoded known code", () => {
    expect(sanitizeLinkError("expired%5Fstate")).toBe("expired_state");
  });

  it("strips HTML/script tags", () => {
    const out = sanitizeLinkError("<script>alert(1)</script>");
    expect(out).toBe(GENERIC_LINK_ERROR);
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });

  it("strips angle brackets and quotes from output", () => {
    const out = sanitizeLinkError('"><img src=x onerror=alert(1)>');
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain('"');
  });

  it("rejects an over-long value", () => {
    const out = sanitizeLinkError("a".repeat(500));
    expect(out).toBe(GENERIC_LINK_ERROR);
  });

  it("returns the generic error for an empty string", () => {
    expect(sanitizeLinkError("")).toBe(GENERIC_LINK_ERROR);
  });

  it("returns the generic error for a non-string input", () => {
    expect(sanitizeLinkError(undefined as unknown as string)).toBe(GENERIC_LINK_ERROR);
    expect(sanitizeLinkError(null as unknown as string)).toBe(GENERIC_LINK_ERROR);
  });

  it("never returns a value containing whitespace or newlines", () => {
    const out = sanitizeLinkError("expired state\nsecond line");
    expect(out).not.toMatch(/\s/);
  });
});

describe("normalizeMimeType", () => {
  it("keeps a valid mime type", () => {
    expect(normalizeMimeType("image/png")).toBe("image/png");
  });

  it("lowercases the mime type", () => {
    expect(normalizeMimeType("IMAGE/PNG")).toBe("image/png");
  });

  it("strips parameters", () => {
    expect(normalizeMimeType("text/plain; charset=utf-8")).toBe("text/plain");
  });

  it("falls back to octet-stream for a missing type", () => {
    expect(normalizeMimeType(undefined)).toBe("application/octet-stream");
    expect(normalizeMimeType(null)).toBe("application/octet-stream");
    expect(normalizeMimeType("")).toBe("application/octet-stream");
  });

  it("falls back to octet-stream for a malformed type", () => {
    expect(normalizeMimeType("not-a-mime")).toBe("application/octet-stream");
    expect(normalizeMimeType("image/png/../../etc/passwd")).toBe("application/octet-stream");
    expect(normalizeMimeType("<script>")).toBe("application/octet-stream");
  });

  it("falls back to octet-stream for an over-long type", () => {
    expect(normalizeMimeType("a".repeat(500))).toBe("application/octet-stream");
  });

  it("rejects a type containing a path separator", () => {
    expect(normalizeMimeType("text/../../etc")).toBe("application/octet-stream");
  });
});
