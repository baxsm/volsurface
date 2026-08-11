import { rampHex } from "./surface-geometry";

/**
 * the scene's palette, read from the design tokens at runtime.
 *
 * three.js materials take a colour value, not a css variable, so the 3D layer
 * cannot use `var(--color-accent)` the way every svg in the app does. these were
 * loose hex literals scattered across three files, which meant the only copies
 * of the palette that could drift from the tokens were the ones nobody would
 * notice drifting. this reads the real value once instead.
 *
 * the fallbacks matter: the tokens are unavailable in jsdom, where component
 * tests render the scene without a stylesheet.
 */
const token = (name: string, fallback: string): string => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
};

export const sceneColors = () => ({
  accent: token("--color-accent", "#35e0c8"),
  border: token("--color-border", "#21252c"),
  bg: token("--color-bg", "#0a0b0d"),
  /** the pale warm top of the iv ramp, used for the fit boundary and slice cut */
  rampTop: rampHex(0.667),
  rampPeak: rampHex(1),
});
