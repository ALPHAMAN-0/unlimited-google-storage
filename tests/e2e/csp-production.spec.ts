import { test, expect } from "@playwright/test";

/**
 * Production-CSP regression guard.
 *
 * The dev server keeps `'unsafe-inline'` in `script-src` because React Fast
 * Refresh needs `eval`. That means the dev suite can never catch a broken
 * production CSP — a `script-src 'self'` policy renders a completely blank
 * page in production while every dev test still passes.
 *
 * These tests therefore run against a *production* build (see
 * `playwright.config.ts`, which starts `npm run start` when
 * `PLAYWRIGHT_PRODUCTION=1`). They assert that the strict, nonce-based policy
 * still produces a working, hydrated app.
 */
test.describe("production Content-Security-Policy", () => {
  test.skip(
    process.env.PLAYWRIGHT_PRODUCTION !== "1",
    "requires a production server (PLAYWRIGHT_PRODUCTION=1)"
  );

  test("the landing page renders and hydrates under the nonce policy", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    // The document must contain real content, not just an empty shell.
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    expect(((await h1.textContent()) ?? "").trim().length).toBeGreaterThan(0);
    expect(((await page.locator("body").innerText()) ?? "").trim().length).toBeGreaterThan(20);

    // No CSP violation may reach the console.
    const cspErrors = errors.filter((e) =>
      /Content Security Policy|violates the following/i.test(e)
    );
    expect(cspErrors).toEqual([]);
  });

  test("the app is actually hydrated, not just server-rendered markup", async ({ page }) => {
    // A blank page caused by blocked bootstrap scripts still leaves valid
    // server-rendered HTML behind. The proof that React hydrated is that a
    // client-side navigation works without a full page load.
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: /sign in/i }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  });

  test("the response carries a nonce-based script-src without unsafe-inline", async ({ page }) => {
    const response = await page.goto("/");
    const csp = response?.headers()["content-security-policy"] ?? "";
    expect(csp).not.toBe("");

    const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).toBeDefined();
    expect(scriptSrc).toMatch(/nonce-[A-Za-z0-9+/=]+/);
    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  test("the nonce in the header matches the nonce on the emitted scripts", async ({ page }) => {
    const response = await page.goto("/");
    const csp = response?.headers()["content-security-policy"] ?? "";
    const match = csp.match(/nonce-([A-Za-z0-9+/=]+)/);
    expect(match).not.toBeNull();
    const nonce = match![1];

    // Every script Next emits must carry the same nonce, otherwise the
    // browser blocks it and the app never hydrates.
    //
    // NOTE: read the `nonce` IDL *property*, not `getAttribute("nonce")`.
    // Browsers deliberately blank the content attribute of a nonce so that
    // CSS attribute selectors cannot exfiltrate it; the property still
    // returns the real value.
    const scriptNonces = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script"))
        .map((s) => (s as HTMLScriptElement).nonce)
        .filter((n): n is string => typeof n === "string" && n.length > 0)
    );
    expect(scriptNonces.length).toBeGreaterThan(0);
    expect(new Set(scriptNonces)).toEqual(new Set([nonce]));

    // The inline bootstrap scripts are the ones that actually need the nonce;
    // a page with only external scripts would hydrate without it.
    const inlineNonces = await page.evaluate(() =>
      Array.from(document.querySelectorAll("script:not([src])"))
        .map((s) => (s as HTMLScriptElement).nonce)
        .filter((n): n is string => typeof n === "string" && n.length > 0)
    );
    expect(inlineNonces.length).toBeGreaterThan(0);
    expect(new Set(inlineNonces)).toEqual(new Set([nonce]));
  });

  test("the raw response body carries the nonce on every script tag", async ({ page }) => {
    // The DOM hides the nonce attribute, so assert against the raw HTML that
    // the server actually emitted.
    const response = await page.goto("/");
    const html = (await response?.text()) ?? "";
    const csp = response?.headers()["content-security-policy"] ?? "";
    const nonce = csp.match(/nonce-([A-Za-z0-9+/=]+)/)?.[1];
    expect(nonce).toBeDefined();

    const scriptTags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scriptTags.length).toBeGreaterThan(0);

    const missing = scriptTags.filter((t) => !t.includes(`nonce="${nonce}"`));
    expect(missing).toEqual([]);
  });
});
