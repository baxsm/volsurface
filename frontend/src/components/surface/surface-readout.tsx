import { Check, TriangleAlert } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { FC } from "react";
import { decimal, integer, percent, shortDate } from "@/lib/format";
import type { SviSlice } from "@/lib/types";
import { useCountUp } from "@/lib/use-count-up";

interface StatusPillProps {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}

export const StatusPill: FC<StatusPillProps> = ({ ok, okLabel, badLabel }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors duration-200 ${
      ok ? "border-pos/30 bg-pos/10 text-pos" : "border-warn/30 bg-warn/10 text-warn"
    }`}
  >
    {/* a mark as well as a hue, so pass and fail are not told apart by colour
        alone */}
    {ok ? (
      <Check size={11} strokeWidth={2.5} aria-hidden="true" />
    ) : (
      <TriangleAlert size={11} strokeWidth={2} aria-hidden="true" />
    )}
    {ok ? okLabel : badLabel}
  </span>
);

interface SurfaceReadoutProps {
  /** undefined on a term cut, which crosses every expiry rather than sitting on one */
  slice: SviSlice | undefined;
  atmVol: number | null;
  calendarArbFree: boolean;
  skippedExpirations: string[];
  /** the whole fit, shown when the cut does not belong to a single slice */
  summary: {
    expiryCount: number;
    quoteCount: number;
    butterflyArbFreeCount: number;
    repairedCount: number;
  };
}

const Row: FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="flex items-baseline justify-between gap-3 py-1.5">
    <span className="text-xs text-text-muted">
      {label}
      {hint !== undefined && <span className="ml-1.5 text-text-faint">{hint}</span>}
    </span>
    <span className="num text-sm text-text">{value}</span>
  </div>
);

/**
 * the same row for a figure that changes as the slice plane sweeps. dragging
 * the slider used to flicker every number here between fits while the mesh
 * beside them morphed smoothly, so they tween now for the same reason the
 * payoff metrics do.
 */
const NumberRow: FC<{
  label: string;
  value: number | null;
  format: (value: number | null) => string;
  /** a count rather than a measurement, so it never shows a fraction mid-tween */
  whole?: boolean;
  hint?: string;
}> = ({ label, value, format, whole = false, hint }) => {
  const reduced = useReducedMotion();
  const raw = useCountUp(value ?? 0, reduced !== true && value !== null);
  const shown = whole ? Math.round(raw) : raw;

  return (
    <Row
      label={label}
      value={value === null ? format(null) : format(shown)}
      // spread rather than hint={hint}: exactOptionalPropertyTypes refuses an
      // explicit undefined for an optional prop
      {...(hint === undefined ? {} : { hint })}
    />
  );
};

/**
 * the fitted parameters behind the slice under the plane. this is what makes
 * the surface readable as a fit rather than a picture: five SVI numbers, the
 * error they achieved, and whether the result is arbitrage-free.
 */
export const SurfaceReadout: FC<SurfaceReadoutProps> = ({
  slice,
  atmVol,
  calendarArbFree,
  skippedExpirations,
  summary,
}) => {
  // a term cut runs across every expiry, so no single set of SVI parameters
  // describes it. the fit as a whole still does, and showing that beats leaving
  // the panel empty.
  if (slice === undefined) {
    return (
      <div className="px-4 pb-4">
        <div className="flex flex-wrap items-center gap-2 py-3">
          <StatusPill
            ok={summary.butterflyArbFreeCount === summary.expiryCount}
            okLabel="Every slice butterfly arb-free"
            badLabel={`${summary.expiryCount - summary.butterflyArbFreeCount} slice with butterfly arb`}
          />
          <StatusPill
            ok={calendarArbFree}
            okLabel="Calendar arb-free"
            badLabel="Calendar arb present"
          />
        </div>

        <p className="pb-3 text-xs text-text-muted">
          A term cut crosses every expiry, so it has no single set of SVI parameters. Switch to a
          smile cut to read one slice.
        </p>

        <div className="divide-y divide-border border-t border-border">
          <Row label="Expiries fitted" value={integer(summary.expiryCount)} />
          <Row
            label="Quotes fitted"
            hint="across the surface"
            value={integer(summary.quoteCount)}
          />
          {summary.repairedCount > 0 && (
            <Row
              label="Slices lifted"
              hint="to clear an earlier expiry"
              value={integer(summary.repairedCount)}
            />
          )}
        </div>

        {skippedExpirations.length > 0 && (
          <p className="mt-4 text-xs text-text-muted">
            {skippedExpirations.length} expiry
            {skippedExpirations.length === 1 ? "" : " dates"} had too few usable quotes to fit:{" "}
            <span className="num text-text-faint">
              {skippedExpirations.map((date) => shortDate(date)).join(", ")}
            </span>
          </p>
        )}
      </div>
    );
  }

  const { params } = slice;

  return (
    <div className="px-4 pb-4">
      <div className="flex flex-wrap items-center gap-2 py-3">
        <StatusPill
          ok={slice.butterflyArbFree}
          okLabel="Butterfly arb-free"
          badLabel="Butterfly arb present"
        />
        <StatusPill
          ok={calendarArbFree}
          okLabel="Calendar arb-free"
          badLabel="Calendar arb present"
        />
        {slice.calendarRepaired === true && (
          <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs text-text-muted">
            Lifted to clear an earlier slice
          </span>
        )}
      </div>

      <div className="divide-y divide-border border-t border-border">
        <NumberRow label="ATM vol" value={atmVol} format={(v) => percent(v, 2)} />
        <NumberRow
          label="Fit error"
          hint="rmse, total variance"
          value={slice.rmse}
          format={(v) => decimal(v, 5)}
        />
        <NumberRow label="Quotes fitted" value={slice.quoteCount} format={integer} whole />
        <Row
          label="Quoted range"
          hint="log-moneyness"
          value={`${decimal(slice.kMin, 3)} to ${decimal(slice.kMax, 3)}`}
        />
      </div>

      <h3 className="mt-4 mb-1 text-xs tracking-wide text-text-faint uppercase">SVI parameters</h3>
      <div className="divide-y divide-border border-t border-border">
        <NumberRow label="a" hint="level" value={params.a} format={(v) => decimal(v, 5)} />
        <NumberRow label="b" hint="wing slope" value={params.b} format={(v) => decimal(v, 5)} />
        <NumberRow label="rho" hint="skew" value={params.rho} format={(v) => decimal(v, 5)} />
        <NumberRow label="m" hint="vertex shift" value={params.m} format={(v) => decimal(v, 5)} />
        <NumberRow
          label="sigma"
          hint="roundness"
          value={params.sigma}
          format={(v) => decimal(v, 5)}
        />
      </div>

      {skippedExpirations.length > 0 && (
        <p className="mt-4 text-xs text-text-muted">
          {skippedExpirations.length} expiry
          {skippedExpirations.length === 1 ? "" : " dates"} had too few usable quotes to fit:{" "}
          <span className="num text-text-faint">
            {skippedExpirations.map((date) => shortDate(date)).join(", ")}
          </span>
        </p>
      )}
    </div>
  );
};
