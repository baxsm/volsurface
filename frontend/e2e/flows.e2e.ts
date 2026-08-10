import { expect, test } from "@playwright/test";

/** each run needs an account that does not already exist */
const uniqueEmail = () => `e2e-${process.pid}-${Date.now()}@volsurface.test`;

test("sign up, land on the shell, read a chain, sign out", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E Runner");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-2026");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("link", { name: "Chain" }).click();
  await expect(page).toHaveURL("/chain");

  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  await expect(page.locator("tr[data-atm=true]")).toHaveCount(1);

  await page.locator("tr[data-atm=true]").getByRole("button").first().click();
  const panel = page.getByRole("complementary", { name: "Contract detail" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Implied volatility")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");
});

test("guarded route redirects when signed out", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL("/sign-in");
});

test("signing in again reaches the shell", async ({ page }) => {
  const email = uniqueEmail();
  const password = "e2e-password-2026";

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Return Visitor");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText(email)).toBeVisible();
});

test("wrong password shows an error and does not navigate", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nobody@volsurface.test");
  await page.getByLabel("Password").fill("not-the-password-1");
  await page.getByRole("button", { name: "Sign in" }).click();

  // the auth rate limit is deliberately tight, so a repeated run can legitimately
  // be throttled instead of rejected. either way the user must be told and kept
  // on the page rather than let through.
  await expect(page.getByRole("alert")).toContainText(/do not match|Too many attempts/);
  await expect(page).toHaveURL("/sign-in");
});
