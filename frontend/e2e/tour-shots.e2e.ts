import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, signIn } from "./accounts";

/**
 * a walk through every screen and state for review, including the ones the
 * readme does not use: auth, settings, not-found, empty, error, loading, the
 * collapsed rail, the mobile drawer. these are for looking at the app as a
 * whole, not for embedding.
 */
const DIR = "public/tour";

const WIDE = { width: 1440, height: 900 };
const PHONE = { width: 375, height: 812 };

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

const settle = (page: Page, ms = 500) => page.waitForTimeout(ms);

const shot = (page: Page, file: string) =>
  page.screenshot({ path: `${DIR}/${file}.png`, scale: "device" });

/** the same staged account the readme shots use */
const signUpAs = async (page: Page, name: string): Promise<void> => {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  const created = await page
    .waitForURL("/", { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!created) await signIn(page, email);
};

test("auth screens, signed out", async ({ page }) => {
  await page.setViewportSize(WIDE);

  await page.goto("/sign-in");
  await settle(page);
  await shot(page, "01-sign-in");

  await page.goto("/sign-up");
  await settle(page);
  await shot(page, "02-sign-up");

  // the zod resolver's messages, which only appear once submit is attempted
  await page.getByRole("button", { name: "Create account" }).click();
  await settle(page, 350);
  await shot(page, "03-sign-up-validation");

  // what a wrong password actually looks like
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password-here");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await settle(page, 300);
  await shot(page, "04-sign-in-rejected");

  await page.setViewportSize(PHONE);
  await page.goto("/sign-in");
  await settle(page);
  await shot(page, "05-sign-in-mobile");
});

test("signed-in screens", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signUpAs(page, "Ray Ellison");

  await page.goto("/settings");
  await expect(page.getByText("Default symbol")).toBeVisible();
  await settle(page);
  await shot(page, "06-settings");

  // the rail collapsed, which is a real layout state with its own bugs
  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("button", { name: /collapse/i }).click();
  await settle(page, 600);
  await shot(page, "07-rail-collapsed");
});

test("empty, error, and not-found states", async ({ page }) => {
  await page.setViewportSize(WIDE);

  // a signed-in account with nothing saved yet, which must not look like a
  // failure to load
  await signUpAs(page, "Dana Whitfield");
  await page.goto("/strategies");
  await expect(page.getByText("No saved strategies")).toBeVisible();
  await settle(page);
  await shot(page, "08-strategies-empty");

  await page.goto("/nothing-here");
  await settle(page);
  await shot(page, "09-not-found");

  // the api refusing to answer, which is a different state from empty
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/chain");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await settle(page);
  await shot(page, "10-chain-error");

  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await settle(page);
  await shot(page, "11-surface-error");
});

test("mobile navigation and panels", async ({ page }) => {
  await page.setViewportSize(PHONE);

  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByLabel("Open navigation").click();
  await settle(page);
  await shot(page, "12-mobile-nav");
  await page.keyboard.press("Escape");
  await settle(page, 300);

  await page.locator("tr[data-atm=true]").getByRole("button").first().click();
  await expect(page.getByRole("complementary", { name: "Contract detail" })).toBeVisible();
  await settle(page);
  await shot(page, "13-contract-panel-mobile");

  await page.goto("/build");
  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
  await settle(page);
  await shot(page, "14-build-mobile");
});

test("tablet width", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });

  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await settle(page);
  await shot(page, "15-chain-tablet");

  await page.goto("/build");
  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
  await settle(page);
  await shot(page, "16-build-tablet");
});
