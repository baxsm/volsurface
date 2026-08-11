import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signUp } from "./accounts";

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

/** the mesh only exists once r3f has measured the canvas and drawn frames, so
    a screenshot taken on load would capture an empty stage */
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
  await page.waitForTimeout(1400);
};

test("surface at desktop, orbited, sliced, and on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/");
  await waitForSurface(page);
  await page.screenshot({ path: `${DIR}/21-surface-desktop.png` });

  // drag to orbit, which is the interaction the whole view is built around
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (box !== null) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 170, box.y + box.height / 2 + 70, { steps: 22 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${DIR}/22-surface-orbited.png` });
  }

  // sweep the slice plane to a back expiry and read the term cut
  const expirySlider = page.getByLabel("Expiry to slice");
  await expirySlider.focus();
  for (let i = 0; i < 9; i++) await expirySlider.press("ArrowRight");
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/23-surface-slice-back.png` });

  await page.getByRole("button", { name: "Term" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/24-surface-term-cut.png` });

  await page.getByRole("button", { name: "Smile" }).click();
  await page.getByRole("button", { name: "Wireframe" }).click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${DIR}/25-surface-no-wireframe.png` });
  await page.getByRole("button", { name: "Wireframe" }).click();

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await waitForSurface(page);
  await page.screenshot({ path: `${DIR}/26-surface-tablet.png` });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await waitForSurface(page);
  await page.screenshot({ path: `${DIR}/27-surface-mobile.png`, fullPage: true });
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

const signUpForShots = (page: import("@playwright/test").Page) =>
  signUp(page, "Screenshot Runner", "shots");

test("builder across widths and presets", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signUpForShots(page);

  await page.goto("/build");
  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/11-build-vertical.png`, fullPage: true });

  for (const [preset, file] of [
    ["Iron condor", "12-build-condor"],
    ["Straddle", "13-build-straddle"],
    ["Butterfly", "14-build-butterfly"],
  ] as const) {
    await page.getByRole("button", { name: preset }).click();
    await settle(page);
    await page.screenshot({ path: `${DIR}/${file}.png`, fullPage: true });
  }

  // saved list, then the same list once it is empty again
  await page.getByRole("button", { name: "Iron condor" }).click();
  await settle(page);
  await page.getByLabel("Strategy name").fill("Condor for screenshots");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.goto("/strategies");
  await expect(page.getByText("Condor for screenshots")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/15-strategies-list.png` });

  await page.getByRole("button", { name: /^Delete / }).click();
  await settle(page, 200);
  await page.screenshot({ path: `${DIR}/16-strategies-confirm-delete.png` });
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("No saved strategies")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/17-strategies-empty.png` });

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/build");
  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/18-build-tablet.png`, fullPage: true });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/build");
  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/19-build-mobile.png` });

  await page.getByRole("button", { name: "Iron condor" }).click();
  await settle(page);
  // the chart sits below the fold on a phone, so the capture scrolls to it
  // rather than photographing the part of the page above it
  await page.getByRole("img", { name: /profit and loss/i }).scrollIntoViewIfNeeded();
  await settle(page);
  await page.screenshot({ path: `${DIR}/20-build-mobile-condor.png` });
});
