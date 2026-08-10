import { describe, expect, it } from "vitest";
import type { SviParams, SviQuote } from "../../types";
import {
  butterflyViolations,
  fitSviSlice,
  isButterflyArbFree,
  MIN_QUOTES_PER_SLICE,
  projectToArbFree,
  sviImpliedVol,
  sviTotalVariance,
} from "../svi";

const params = (over: Partial<SviParams> = {}): SviParams => ({
  a: 0.04,
  b: 0.1,
  rho: -0.3,
  m: 0.0,
  sigma: 0.2,
  ...over,
});

const quotesFrom = (source: SviParams, ks: number[], weight = 1): SviQuote[] =>
  ks.map((k) => ({ k, w: sviTotalVariance(source, k), weight }));

const SPREAD = [-0.5, -0.35, -0.2, -0.1, 0, 0.1, 0.2, 0.35, 0.5];

describe("sviTotalVariance", () => {
  it("reduces to a + b*sigma at the vertex", () => {
    const p = params({ m: 0.1 });
    expect(sviTotalVariance(p, 0.1)).toBeCloseTo(p.a + p.b * p.sigma, 12);
  });

  it("is asymptotically linear in the wings", () => {
    const p = params();
    // far from the vertex the sqrt term approaches |k-m|, so the slopes are
    // b*(rho+1) up and b*(rho-1) down
    const far = 500;
    const up = (sviTotalVariance(p, far + 1) - sviTotalVariance(p, far)) / 1;
    const down = (sviTotalVariance(p, -far) - sviTotalVariance(p, -far - 1)) / 1;
    expect(up).toBeCloseTo(p.b * (1 + p.rho), 6);
    expect(down).toBeCloseTo(p.b * (p.rho - 1), 6);
  });

  it("is convex in k", () => {
    const p = params();
    const h = 0.01;
    for (let k = -1; k <= 1; k += 0.1) {
      const second =
        (sviTotalVariance(p, k + h) - 2 * sviTotalVariance(p, k) + sviTotalVariance(p, k - h)) /
        (h * h);
      expect(second).toBeGreaterThan(-1e-9);
    }
  });
});

describe("sviImpliedVol", () => {
  it("inverts total variance back to vol", () => {
    const p = params();
    const t = 0.5;
    const k = 0.15;
    const iv = sviImpliedVol(p, k, t);
    expect(iv).not.toBeNull();
    expect((iv as number) ** 2 * t).toBeCloseTo(sviTotalVariance(p, k), 12);
  });

  it("returns null for non-positive expiry", () => {
    expect(sviImpliedVol(params(), 0, 0)).toBeNull();
    expect(sviImpliedVol(params(), 0, -1)).toBeNull();
  });

  it("returns null when total variance is non-positive", () => {
    // a slice sitting at zero level with no width has zero variance at the vertex
    expect(sviImpliedVol({ a: 0, b: 0, rho: 0, m: 0, sigma: 1e-6 }, 0, 1)).toBeNull();
  });
});

describe("butterflyViolations", () => {
  it("accepts a well-formed slice", () => {
    expect(butterflyViolations(params())).toEqual([]);
    expect(isButterflyArbFree(params())).toBe(true);
  });

  it("rejects negative b", () => {
    expect(butterflyViolations(params({ b: -0.1 }))).toContain("b must be non-negative");
  });

  it("rejects non-positive sigma", () => {
    expect(butterflyViolations(params({ sigma: 0 }))).toContain("sigma must be positive");
  });

  it("rejects rho outside (-1, 1)", () => {
    expect(butterflyViolations(params({ rho: -1 }))).toContain("rho must lie in (-1, 1)");
    expect(butterflyViolations(params({ rho: 1 }))).toContain("rho must lie in (-1, 1)");
  });

  it("rejects a wing slope above 2", () => {
    // b*(1+|rho|) = 2.5*1.2 = 3 > 2
    const bad = butterflyViolations({ a: 0.04, b: 2.5, rho: -0.2, m: 0, sigma: 3 });
    expect(bad).toContain("wing slope b*(1+|rho|) exceeds 2");
  });

  it("rejects a slice whose minimum total variance is negative", () => {
    const bad = butterflyViolations({ a: -0.5, b: 0.1, rho: 0, m: 0, sigma: 0.2 });
    expect(bad).toContain("a + b*sigma*sqrt(1-rho^2) is negative");
  });

  it("rejects sigma below the vertex bound", () => {
    // b=1.5, rho=0 -> minimum sigma is 0.75
    const bad = butterflyViolations({ a: 1, b: 1.5, rho: 0, m: 0, sigma: 0.1 });
    expect(bad).toContain("sigma below the vertex bound");
  });

  it("reports structural problems before shape problems", () => {
    // sigma is both non-positive and below the vertex bound. only the
    // structural complaint should come back, so the message is unambiguous
    expect(butterflyViolations({ a: 1, b: 1.5, rho: 0, m: 0, sigma: -1 })).toEqual([
      "sigma must be positive",
    ]);
  });
});

