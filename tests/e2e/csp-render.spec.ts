import { test, expect } from "@playwright/test";

/**
 * Regression guard for the Content-Security-Policy.
 *
 * A too-strict `script-src 'self'` does not fail loudly — it silently
 * blocks Next.js's inline bootstrap scripts, so the server returns HTTP 200
 * with a *blank* page. We hit exactly that: the landing page rendered
 * nothing and the browser console filled with CSP violation errors.
 *
 * These tests assert the page actually renders its content and that the
 * browser reports no CSP violations, so a future tightening of the policy
 * cannot break the app without failing CI.
 */
test("the landing page renders content (not a blank document)", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

  await page.goto("/", { waitUntil: "domcontentloaded" });

  // The h1 must exist and contain real text.
  const h1 = page.locator("h1");
  await expect(h1).toHaveCount(1);
  const text = (await h1.textContent())?.trim() ?? "";
  expect(text.length).toBeGreaterThan(0);

  // The body must have meaningful content, not just an empty shell.
  const bodyText = (await page.locator("body").innerText()).trim();
  expect(bodyText.length).toBeGreaterThan(20);

  // No CSP violations may reach the console.
  const cspErrors = errors.filter((e) =>
    /Content Security Policy|violates the following/i.test(e)
  );
  expect(cspErrors).toEqual([]);
});

test("the sign-in link is clickable and the login page renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

  await page.goto("/");
  await page.getByRole("link", { name: /sign in/i }).first().click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the production CSP uses a nonce rather than unsafe-inline", async ({ page }) => {
  const response = await page.goto("/");
  const csp = response?.headers()["content-security-policy"] ?? "";
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));

  expect(scriptSrc).toBeDefined();

  if (process.env.NODE_ENV === "production") {
    // Strict: a nonce is present and 'unsafe-inline' is not.
    expect(scriptSrc).toMatch(/nonce-[A-Za-z0-9+/=]+/);
    expect(scriptSrc).not.toContain("unsafe-inline");
  }
});
