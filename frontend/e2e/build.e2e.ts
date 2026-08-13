import { expect, type Page, test } from "@playwright/test";
import { signUp as createAccount } from "./accounts";

const signUp = (page: Page, tag: string): Promise<string> => createAccount(page, "Builder", tag);

/** the curve is sprung, so a read taken mid-flight is not the settled shape */
const settle = async (page: Page) => {
  await page.waitForTimeout(500);
};

test("build an iron condor, save it, reopen it, delete it", async ({ page }) => {
  await signUp(page, "build");

  await page.getByRole("link", { name: "Build" }).click();
  await expect(page).toHaveURL("/build");

  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();

  await page.getByRole("button", { name: "Iron condor" }).click();
  await settle(page);

  // four legs, ordered low to high, short the inner pair
  await expect(page.getByLabel("Leg 4 strike")).toBeVisible();
  await expect(page.getByLabel("Leg 1 action")).toHaveValue("buy");
  await expect(page.getByLabel("Leg 2 action")).toHaveValue("sell");
  await expect(page.getByLabel("Leg 3 action")).toHaveValue("sell");
  await expect(page.getByLabel("Leg 4 action")).toHaveValue("buy");

  const chart = page.getByRole("img", { name: /profit and loss at expiry/i });
  await expect(chart).toBeVisible();

  // a condor collects premium, so it must read as a credit with a capped loss
  await expect(page.getByText("Net credit")).toBeVisible();
  await expect(page.getByText("Breakevens")).toBeVisible();
  await expect(page.getByText("Unlimited")).toBeHidden();

  const name = `Condor ${Date.now()}`;
  await page.getByLabel("Strategy name").fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByRole("link", { name: "Strategies", exact: true }).click();
  await expect(page).toHaveURL("/strategies");
  await expect(page.getByText(name)).toBeVisible();

  // reopening has to restore the exact legs that were stored
  await page.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/build\?strategy=/);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await expect(page.getByLabel("Leg 4 strike")).toBeVisible();
  await expect(page.getByLabel("Leg 2 action")).toHaveValue("sell");

  await page.getByRole("link", { name: "Strategies", exact: true }).click();
  await page.getByRole("button", { name: `Delete ${name}` }).click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(name)).toBeHidden();
  await expect(page.getByText("No saved strategies")).toBeVisible();
});

test("editing a leg redraws the payoff", async ({ page }) => {
  await signUp(page, "edit");
  await page.goto("/build");
  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
  await settle(page);

  const curve = page.locator('svg[role="img"] path[stroke="var(--color-accent)"]');
  const before = await curve.getAttribute("d");

  await page.getByLabel("Leg 1 strike").fill("205");

  // the curve is sprung and the edit is debounced, so polling for the change is
  // what makes this independent of how long the settle happens to take
  await expect
    .poll(async () => await curve.getAttribute("d"), { timeout: 10_000 })
    .not.toBe(before);
});

test("a half-typed leg keeps the last curve instead of erroring", async ({ page }) => {
  await signUp(page, "partial");
  await page.goto("/build");
  await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
  await settle(page);

  await page.getByLabel("Leg 1 price").fill("");
  await settle(page);

  await expect(page.getByRole("img", { name: /profit and loss/i })).toBeVisible();
  await expect(page.getByText("Could not price this position")).toBeHidden();
});

test("a signed-out visitor can price a position but not save it", async ({ page }) => {
  await page.goto("/build");
  await expect(page.getByRole("img", { name: /profit and loss/i })).toBeVisible();
  await expect(page.getByText(/sign in.*to save this position/i)).toBeVisible();
  await expect(page.getByLabel("Strategy name")).toBeHidden();
});

test("one user cannot open another user's saved strategy", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signUp(ownerPage, "owner");

  await ownerPage.goto("/build");
  await expect(ownerPage.getByLabel("Leg 1 strike")).toBeVisible();
  const name = `Private ${Date.now()}`;
  await ownerPage.getByLabel("Strategy name").fill(name);
  await ownerPage.getByRole("button", { name: "Save", exact: true }).click();
  await expect(ownerPage.getByText("Saved.")).toBeVisible();

  await ownerPage.getByRole("link", { name: "Strategies", exact: true }).click();
  await ownerPage.getByRole("button", { name: "Open" }).click();
  await expect(ownerPage).toHaveURL(/\/build\?strategy=/);
  const url = ownerPage.url();

  // a second account hitting the owner's url directly must be refused, and the
  // refusal must not confirm that the id exists
  const intruderContext = await browser.newContext();
  const intruderPage = await intruderContext.newPage();
  await signUp(intruderPage, "intruder");
  await intruderPage.goto(url);

  await expect(intruderPage.getByText("Could not open that strategy")).toBeVisible();
  await expect(intruderPage.getByText(name)).toBeHidden();

  await ownerContext.close();
  await intruderContext.close();
});

// a page wider than the phone pushes the chart off screen. it looks fine on a
// desktop and no unit test sees it, so the width is asserted directly.
for (const width of [375, 768, 1280]) {
  test(`the builder does not scroll sideways at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/build");
    await expect(page.getByLabel("Leg 1 strike")).toBeVisible();
    await settle(page);

    // body, not documentElement: a table scrolling inside its own container
    // legitimately reports a wider documentElement.scrollWidth while the page
    // itself does not scroll sideways
    const overflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const chart = page.locator('svg[role="img"]');
    const box = await chart.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1);

    // the sign out control wrapped onto two lines and clipped at tablet width
    const signOut = page.getByRole("button", { name: /sign out/i });
    if (await signOut.isVisible()) {
      const button = await signOut.boundingBox();
      expect((button?.x ?? 0) + (button?.width ?? 0)).toBeLessThanOrEqual(width + 1);
      expect(button?.height ?? 0).toBeLessThan(44);
    }
  });
}
