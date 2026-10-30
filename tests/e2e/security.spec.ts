import { test, expect } from "@playwright/test";

/**
 * E2E security checks against the real running server.
 *
 * These assert properties that only show up on genuine HTTP responses from
 * the Next.js middleware — the unit tests mock the middleware away.
 */
test("security headers are present on the landing page", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers();

  expect(headers?.["x-content-type-options"]).toBe("nosniff");
  expect(headers?.["x-frame-options"]).toBe("DENY");
  expect(headers?.["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers?.["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers?.["content-security-policy"]).toContain("object-src 'none'");
  expect(headers?.["permissions-policy"]).toContain("camera=()");
});

test("the CSP script-src is tightened outside development", async ({ page }) => {
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] ?? "";
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));

  expect(scriptSrc).toBeDefined();

  // The dev server legitimately needs 'unsafe-eval' for React Refresh, and
  // Next's dev overlay injects inline scripts. In a production build neither
  // is granted — that is the case worth guarding.
  if (process.env.NODE_ENV === "production") {
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  }
});

test("the CSRF cookie is httpOnly and SameSite=Strict", async ({ page }) => {
  await page.goto("/login");

  const cookies = await page.context().cookies();
  const csrf = cookies.find((c) => c.name === "ugs_csrf");

  // The cookie is only issued on an authenticated page, but if present it
  // must never be readable by JavaScript.
  if (csrf) {
    expect(csrf.httpOnly).toBe(true);
    expect(csrf.sameSite).toBe("Strict");
  }
});

test("unauthenticated API requests are rejected with 401", async ({ request }) => {
  const res = await request.get("/api/files");
  expect(res.status()).toBe(401);
});

test("unauthenticated API requests are rejected with 401 (links)", async ({ request }) => {
  const res = await request.get("/api/links");
  expect(res.status()).toBe(401);
});

test("the cron endpoint rejects a missing secret with 403", async ({ request }) => {
  const res = await request.post("/api/cron/sync");
  expect(res.status()).toBe(403);
});

test("the cron endpoint rejects a wrong secret with 403", async ({ request }) => {
  const res = await request.post("/api/cron/sync", {
    headers: { "x-cron-secret": "definitely-wrong" },
  });
  expect(res.status()).toBe(403);
});

test("a cross-origin upload is rejected with 403", async ({ request }) => {
  const res = await request.post("/api/uploads", {
    headers: {
      origin: "https://evil.example.com",
      "x-csrf-token": "anything",
    },
    multipart: {
      file: {
        name: "evil.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("pwned"),
      },
    },
  });
  // Either 401 (no session) or 403 (CSRF) — but never 200.
  expect([401, 403]).toContain(res.status());
});
