import type { FC, ReactNode } from "react";
import { Logo } from "@/components/shell/logo";

/**
 * the left panel gives context about what the product is, per the ui rules -
 * a bare form on a gradient is the template look we are avoiding. the curve is
 * a real smile shape (down-sloping equity skew), not decorative noise.
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

      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-52 w-full opacity-50"
        viewBox="0 0 480 160"
        fill="none"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="auth-smile-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.16" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* stacked smile curves: each further slice is flatter and fainter, the
            shape a real term structure makes */}
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M0 ${104 - i * 18} C 120 ${62 - i * 14}, 200 ${44 - i * 9}, 300 ${54 - i * 8} S 420 ${74 - i * 7}, 480 ${66 - i * 7}`}
            stroke="var(--color-accent)"
            strokeOpacity={0.5 - i * 0.1}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
        ))}
        <path
          d="M0 104 C 120 62, 200 44, 300 54 S 420 74, 480 66 L480 160 L0 160 Z"
          fill="url(#auth-smile-fill)"
        />
      </svg>
    </div>

    <div className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  </div>
);
