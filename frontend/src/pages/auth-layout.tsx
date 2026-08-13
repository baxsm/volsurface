import { LinearGradient } from "@visx/gradient";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, LinePath } from "@visx/shape";
import type { FC, ReactNode } from "react";
import { Logo } from "@/components/shell/logo";
import { sviImpliedVol } from "@/engine/surface/svi";
import type { SviParams } from "@/engine/types";

interface CurvePoint {
  k: number;
  iv: number;
}

/**
 * a real down-sloping equity skew, evaluated through the same SVI function the
 * surface is fitted with rather than drawn as invented bezier handles. negative
 * rho is what tilts the smile down to the left; each further slice is longer
 * dated, which is why it flattens.
 */
const SKEW: SviParams = { a: 0.028, b: 0.14, rho: -0.62, m: 0.02, sigma: 0.18 };
const SLICE_YEARS = [0.12, 0.35, 0.75, 1.4] as const;
const CURVE_STEPS = 64;
const K_MIN = -0.55;
const K_MAX = 0.45;

const slice = (years: number): CurvePoint[] => {
  const points: CurvePoint[] = [];
  for (let i = 0; i <= CURVE_STEPS; i++) {
    const k = K_MIN + ((K_MAX - K_MIN) * i) / CURVE_STEPS;
    const iv = sviImpliedVol(SKEW, k, years);
    if (iv === null) continue;
    points.push({ k, iv });
  }
  return points;
};

const CURVES = SLICE_YEARS.map(slice);
const ALL_IV = CURVES.flat().map((p) => p.iv);
const IV_MIN = Math.min(...ALL_IV);
const IV_MAX = Math.max(...ALL_IV);

const SkewBackdrop: FC<{ width: number; height: number }> = ({ width, height }) => {
  const x = scaleLinear<number>({ domain: [K_MIN, K_MAX], range: [0, width] });
  // the curves are framed inside the band rather than across its full height:
  // the steep front slice would otherwise run off the bottom edge and read as
  // clipped instead of as a stack of smiles
  const y = scaleLinear<number>({
    domain: [IV_MIN * 0.88, IV_MAX * 1.02],
    range: [height * 0.82, height * 0.12],
  });

  return (
    <svg
      className="pointer-events-none h-full w-full opacity-50"
      width={width}
      height={height}
      aria-hidden="true"
    >
      <LinearGradient
        id="auth-smile-fill"
        vertical
        from="var(--color-accent)"
        to="var(--color-accent)"
        fromOpacity={0.16}
        toOpacity={0}
      />

      <AreaClosed<CurvePoint>
        data={CURVES[0] ?? []}
        x={(d) => x(d.k)}
        y={(d) => y(d.iv)}
        yScale={y}
        fill="url(#auth-smile-fill)"
      />

      {CURVES.map((curve, i) => (
        <LinePath<CurvePoint>
          key={SLICE_YEARS[i]}
          data={curve}
          x={(d) => x(d.k)}
          y={(d) => y(d.iv)}
          stroke="var(--color-accent)"
          strokeOpacity={0.5 - i * 0.1}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
};

/**
 * the left panel gives context about what the product is, per the ui rules -
 * a bare form on a gradient is the template look we are avoiding.
 */
export const AuthLayout: FC<{ children: ReactNode }> = ({ children }) => (
  <div className="grid min-h-dvh grid-cols-1 bg-bg lg:grid-cols-[1.1fr_1fr]">
    <div className="relative hidden flex-col overflow-hidden border-r border-border bg-surface p-12 lg:flex">
      <div className="flex items-center gap-2.5">
        <Logo size={20} />
        <span className="text-md font-medium tracking-tight">volsurface</span>
      </div>

      <div className="relative z-10 my-auto max-w-md">
        <h1 className="text-xl leading-tight tracking-tight">
          Read the whole volatility surface, not one number at a time.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-text-muted">
          Price American and European options against a real option chain, solve implied volatility
          per contract, and see the arbitrage-free surface the quotes imply.
        </p>
        <ul className="mt-8 space-y-2.5 text-sm text-text-muted">
          {[
            "CRR binomial trees with early exercise",
            "Implied vol solved per contract, convergence shown",
            "SVI slices fitted arbitrage-free by construction",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-1.5 h-px w-3 shrink-0 bg-accent-dim" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52">
        <ParentSize initialSize={{ width: 480, height: 208 }}>
          {({ width, height }) =>
            width < 1 ? null : <SkewBackdrop width={width} height={height} />
          }
        </ParentSize>
      </div>
    </div>

    <div className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  </div>
);
