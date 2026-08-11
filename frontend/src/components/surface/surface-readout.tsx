import type { FC } from "react";
import { decimal, integer, percent, shortDate } from "@/lib/format";
import type { SviSlice } from "@/lib/types";

interface StatusPillProps {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}

export const StatusPill: FC<StatusPillProps> = ({ ok, okLabel, badLabel }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${
      ok ? "border-pos/30 bg-pos/10 text-pos" : "border-warn/30 bg-warn/10 text-warn"
    }`}
  >
    <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-pos" : "bg-warn"}`} />
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
        <Row label="ATM vol" value={percent(atmVol, 2)} />
        <Row label="Fit error" hint="rmse, total variance" value={decimal(slice.rmse, 5)} />
        <Row label="Quotes fitted" value={integer(slice.quoteCount)} />
        <Row
          label="Quoted range"
          hint="log-moneyness"
          value={`${decimal(slice.kMin, 3)} to ${decimal(slice.kMax, 3)}`}
        />
      </div>

      <p className="mt-4 mb-1 text-xs tracking-wide text-text-faint uppercase">SVI parameters</p>
      <div className="divide-y divide-border border-t border-border">
        <Row label="a" hint="level" value={decimal(params.a, 5)} />
        <Row label="b" hint="wing slope" value={decimal(params.b, 5)} />
        <Row label="rho" hint="skew" value={decimal(params.rho, 5)} />
        <Row label="m" hint="vertex shift" value={decimal(params.m, 5)} />
        <Row label="sigma" hint="roundness" value={decimal(params.sigma, 5)} />
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