describe("projectToArbFree", () => {
  it("leaves an already valid slice untouched", () => {
    const p = params();
    expect(projectToArbFree(p)).toEqual(p);
  });

  it("makes every violating slice arb-free", () => {
    const broken: SviParams[] = [
      { a: -5, b: 0.1, rho: 0, m: 0, sigma: 0.2 },
      { a: 0.04, b: 9, rho: -0.9, m: 0, sigma: 0.01 },
      { a: 0.04, b: 1.9, rho: 0.99, m: 0.2, sigma: 0.001 },
      { a: 0, b: -3, rho: -2, m: 0, sigma: -1 },
      { a: 0.01, b: 2, rho: 0, m: -0.5, sigma: 0.05 },
    ];
    for (const p of broken) {
      const fixed = projectToArbFree(p);
      expect(butterflyViolations(fixed)).toEqual([]);
    }
  });

  it("is idempotent", () => {
    const once = projectToArbFree({ a: -5, b: 9, rho: -3, m: 0.1, sigma: -2 });
    expect(projectToArbFree(once)).toEqual(once);
  });

  it("never moves m", () => {
    expect(projectToArbFree({ a: -5, b: 9, rho: -3, m: 0.37, sigma: -2 }).m).toBe(0.37);
  });
});

describe("fitSviSlice", () => {
  it("recovers the generating parameters from clean synthetic quotes", () => {
    const truth = params({ a: 0.03, b: 0.12, rho: -0.4, m: 0.05, sigma: 0.15 });
    const fit = fitSviSlice("2026-12-18", 0.5, quotesFrom(truth, SPREAD));

    expect(fit).not.toBeNull();
    const slice = fit as NonNullable<typeof fit>;
    expect(slice.rmse).toBeLessThan(1e-5);
    // the curve is what matters, not the parameter vector - (m, sigma) trade
    // off against each other along a flat valley, so compare fitted values
    for (const k of SPREAD) {
      expect(sviTotalVariance(slice.params, k)).toBeCloseTo(sviTotalVariance(truth, k), 5);
    }
  });

  it("produces an arb-free slice even from noisy quotes", () => {
    const truth = params({ a: 0.05, b: 0.3, rho: -0.6, m: 0.02, sigma: 0.1 });
    const noisy = quotesFrom(truth, SPREAD).map((q, i) => ({
      ...q,
      // deterministic jitter so the test cannot flake
      w: q.w * (1 + 0.05 * Math.sin(i * 2.4)),
    }));

    const fit = fitSviSlice("2026-12-18", 0.75, noisy);
    expect(fit).not.toBeNull();
    expect((fit as NonNullable<typeof fit>).butterflyArbFree).toBe(true);
  });

  it("returns null when the slice has too few quotes to fit five parameters", () => {
    const truth = params();
    const thin = quotesFrom(truth, [-0.1, 0, 0.1, 0.2]);
    expect(thin.length).toBeLessThan(MIN_QUOTES_PER_SLICE);
    expect(fitSviSlice("2026-12-18", 0.5, thin)).toBeNull();
  });

  it("returns null for a non-positive expiry", () => {
    expect(fitSviSlice("2026-12-18", 0, quotesFrom(params(), SPREAD))).toBeNull();
  });

  it("drops unusable quotes before counting them", () => {
    const good = quotesFrom(params(), SPREAD.slice(0, 5));
    const polluted: SviQuote[] = [
      ...good,
      { k: Number.NaN, w: 0.1, weight: 1 },
      { k: 0.1, w: Number.POSITIVE_INFINITY, weight: 1 },
      { k: 0.2, w: -0.5, weight: 1 },
      { k: 0.3, w: 0.1, weight: 0 },
    ];
    const fit = fitSviSlice("2026-12-18", 0.5, polluted);
    expect(fit).not.toBeNull();
    expect((fit as NonNullable<typeof fit>).quoteCount).toBe(5);
  });

  it("weights high-weight quotes more heavily", () => {
    const base = params();
    const ks = SPREAD;
    // one clear outlier. with a tiny weight the fit should mostly ignore it
    const withOutlier = (outlierWeight: number): SviQuote[] =>
      ks.map((k) => ({
        k,
        w: k === 0 ? sviTotalVariance(base, k) * 3 : sviTotalVariance(base, k),
        weight: k === 0 ? outlierWeight : 1,
      }));

    const ignored = fitSviSlice("2026-12-18", 0.5, withOutlier(1e-6));
    const respected = fitSviSlice("2026-12-18", 0.5, withOutlier(1000));

    const atVertexIgnored = sviTotalVariance((ignored as NonNullable<typeof ignored>).params, 0);
    const atVertexRespected = sviTotalVariance(
      (respected as NonNullable<typeof respected>).params,
      0,
    );
    expect(atVertexRespected).toBeGreaterThan(atVertexIgnored);
  });

  it("reports the quote count and a finite rmse", () => {
    const fit = fitSviSlice("2026-12-18", 0.5, quotesFrom(params(), SPREAD));
    const slice = fit as NonNullable<typeof fit>;
    expect(slice.quoteCount).toBe(SPREAD.length);
    expect(Number.isFinite(slice.rmse)).toBe(true);
    expect(slice.expiration).toBe("2026-12-18");
    expect(slice.t).toBe(0.5);
  });
});
