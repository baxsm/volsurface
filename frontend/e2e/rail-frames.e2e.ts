import { expect, test } from "@playwright/test";

/**
 * the collapse is a 200ms transition, so a single before/after screenshot says
 * nothing about what it looks like while it runs. this samples the icon and
 * label geometry every frame across the whole animation.
 */
test("collapsing the rail does not make the nav icons jump", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const rail = page.locator('nav[aria-label="Main"]');
  await expect(rail).toBeVisible();

  const samples = await page.evaluate(async () => {
    const rail = document.querySelector('nav[aria-label="Main"]') as HTMLElement;
    const button = Array.from(document.querySelectorAll("button")).find((b) =>
      /(Collapse|Expand) sidebar/.test(b.getAttribute("aria-label") ?? ""),
    ) as HTMLButtonElement;

    const read = (t: number) => {
      const firstLink = rail.querySelector("a") as HTMLElement | null;
      const glyph = firstLink?.querySelector("svg") ?? null;
      const label = firstLink?.querySelector("span") ?? null;
      return {
        t,
        railW: Math.round(rail.getBoundingClientRect().width),
        linkW: firstLink === null ? null : Math.round(firstLink.getBoundingClientRect().width),
        glyphX: glyph === null ? null : Math.round(glyph.getBoundingClientRect().x),
        labelPresent: label !== null,
        labelOpacity: label === null ? null : getComputedStyle(label).opacity,
      };
    };

    const out = [read(0)];
    const start = performance.now();
    button.click();

    await new Promise<void>((resolve) => {
      const tick = () => {
        const t = performance.now() - start;
        out.push(read(Math.round(t)));
        if (t < 340) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    return out;
  });

  const glyphXs = samples.map((s) => s.glyphX).filter((x): x is number => x !== null);
  const jumps: number[] = [];
  for (let i = 1; i < glyphXs.length; i++) {
    const delta = Math.abs((glyphXs[i] as number) - (glyphXs[i - 1] as number));
    if (delta > 3) jumps.push(delta);
  }

  // the glyph sits in a fixed left column, so it must not move at all while the
  // rail narrows around it. centring it on collapse threw it 76px right on the
  // first frame and walked it back over the remaining 200ms.
  expect(jumps).toEqual([]);
  // and the label fades rather than being dropped from the tree, which used to
  // make the text vanish before the rail had moved
  expect(samples.every((s) => s.labelPresent)).toBe(true);
  expect(samples.at(-1)?.labelOpacity).toBe("0");
});

test("expanding the rail is as steady as collapsing it", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  // collapse first, settle, then measure the way back out
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.waitForTimeout(400);

  const samples = await page.evaluate(async () => {
    const rail = document.querySelector('nav[aria-label="Main"]') as HTMLElement;
    const button = Array.from(document.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-label") === "Expand sidebar",
    ) as HTMLButtonElement;

    const read = () => {
      const glyph = rail.querySelector("a svg");
      return glyph === null ? null : Math.round(glyph.getBoundingClientRect().x);
    };

    const out: (number | null)[] = [read()];
    const start = performance.now();
    button.click();

    await new Promise<void>((resolve) => {
      const tick = () => {
        out.push(read());
        if (performance.now() - start < 340) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    return out;
  });

  const xs = samples.filter((x): x is number => x !== null);
  const jumps = xs.slice(1).filter((x, i) => Math.abs(x - (xs[i] as number)) > 3);
  expect(jumps).toEqual([]);
});

test("the collapsed rail centres its icons", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.waitForTimeout(500);

  // the rail narrowed around a fixed left inset, which was right while it was
  // wide and left every glyph 6px off-centre once it was not. measured rather
  // than eyeballed: this is exactly the class of bug a screenshot hides.
  const gaps = await page.evaluate(() => {
    const nav = document.querySelector("nav[aria-label='Main']");
    if (nav === null) return [];
    const bounds = nav.getBoundingClientRect();
    const marks = [...nav.querySelectorAll("a svg"), ...nav.querySelectorAll("button svg")];
    return marks.map((mark) => {
      const box = mark.getBoundingClientRect();
      return Math.round(box.left - bounds.left - (bounds.right - box.right));
    });
  });

  expect(gaps.length).toBeGreaterThan(5);
  for (const gap of gaps) expect(Math.abs(gap)).toBeLessThanOrEqual(1);
});
