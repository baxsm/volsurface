import { describe, expect, it } from "vitest";
import { normCdf, normInvCdf, normPdf } from "../normal";

describe("normPdf", () => {
  it("matches known values", () => {
    expect(normPdf(0)).toBeCloseTo(0.398_942_280_401_433, 14);
    expect(normPdf(1)).toBeCloseTo(0.241_970_724_519_143, 14);
    expect(normPdf(-2)).toBeCloseTo(0.053_990_966_513_188, 14);
  });

  it("is symmetric", () => {
    for (const x of [0.3, 1.7, 3.2]) {
      expect(normPdf(x)).toBe(normPdf(-x));
    }
  });

  it("integrates to ~1 over a wide grid", () => {
    const h = 0.001;
    let sum = 0;
    for (let x = -10; x <= 10; x += h) sum += normPdf(x) * h;
    expect(sum).toBeCloseTo(1, 6);
  });
});

describe("normCdf", () => {
  it("matches reference values to 1e-12", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 15);
    expect(normCdf(1)).toBeCloseTo(0.841_344_746_068_543, 12);
    expect(normCdf(-1)).toBeCloseTo(0.158_655_253_931_457, 12);
    expect(normCdf(1.96)).toBeCloseTo(0.975_002_104_851_78, 12);
    expect(normCdf(-3)).toBeCloseTo(0.001_349_898_031_63, 12);
    expect(normCdf(5)).toBeCloseTo(0.999_999_713_348_428, 12);
  });

  it("stays accurate in the deep tail where a-s approximations break down", () => {
    // a-s 5-term is ~7.5e-8 absolute, which swamps these values entirely.
    // asserted on RELATIVE error - absolute tolerance is meaningless at 1e-16.
    const relErr = (got: number, want: number) => Math.abs(got / want - 1);
    expect(relErr(normCdf(-6), 9.865_876_450_377e-10)).toBeLessThan(1e-10);
    expect(relErr(normCdf(-8), 6.220_960_574_147e-16)).toBeLessThan(1e-10);
    expect(relErr(normCdf(-10), 7.619_853_024_16e-24)).toBeLessThan(1e-9);
  });

  it("satisfies the reflection identity", () => {
    for (const x of [0.1, 0.9, 2.5, 4.4, 7.1]) {
      expect(normCdf(x) + normCdf(-x)).toBeCloseTo(1, 15);
    }
  });

  it("is monotonic and bounded", () => {
    let prev = 0;
    for (let x = -8; x <= 8; x += 0.05) {
      const v = normCdf(x);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
  });

  it("differentiates back to the pdf", () => {
    const h = 1e-5;
    for (const x of [-2, -0.5, 0, 1.3]) {
      const fd = (normCdf(x + h) - normCdf(x - h)) / (2 * h);
      expect(fd).toBeCloseTo(normPdf(x), 8);
    }
  });
});

describe("normInvCdf", () => {
  it("matches reference quantiles", () => {
    expect(normInvCdf(0.5)).toBeCloseTo(0, 12);
    expect(normInvCdf(0.975)).toBeCloseTo(1.959_963_984_540_054, 10);
    expect(normInvCdf(0.025)).toBeCloseTo(-1.959_963_984_540_054, 10);
    expect(normInvCdf(0.99)).toBeCloseTo(2.326_347_874_040_841, 10);
  });

  it("round-trips against normCdf across the range", () => {
    for (let p = 0.0001; p < 1; p += 0.0137) {
      expect(normCdf(normInvCdf(p))).toBeCloseTo(p, 12);
    }
  });

  it("handles the tail branches", () => {
    // asserted by round-trip rather than a copied constant: cdf is the verified
    // primitive here, so inverting through it is the trustworthy oracle
    for (const p of [1e-10, 1e-7, 1 - 1e-7]) {
      expect(normCdf(normInvCdf(p))).toBeCloseTo(p, 15);
    }
    expect(normInvCdf(1e-10)).toBeLessThan(-6.3);
    expect(normInvCdf(1e-10)).toBeGreaterThan(-6.4);
    expect(normInvCdf(1 - 1e-10)).toBeCloseTo(-normInvCdf(1e-10), 6);
  });

  it("returns infinities at the boundary and NaN outside", () => {
    expect(normInvCdf(0)).toBe(Number.NEGATIVE_INFINITY);
    expect(normInvCdf(1)).toBe(Number.POSITIVE_INFINITY);
    expect(normInvCdf(-0.1)).toBeNaN();
    expect(normInvCdf(1.1)).toBeNaN();
  });
});
