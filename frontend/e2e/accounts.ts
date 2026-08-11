import { expect, type Page } from "@playwright/test";

/** each run needs an account that does not already exist */
export const uniqueEmail = (tag: string): string =>
  `e2e-${tag}-${process.pid}-${Date.now()}@volsurface.test`;

export const E2E_PASSWORD = "e2e-password-2026";

/**
 * sign up, waiting out the auth rate limit if the suite has already tripped it.
 *
 * the limit is 20 auth requests per minute per IP, which is a real production
 * setting worth keeping. every test in the suite comes from the same IP though,
 * so a full run legitimately hits it. retrying here keeps the limit strict in
 * the app and the suite runnable end to end, instead of loosening one to suit
 * the other.
 */
export const signUp = async (page: Page, name: string, tag: string): Promise<string> => {
  const email = uniqueEmail(tag);
  // the first throttle gets a short wait, since the bucket is often nearly
  // drained; a second one waits out the whole window
  let refresh = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto("/sign-up");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    const landed = await page
      .waitForURL("/", { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (landed) return email;

    const alert = page.getByRole("alert");
    const message = (await alert.count()) > 0 ? await alert.first().innerText() : "";
    const throttled = /too many/i.test(message);

    // anything other than the rate limit is a real failure, so it is not retried
    if (!throttled) break;

    // the client deliberately does not show the server's retry-after seconds,
    // so the wait cannot read them off the page. the window is 60s, and waiting
    // it out whole is what makes this reliable rather than nearly reliable.
    await page.waitForTimeout(refresh ? 61_000 : 15_000);
    refresh = true;
  }

  await expect(page).toHaveURL("/");
  return email;
};

/** sign in an existing account, waiting out the same rate limit sign-up can hit */
export const signIn = async (page: Page, email: string): Promise<void> => {
  let refresh = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    if (!page.url().endsWith("/sign-in")) await page.goto("/sign-in");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    const landed = await page
      .waitForURL("/", { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);

    if (landed) return;

    const alert = page.getByRole("alert");
    const message = (await alert.count()) > 0 ? await alert.first().innerText() : "";
    if (!/too many/i.test(message)) break;

    await page.waitForTimeout(refresh ? 61_000 : 15_000);
    refresh = true;
  }

  await expect(page).toHaveURL("/");
};
