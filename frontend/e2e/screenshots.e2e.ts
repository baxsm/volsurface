import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

// verification artifacts, gitignored. captured so the assembled screens can be
// reviewed rather than assumed correct because the components render.
const DIR = "e2e/screenshots";

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

const settle = async (page: import("@playwright/test").Page, ms = 450) => {
  await page.waitForTimeout(ms);
};

test("desktop shell and chain", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/01-chain-desktop.png` });

  const atmRow = page.locator("tr[data-atm=true]");
  await expect(atmRow).toHaveCount(1);

  await atmRow.getByRole("button").first().click();
  await settle(page);
  await page.screenshot({ path: `${DIR}/02-contract-panel.png` });
  await expect(page.getByRole("complementary", { name: "Contract detail" })).toBeVisible();

  await page.keyboard.press("Escape");
  await settle(page);

  await page.getByLabel("Vendor IV").check();
  await settle(page, 250);
  await page.screenshot({ path: `${DIR}/03-chain-vendor.png` });
  await page.getByLabel("Vendor IV").uncheck();
});

test("auth pages", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/sign-in");
  await settle(page);
  await page.screenshot({ path: `${DIR}/04-sign-in.png` });

  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create account" }).click();
  await settle(page, 250);
  await page.screenshot({ path: `${DIR}/05-sign-up-validation.png` });
});

test("mobile shell and chain at 375", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });

  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/06-chain-mobile.png` });

  await page.getByLabel("Open navigation").click();
  await settle(page);
  await page.screenshot({ path: `${DIR}/07-mobile-nav.png` });
  await page.keyboard.press("Escape");
  await settle(page, 250);

  await page.locator("tr[data-atm=true]").getByRole("button").first().click();
  await settle(page);
  await page.screenshot({ path: `${DIR}/08-contract-panel-mobile.png` });

  await page.goto("/sign-in");
  await settle(page);
  await page.screenshot({ path: `${DIR}/09-sign-in-mobile.png` });
});

test("error state when the api is unreachable", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route("**/api/**", (route) => route.abort());

  await page.goto("/chain");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await settle(page);
  await page.screenshot({ path: `${DIR}/10-chain-error.png` });
});
