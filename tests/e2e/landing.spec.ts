import { test, expect } from "@playwright/test";

test("landing page renders and links to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /unlimited/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
});

test("login page has a Google sign-in button", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
});

test("dashboard redirects unauthenticated users to /login", async ({ page }) => {
  const res = await page.goto("/dashboard");
  // Either a redirect to /login or a 200 with redirect kicked off client-side.
  await expect(page).toHaveURL(/\/login/);
  expect(res).toBeTruthy();
});
