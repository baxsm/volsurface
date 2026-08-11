import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { E2E_PASSWORD, signIn } from "./accounts";

/**
 * captures the images the README embeds. separate from screenshots.e2e.ts,
 * which is throwaway verification: these land in frontend/public/readme, are
 * committed, and are staged deliberately - a fresh account, real IBM contracts,
 * and positions named the way a person would name them.
 */
const DIR = "public/readme";

// the 2x capture that keeps the chain's numbers sharp at the readme's render
// width is set by the "readme" project's deviceScaleFactor in playwright.config
const WIDE = { width: 1440, height: 900 };

test.beforeAll(() => {
  mkdirSync(DIR, { recursive: true });
});

const settle = (page: Page, ms = 500) => page.waitForTimeout(ms);

/**
 * the topbar shows the signed-in email, so the shared signUp helper's
 * "e2e-readme-1632-...@volsurface.test" address would end up in the picture.
 * this signs up the same way with an address a person could plausibly have.
 */
const signUpAs = async (page: Page, name: string): Promise<void> => {
  const handle = name.toLowerCase().replace(/[^a-z]+/g, ".");
  const email = `${handle}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  const created = await page
    .waitForURL("/", { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  // the address is fixed rather than unique per run, so on a re-capture the
  // account already exists and this signs into it instead
  if (!created) await signIn(page, email);
};

/** round the chain's scroll to a whole row so the top row is not sliced */
const alignRows = async (page: Page) => {
  await page.evaluate(() => {
    const row = document.querySelector("tbody tr");
    if (row === null) return;

    // the table's own vertical scroller, found by walking up from a row rather
    // than by class name, which tailwind can reorder
    let target = row.parentElement;
    while (target !== null && target.scrollHeight <= target.clientHeight) {
      target = target.parentElement;
    }
    if (target === null) return;

    const height = row.getBoundingClientRect().height;
    if (height <= 0) return;
    target.scrollTop = Math.round(target.scrollTop / height) * height;
  });
  await page.waitForTimeout(250);
};

/** r3f only has a mesh once it has measured the canvas and drawn frames */
const waitForSurface = async (page: Page) => {
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector("canvas");
      return canvas !== null && canvas.width > 300;
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(1600);
};

test("surface, the lead image", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("/");
  await waitForSurface(page);

  // sweep off the front week onto an expiry with a fuller, more curved smile,
  // then drop focus so the slider's focus ring is not in the picture
  const expiry = page.getByLabel("Expiry to slice");
  await expiry.focus();
  for (let i = 0; i < 5; i++) await expiry.press("ArrowRight");
  await expiry.blur();
  await page.waitForTimeout(900);

  // the default camera is already a 3/4 view looking down on the mesh, which is
  // the angle that reads as a surface. dragging swings it toward eye level,
  // where the mesh goes edge-on and reads as vertical shards, so this keeps it.
  await page.screenshot({ path: `${DIR}/surface.png`, scale: "device" });

  // the term cut, which is the other axis the slice plane reads. back to the
  // default camera first, for the same reason as above.
  await page.goto("/");
  await waitForSurface(page);
  await page.getByRole("button", { name: "Term" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/surface-term.png`, scale: "device" });
});

test("chain and contract detail", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await settle(page);

  // ours beside the vendor's, which is the cross-check the chain exists to
  // show. the table centres itself on the at-the-money row, which lands
  // mid-row and slices the top one, so the scroll is rounded to a row edge
  // first - without moving off the money.
  await page.getByLabel("Vendor IV").check();
  await settle(page, 350);
  await alignRows(page);
  await page.screenshot({ path: `${DIR}/chain-vendor.png`, scale: "device" });
  await page.getByLabel("Vendor IV").uncheck();
  await settle(page, 250);

  await page.locator("tr[data-atm=true]").getByRole("button").first().click();
  await expect(page.getByRole("complementary", { name: "Contract detail" })).toBeVisible();
  await settle(page);
  await alignRows(page);
  await page.screenshot({ path: `${DIR}/contract-panel.png`, scale: "device" });
});

/**
 * the builder is taller than the viewport and its three parts all matter: the
 * legs, the payoff curve, and the solved metrics under it. a viewport shot
 * always drops one, so it is captured whole.
 */
const buildShot = async (page: Page, file: string) => {
  // the shell is h-dvh overflow-hidden and the page scrolls inside it, so
  // fullPage cannot grow the capture - it just photographs the viewport with
  // whatever the inner scroller happened to be showing. a taller viewport is
  // what actually fits the legs, the curve, and the metrics in one frame.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = 0;
    }
  });
  await settle(page, 700);
  await page.screenshot({ path: `${DIR}/${file}.png`, scale: "device" });
};

test("builder and a stocked saved list", async ({ page }) => {
  await page.setViewportSize(WIDE);
  await signUpAs(page, "Ray Ellison");

  // tall enough to hold the whole builder column, since the shell will not
  // scroll for a fullPage capture
  await page.setViewportSize({ width: 1440, height: 1180 });
  await page.goto("/build");
  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
  await settle(page);

  // an iron condor is the most legible payoff: four legs, two breakevens, and
  // a capped profit band, so the chart shows what the builder actually solves
  await page.getByRole("button", { name: "Iron condor" }).click();
  await settle(page, 800);
  await buildShot(page, "build-condor");

  // stock the saved list with positions a person would actually keep, so the
  // screenshot is a real list rather than one row named "test". the names stay
  // generic rather than quoting strikes, since each preset builds its own from
  // this snapshot and a hardcoded strike in the name would be fiction.
  const saves: ReadonlyArray<readonly [string, string]> = [
    ["Iron condor", "July condor around spot"],
    ["Call debit spread", "Earnings call spread"],
    ["Butterfly", "Pinned butterfly, front week"],
    ["Straddle", "Long straddle into CPI"],
  ];

  // a re-capture signs into the same account, so anything saved by the last run
  // is cleared first and the list holds exactly these four
  await page.goto("/strategies");
  await settle(page, 400);
  for (;;) {
    const remove = page.getByRole("button", { name: /^Delete/ }).first();
    if ((await remove.count()) === 0) break;
    await remove.click();
    await page.getByRole("button", { name: "Confirm" }).click();
    await settle(page, 400);
  }

  for (const [preset, name] of saves) {
    await page.goto("/build");
    await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
    await page.getByRole("button", { name: preset, exact: true }).click();
    await settle(page, 400);
    await page.getByLabel("Strategy name").fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  }

  // four rows do not fill a tall window, and the empty space below them reads
  // as a design flaw rather than a short list
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto("/strategies");
  await expect(page.getByText("July condor around spot")).toBeVisible();
  await settle(page);
  await page.screenshot({ path: `${DIR}/strategies.png`, scale: "device" });
});
