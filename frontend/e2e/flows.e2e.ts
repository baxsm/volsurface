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

test("the symbol menu opens over the surface instead of behind it", async ({ page }) => {
  await page.goto("/");
  await waitForSurface(page);

  // the header used to be overflow-hidden, which clipped both menus to its own
  // 56px height. z-index cannot recover from that: clipping happens first.
  const trigger = page.locator('button[aria-haspopup="menu"]').first();
  await expect(trigger).toHaveAttribute("aria-label", /Symbol: \w/);
  await trigger.click();

  const menu = page.locator('button[aria-haspopup="menu"] ~ div').first();
  await expect(menu).toBeVisible();

  const clipped = await menu.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    let node = el.parentElement;
    let top = rect.top;
    let bottom = rect.bottom;
    while (node !== null && node !== document.body) {
      if (getComputedStyle(node).overflowY !== "visible") {
        const parent = node.getBoundingClientRect();
        top = Math.max(top, parent.top);
        bottom = Math.min(bottom, parent.bottom);
      }
      node = node.parentElement;
    }
    return { full: rect.height, visible: Math.max(0, bottom - top) };
  });

  expect(clipped.visible).toBeCloseTo(clipped.full, 0);
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

test("a dead api shows an error on the surface, not a permanent spinner", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());

  // the surface page kept ticker null while the symbol list never arrived, so
  // it sat on "Loading symbols" forever and a dead server read as a slow one.
  // /chain had this covered and / did not, which is how it survived.
  await page.goto("/");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Could not load symbols")).toBeVisible();
  await expect(page.getByText("Loading symbols")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("opening a contract does not scroll the shell out of view", async ({ page }) => {
  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await page.waitForTimeout(800);

  await page.locator("tr[data-atm=true]").getByRole("button").first().click();
  await expect(page.getByRole("complementary", { name: "Contract detail" })).toBeVisible();
  await page.waitForTimeout(500);

  // <main> is overflow-hidden, so anything that scrolls it can never scroll it
  // back. scrollIntoView used to walk up to it and leave the panel's header
  // clipped off the top for as long as the panel stayed open.
  const shell = await page.evaluate(() => document.querySelector("main")?.scrollTop ?? -1);
  expect(shell).toBe(0);

  const heading = page.getByRole("complementary", { name: "Contract detail" }).locator("p").first();
  const box = await heading.boundingBox();
  expect(box?.y ?? 0).toBeGreaterThan(56);
});

test("counts stay whole while the panel tweens between contracts", async ({ page }) => {
  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await page.waitForTimeout(800);

  const buttons = page.locator("tbody button[aria-pressed]");
  await buttons.nth(20).click();
  await expect(page.getByRole("complementary", { name: "Contract detail" })).toBeVisible();
  await page.waitForTimeout(500);

  const volume = () =>
    page.evaluate(() => {
      const labels = [...document.querySelectorAll("aside dt")];
      const found = labels.find((label) => label.textContent?.trim() === "Volume");
      return found?.nextElementSibling?.textContent?.trim() ?? "";
    });

  // volume and open interest are contract counts. tweening one produced
  // "3.986" on the way to 2, a quantity that does not exist.
  await buttons.nth(26).click();
  for (let i = 0; i < 10; i++) {
    expect(await volume()).not.toContain(".");
    await page.waitForTimeout(30);
  }
});

test("the mobile drawer keeps focus and gives it back", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();

  await page.getByLabel("Open navigation").click();
  const drawer = page.getByRole("dialog", { name: "Main" });
  await expect(drawer).toBeVisible();

  const inside = () =>
    page.evaluate(() => {
      const el = document.querySelector('nav[role="dialog"]');
      return el?.contains(document.activeElement) === true;
    });

  // it covers the page while everything under it stays tabbable, so without a
  // trap the tab key walks into content the user cannot see
  expect(await inside()).toBe(true);
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await inside()).toBe(true);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await inside()).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByLabel("Open navigation")).toBeFocused();
});

test("the contract panel traps focus only where it is modal", async ({ page }) => {
  // on a phone it covers the viewport, so it is a dialog and holds focus
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await page.waitForTimeout(600);

  const opener = page.locator("tr[data-atm=true]").getByRole("button").first();
  await opener.click();
  await expect(page.getByRole("dialog", { name: "Contract detail" })).toBeVisible();

  const inside = () =>
    page.evaluate(() => {
      const el = document.querySelector('aside[role="dialog"]');
      return el?.contains(document.activeElement) === true;
    });

  expect(await inside()).toBe(true);
  for (let i = 0; i < 16; i++) {
    await page.keyboard.press("Tab");
    expect(await inside()).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();

  // on a desktop it sits beside a table the user keeps clicking, so trapping
  // there would fight the interaction rather than protect it
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/chain");
  await expect(page.getByRole("table")).toBeVisible();
  await page.waitForTimeout(600);
  await page.locator("tr[data-atm=true]").getByRole("button").first().click();
  await expect(page.getByRole("complementary", { name: "Contract detail" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Contract detail" })).toHaveCount(0);
});
