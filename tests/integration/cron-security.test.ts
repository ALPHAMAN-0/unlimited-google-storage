/**
 * Integration tests for POST /api/cron/sync and the security headers.
 *
 * The cron endpoint is unauthenticated by session (it is called by the
 * scheduler, not a browser), so its shared-secret check is the only thing
 * standing between an attacker and a full quota re-sync of every user's
 * linked accounts. We assert it cannot be bypassed or brute-forced by
 * length/time tricks.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockSyncAllLinks, mockEnv } = vi.hoisted(() => {
  const mockSyncAllLinks = vi.fn();
  const mockEnv = { CRON_SECRET: "super-secret-value" as string | undefined };
  return { mockSyncAllLinks, mockEnv };
});

vi.mock("@/server/storage/sync", () => ({
  syncAllLinks: mockSyncAllLinks,
  syncUserLinks: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: new Proxy(
    {},
    {
      get(_t, prop: string) {
        return mockEnv[prop as keyof typeof mockEnv];
      },
    }
  ),
}));

import { POST } from "@/app/api/cron/sync/route";
import { middleware } from "@/middleware";
import { NextRequest } from "next/server";
import { setNodeEnv } from "../helpers/env";

const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.CRON_SECRET = "super-secret-value";
  mockSyncAllLinks.mockResolvedValue({ total: 0, ok: 0, failed: 0, failures: [] });
});

describe("POST /api/cron/sync", () => {
  it("returns 503 when CRON_SECRET is not configured", async () => {
    mockEnv.CRON_SECRET = undefined;
    const res = await POST(
      new Request(`${ORIGIN}/api/cron/sync`, { method: "POST", headers: { "x-cron-secret": "x" } })
    );
    expect(res.status).toBe(503);
    expect(mockSyncAllLinks).not.toHaveBeenCalled();
  });

  it("returns 403 when the secret is missing", async () => {
    const res = await POST(new Request(`${ORIGIN}/api/cron/sync`, { method: "POST" }));
    expect(res.status).toBe(403);
    expect(mockSyncAllLinks).not.toHaveBeenCalled();
  });

  it("returns 403 when the secret is wrong", async () => {
    const res = await POST(
      new Request(`${ORIGIN}/api/cron/sync`, { method: "POST", headers: { "x-cron-secret": "wrong" } })
    );
    expect(res.status).toBe(403);
    expect(mockSyncAllLinks).not.toHaveBeenCalled();
  });

  it("returns 403 for a secret that is a prefix of the real one", async () => {
    const res = await POST(
      new Request(`${ORIGIN}/api/cron/sync`, {
        method: "POST",
        headers: { "x-cron-secret": "super" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for a secret that is the real one plus a suffix", async () => {
    const res = await POST(
      new Request(`${ORIGIN}/api/cron/sync`, {
        method: "POST",
        headers: { "x-cron-secret": "super-secret-value-extra" },
      })
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 with the correct secret", async () => {
    const res = await POST(
      new Request(`${ORIGIN}/api/cron/sync`, {
        method: "POST",
        headers: { "x-cron-secret": "super-secret-value" },
      })
    );
    expect(res.status).toBe(200);
    expect(mockSyncAllLinks).toHaveBeenCalledTimes(1);
  });
});

describe("security headers (middleware)", () => {
  function runMiddleware(env: string) {
    const restore = setNodeEnv(env);
    try {
      const res = middleware(new NextRequest(new URL(`${ORIGIN}/dashboard`)));
      return res.headers;
    } finally {
      restore();
    }
  }

  it("sets X-Content-Type-Options: nosniff", () => {
    expect(runMiddleware("production").get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("sets X-Frame-Options: DENY", () => {
    expect(runMiddleware("production").get("X-Frame-Options")).toBe("DENY");
  });

  it("sets frame-ancestors 'none' in the CSP", () => {
    const csp = runMiddleware("production").get("Content-Security-Policy");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("sets object-src 'none' in the CSP", () => {
    const csp = runMiddleware("production").get("Content-Security-Policy");
    expect(csp).toContain("object-src 'none'");
  });

  it("does not allow unsafe-inline for scripts in production", () => {
    const csp = runMiddleware("production").get("Content-Security-Policy");
    const scriptSrc = csp?.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("sets base-uri 'self' and form-action 'self'", () => {
    const csp = runMiddleware("production").get("Content-Security-Policy");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("sets a strict Referrer-Policy", () => {
    expect(runMiddleware("production").get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sets HSTS in production", () => {
    expect(runMiddleware("production").get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("does not set HSTS in development", () => {
    expect(runMiddleware("development").get("Strict-Transport-Security")).toBeNull();
  });
});
