import type { SurfaceGrid, SviSliceFit } from "../types";
import { sviImpliedVol } from "./svi";

export interface GridOptions {
  /** number of strike samples across the moneyness window. defaults to 48 */
  strikeSteps?: number;
  /** widest log-moneyness sampled either side of the forward. defaults to 0.6 */
  kRange?: number;
  /**
   * sample beyond the range each slice's quotes covered. off by default: the
   * SVI wings are linear extrapolations, so rendering them as surface would
   * show invented structure where the market never quoted.
   */
  extrapolate?: boolean;
}

/**
 * sample the fitted slices into a dense mesh for the 3D view.
 *
 * the mesh is built in log-moneyness and converted to strikes per expiry, so
 * every expiry is sampled over the same moneyness window rather than the same
 * absolute strikes. sampling absolute strikes would push far expiries far
 * out-of-the-money and render a surface that droops for a reason that is an
 * artefact of the grid, not the market.
 */
export const buildSurfaceGrid = (
  slices: SviSliceFit[],
  forwards: Map<string, number>,
  options: GridOptions = {},
): SurfaceGrid => {
  const strikeSteps = options.strikeSteps ?? 48;
  const kRange = options.kRange ?? 0.6;

  const sorted = [...slices].sort((x, y) => x.t - y.t);
  const moneyness: number[] = [];
  for (let i = 0; i < strikeSteps; i++) {
    moneyness.push(-kRange + (2 * kRange * i) / (strikeSteps - 1));
  }

  const expiries = sorted.map((slice) => slice.expiration);
  const years = sorted.map((slice) => slice.t);
  const strikes: number[][] = [];
  const iv: (number | null)[][] = [];

  const extrapolate = options.extrapolate ?? false;

  for (const slice of sorted) {
    const forward = forwards.get(slice.expiration);
    const row: (number | null)[] = [];
    const strikeRow: number[] = [];

    for (const k of moneyness) {
      const supported = extrapolate || (k >= slice.kMin && k <= slice.kMax);
      row.push(supported ? sviImpliedVol(slice.params, k, slice.t) : null);
      strikeRow.push(forward === undefined ? Number.NaN : forward * Math.exp(k));
    }

    iv.push(row);
    strikes.push(strikeRow);
  }

  return { moneyness, expiries, years, strikes, iv };
};
