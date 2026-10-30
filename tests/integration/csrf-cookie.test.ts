/**
 * Tests for the CSRF cookie lifecycle (`ensureCsrfToken` / `clearCsrfToken`).
 *
 * These use a mocked `next/headers` cookie store so we can assert the
 * security-relevant cookie attributes: httpOnly (so JS/XSS cannot read the
 * token), SameSite=Strict, and Secure in production.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockCookieStore } = vi.hoisted(() => {
  const mockCookieStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };
  return { mockCookieStore };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

import { ensureCsrfToken, clearCsrfToken, CSRF_COOKIE } from "@/lib/csrf";
import { setNodeEnv } from "../helpers/env";

beforeEach(() => {
  vi.clearAllMocks();
  mockCookieStore.get.mockReturnValue(undefined);
});

describe("ensureCsrfToken", () => {
  it("creates a token when no cookie exists", async () => {
    const token = await ensureCsrfToken();
    expect(token).toHaveLength(43); // 32 random bytes, base64url
    expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
  });

  it("sets the cookie as httpOnly so JavaScript cannot read it", async () => {
    await ensureCsrfToken();
    const args = mockCookieStore.set.mock.calls[0];
    expect(args[0]).toBe(CSRF_COOKIE);
    expect(args[2].httpOnly).toBe(true);
  });

  it("sets SameSite=Strict", async () => {
    await ensureCsrfToken();
    expect(mockCookieStore.set.mock.calls[0][2].sameSite).toBe("strict");
  });

  it("sets Secure in production", async () => {
    const restore = setNodeEnv("production");
    try {
      await ensureCsrfToken();
      expect(mockCookieStore.set.mock.calls[0][2].secure).toBe(true);
    } finally {
      restore();
    }
  });

  it("does not set Secure outside production", async () => {
    const restore = setNodeEnv("development");
    try {
      await ensureCsrfToken();
      expect(mockCookieStore.set.mock.calls[0][2].secure).toBe(false);
    } finally {
      restore();
    }
  });

  it("reuses an existing token instead of rotating it", async () => {
    mockCookieStore.get.mockReturnValue({ value: "existing-token-value-that-is-long-enough" });
    const token = await ensureCsrfToken();
    expect(token).toBe("existing-token-value-that-is-long-enough");
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("rotates a too-short existing token", async () => {
    mockCookieStore.get.mockReturnValue({ value: "short" });
    const token = await ensureCsrfToken();
    expect(token).not.toBe("short");
    expect(mockCookieStore.set).toHaveBeenCalledTimes(1);
  });

  it("generates a different token each time", async () => {
    const a = await ensureCsrfToken();
    const b = await ensureCsrfToken();
    expect(a).not.toBe(b);
  });
});

describe("clearCsrfToken", () => {
  it("deletes the CSRF cookie", async () => {
    await clearCsrfToken();
    expect(mockCookieStore.delete).toHaveBeenCalledWith(CSRF_COOKIE);
  });
});
