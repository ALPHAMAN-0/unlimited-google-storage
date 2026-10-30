import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isSameOrigin,
  verifyCsrfPair,
  assertCsrf,
  allowedOrigins,
  CSRF_HEADER,
} from "@/lib/csrf";
import { setNodeEnv } from "../helpers/env";

/**
 * CSRF protection unit tests.
 *
 * These cover the two independent layers we rely on:
 *   1. Origin / Referer same-origin check.
 *   2. Double-submit token comparison.
 */

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/uploads", { method: "POST", headers });
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  setNodeEnv("test");
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("allowedOrigins", () => {
  it("includes the configured NEXTAUTH_URL origin", () => {
    const origins = allowedOrigins(null);
    expect(origins).toContain("http://localhost:3000");
  });

  it("includes the request origin when supplied", () => {
    const origins = allowedOrigins("https://app.example.com");
    expect(origins).toContain("https://app.example.com");
  });

  it("ignores a malformed NEXTAUTH_URL instead of throwing", () => {
    process.env.NEXTAUTH_URL = "not-a-url";
    expect(() => allowedOrigins(null)).not.toThrow();
  });
});

describe("isSameOrigin", () => {
  it("accepts a matching Origin header", () => {
    expect(isSameOrigin(req({ origin: "http://localhost:3000" }))).toBe(true);
  });

  it("rejects a foreign Origin header", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example.com" }))).toBe(false);
  });

  it("rejects an Origin that merely shares a prefix", () => {
    // A naive `startsWith` check would wrongly accept this.
    expect(isSameOrigin(req({ origin: "http://localhost:3000.evil.com" }))).toBe(false);
  });

  it("rejects an Origin on a different port", () => {
    expect(isSameOrigin(req({ origin: "http://localhost:4000" }))).toBe(false);
  });

  it("rejects an Origin on a different scheme", () => {
    expect(isSameOrigin(req({ origin: "https://localhost:3000" }))).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(isSameOrigin(req({ referer: "http://localhost:3000/dashboard" }))).toBe(true);
    expect(isSameOrigin(req({ referer: "https://evil.example.com/x" }))).toBe(false);
  });

  it("rejects a malformed Referer", () => {
    expect(isSameOrigin(req({ referer: "::::not a url" }))).toBe(false);
  });

  it("rejects a request with neither Origin nor Referer in production", () => {
    const restore = setNodeEnv("production");
    try {
      expect(isSameOrigin(req({}))).toBe(false);
    } finally {
      restore();
    }
  });

  it("allows a request with no Origin/Referer outside production (script clients)", () => {
    const restore = setNodeEnv("test");
    try {
      expect(isSameOrigin(req({}))).toBe(true);
    } finally {
      restore();
    }
  });
});

describe("verifyCsrfPair", () => {
  it("accepts a matching cookie/header pair", () => {
    expect(verifyCsrfPair("abc123", "abc123")).toBe(true);
  });

  it("rejects a mismatched pair", () => {
    expect(verifyCsrfPair("abc123", "def456")).toBe(false);
  });

  it("rejects a missing cookie", () => {
    expect(verifyCsrfPair(undefined, "abc123")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(verifyCsrfPair("abc123", null)).toBe(false);
  });

  it("rejects a prefix-only match", () => {
    expect(verifyCsrfPair("abc123", "abc")).toBe(false);
  });

  it("rejects when both are empty strings", () => {
    expect(verifyCsrfPair("", "")).toBe(false);
  });
});

describe("assertCsrf", () => {
  it("accepts a same-origin request with a matching token", () => {
    const r = req({ origin: "http://localhost:3000", [CSRF_HEADER]: "tok" });
    expect(assertCsrf(r, "tok")).toEqual({ ok: true });
  });

  it("rejects a cross-origin request even with a valid token", () => {
    const r = req({ origin: "https://evil.example.com", [CSRF_HEADER]: "tok" });
    const result = assertCsrf(r, "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_origin");
  });

  it("rejects a same-origin request with a missing token", () => {
    const r = req({ origin: "http://localhost:3000" });
    const result = assertCsrf(r, "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_token");
  });

  it("rejects a same-origin request with a wrong token", () => {
    const r = req({ origin: "http://localhost:3000", [CSRF_HEADER]: "wrong" });
    const result = assertCsrf(r, "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_token");
  });

  it("rejects a request with no cookie token at all", () => {
    const r = req({ origin: "http://localhost:3000", [CSRF_HEADER]: "tok" });
    const result = assertCsrf(r, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_token");
  });
});
