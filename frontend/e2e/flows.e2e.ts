import { expect, test } from "@playwright/test";
import { signIn, signUp } from "./accounts";

test("sign up, land on the shell, read a chain, sign out", async ({ page }) => {
  const email = await signUp(page, "E2E Runner", "shell");

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
  const email = await signUp(page, "Return Visitor", "return");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/sign-in");

  await signIn(page, email);
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

/** the mesh only exists once r3f has measured the canvas and drawn frames */
const waitForSurface = async (page: import("@playwright/test").Page) => {
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector("canvas");
      return canvas !== null && canvas.width > 300;
    },
    undefined,
    { timeout: 15_000 },
  );
};

test("surface renders the fitted grid and reads its own parameters", async ({ page }) => {
  await page.goto("/");
  await waitForSurface(page);

  await expect(page.getByRole("heading", { name: /volatility surface/i })).toBeVisible();
  await expect(page.getByText("Butterfly arb-free")).toBeVisible();
  await expect(page.getByText("Calendar arb-free")).toBeVisible();

  // the readout has to carry the real fit, not placeholder dashes
  const atm = await page.getByText("ATM vol").locator("xpath=following-sibling::*[1]").innerText();
  expect(atm).toMatch(/^\d+\.\d+%$/);
});

test("sweeping the slice plane changes the expiry and its smile", async ({ page }) => {
  await page.goto("/");
  await waitForSurface(page);

  const slider = page.getByLabel("Expiry to slice");
  const before = await page.getByText(/^\d+d$/).innerText();

  await slider.focus();
  for (let i = 0; i < 8; i++) await slider.press("ArrowRight");

  await expect(page.getByText(/^\d+d$/)).not.toHaveText(before);
  await expect(page.getByRole("img", { name: /implied volatility against strike/i })).toBeVisible();
});

test("the term cut swaps the readout instead of leaving it blank", async ({ page }) => {
  await page.goto("/");
  await waitForSurface(page);

  await page.getByRole("button", { name: "Term" }).click();

  await expect(page.getByText(/no single set of SVI parameters/i)).toBeVisible();
  await expect(page.getByText("Expiries fitted")).toBeVisible();
  await expect(
    page.getByRole("img", { name: /implied volatility against years to expiry/i }),
  ).toBeVisible();
});

test("leaving the surface releases its webgl context", async ({ page }) => {
  await page.goto("/");
  await waitForSurface(page);

  // navigating away and back must not accumulate canvases or leave the old
  // context alive: a route change that leaks one context per visit exhausts the
  // browser's limit after a dozen or so
  for (let i = 0; i < 3; i++) {
    await page.getByRole("link", { name: "Chain" }).click();
    await expect(page.locator("canvas")).toHaveCount(0);
    await page.getByRole("link", { name: "Surface" }).click();
    await waitForSurface(page);
  }

  await expect(page.locator("canvas")).toHaveCount(1);
});
