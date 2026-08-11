import { type FC, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { DateScrubber } from "@/components/surface/date-scrubber";
import { SmileChart, type SmilePoint } from "@/components/surface/smile-chart";
import { SurfaceReadout } from "@/components/surface/surface-readout";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { daysBetween, longDate, money, shortDate } from "@/lib/format";
import { useSurface } from "@/lib/queries";
import { useAppStore } from "@/lib/store";
import { sliceAtExpiry, sliceAtMoneyness } from "@/lib/surface-geometry";
import type { SurfaceGrid } from "@/lib/types";
import { useActiveSnapshot } from "@/lib/use-active-snapshot";
import { useMediaQuery } from "@/lib/use-media-query";

/**
 * three and r3f are around a megabyte and this is the only view that draws in
 * 3D, so they are fetched when the surface is opened rather than shipped to
 * every route in the main bundle.
 */
const SurfaceCanvas = lazy(() =>
  import("@/components/surface/surface-canvas").then((module) => ({
    default: module.SurfaceCanvas,
  })),
);

type SliceAxis = "expiry" | "moneyness";

const Toggle: FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}> = ({ active, onClick, children, label }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    {...(label === undefined ? {} : { "aria-label": label })}
    className={`cursor-pointer rounded-sm border px-2.5 py-1 text-xs transition-colors active:translate-y-px ${
      active
        ? "border-accent-dim bg-accent-glow text-accent"
        : "border-border bg-surface-2 text-text-muted hover:border-border-strong hover:text-text"
    }`}
  >
    {children}
  </button>
);

export const SurfacePage: FC = () => {
  const { ticker, snapshotId, snapshots } = useActiveSnapshot();
  const setSnapshotId = useAppStore((s) => s.setSnapshotId);
  const surface = useSurface(snapshotId);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  const [sliceAxis, setSliceAxis] = useState<SliceAxis>("expiry");
  const [sliceIndex, setSliceIndex] = useState(0);
  const [showWireframe, setShowWireframe] = useState(true);
  const [showSlice, setShowSlice] = useState(true);

  const grid = surface.data?.grid ?? null;

  // the grid the mesh travels from on a snapshot change. holding the previous
  // one in a ref keeps the morph out of react state, so it cannot re-render the
  // canvas mid-tween.
  const previousGrid = useRef<SurfaceGrid | null>(null);
  const settledGrid = useRef<SurfaceGrid | null>(null);

  const morphFrom = grid !== null && settledGrid.current !== grid ? previousGrid.current : null;

  useEffect(() => {
    if (grid === null) return;
    if (settledGrid.current !== grid) {
      previousGrid.current = settledGrid.current;
      settledGrid.current = grid;
    }
  }, [grid]);

  // a new snapshot can be shorter than the last, so an index kept from the
  // previous fit would point past the end of this one
  const rowCount = grid?.years.length ?? 0;
  const colCount = grid?.moneyness.length ?? 0;
  const maxIndex = (sliceAxis === "expiry" ? rowCount : colCount) - 1;

  useEffect(() => {
    setSliceIndex((current) => (current > maxIndex ? Math.max(maxIndex, 0) : current));
  }, [maxIndex]);

  const safeIndex = maxIndex < 0 ? 0 : Math.min(sliceIndex, maxIndex);

  const smile = useMemo((): { points: SmilePoint[]; xLabel: string } => {
    if (grid === null) return { points: [], xLabel: "" };

    if (sliceAxis === "expiry") {
      const cut = sliceAtExpiry(grid, safeIndex);
      return {
        points: cut === null ? [] : cut.points.map((p) => ({ x: p.strike, iv: p.iv })),
        xLabel: "strike",
      };
    }

    return {
      points: sliceAtMoneyness(grid, safeIndex).map((p) => ({ x: p.years, iv: p.iv })),
      xLabel: "years to expiry",
    };
  }, [grid, sliceAxis, safeIndex]);

  const activeSlice = useMemo(() => {
    if (surface.data === undefined || grid === null) return undefined;
    if (sliceAxis !== "expiry") return undefined;
    const expiration = grid.expiries[safeIndex];
    return surface.data.slices.find((slice) => slice.expiration === expiration);
  }, [surface.data, grid, sliceAxis, safeIndex]);

  // the fitted vol nearest the money on the active cut, which is the number a
  // trader reads first
  const atmVol = useMemo(() => {
    if (grid === null || sliceAxis !== "expiry") return null;
    const row = grid.iv[safeIndex];
    if (row === undefined) return null;

    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let col = 0; col < row.length; col++) {
      const iv = row[col];
      const k = grid.moneyness[col];
      if (iv == null || k === undefined) continue;
      if (Math.abs(k) < bestDistance) {
        bestDistance = Math.abs(k);
        best = iv;
      }
    }
    return best;
  }, [grid, sliceAxis, safeIndex]);

  if (ticker === null && snapshots.isPending) {
    return <LoadingState label="Loading symbols" rows={4} />;
  }

  if (surface.isPending && snapshotId !== null) {
    return <LoadingState label="Fitting surface" rows={5} />;
  }

  if (snapshotId === null) {
    return (
      <EmptyState
        title="No stored snapshots"
        hint="The surface is built from a stored chain. Ingest one to see it."
      />
    );
  }

  if (surface.isError) {
    const error = surface.error;
    const notFitted = error instanceof ApiError && error.status === 404;

    return notFitted ? (
      <EmptyState
        title="No surface for this snapshot"
        hint="This chain has no cached fit. It may not have had enough quoted expiries to fit a surface."
      />
    ) : (
      <ErrorState
        title="Could not load the surface"
        message={error instanceof Error ? error.message : "Something went wrong."}
        onRetry={() => void surface.refetch()}
      />
    );
  }

  if (surface.data === undefined || grid === null) return null;

  const { snapshot, calendarArbFree, skippedExpirations, slices } = surface.data;
  const expirationLabel = grid.expiries[safeIndex];
  const moneynessLabel = grid.moneyness[safeIndex];

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* tall enough on a phone that the surface is still readable once the
          axis legend takes the bottom band */}
      <div className="relative min-h-[26rem] flex-1 lg:min-h-0">
        <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 p-4">
          <div>
            <h1 className="text-md text-text">{snapshot.ticker} volatility surface</h1>
            <p className="num text-xs text-text-faint">
              {longDate(snapshot.tradeDate)} &middot; spot {money(snapshot.underlyingPrice)}{" "}
              &middot; {slices.length} fitted expiries
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Toggle active={showWireframe} onClick={() => setShowWireframe((v) => !v)}>
              Wireframe
            </Toggle>
            <Toggle active={showSlice} onClick={() => setShowSlice((v) => !v)}>
              Slice
            </Toggle>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-text-faint">Loading the surface renderer</p>
            </div>
          }
        >
          <SurfaceCanvas
            grid={grid}
            previous={morphFrom}
            sliceAxis={sliceAxis}
            sliceIndex={safeIndex}
            showWireframe={showWireframe}
            showSlice={showSlice}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </div>

      <aside className="flex w-full shrink-0 flex-col border-t border-border lg:w-[22rem] lg:border-t-0 lg:border-l">
        <div className="border-b border-border">
          <DateScrubber
            snapshots={snapshots.data ?? []}
            activeId={snapshotId}
            onSelect={setSnapshotId}
          />
        </div>

        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs tracking-wide text-text-faint uppercase">Cut</span>
            <div className="flex gap-1.5">
              <Toggle active={sliceAxis === "expiry"} onClick={() => setSliceAxis("expiry")}>
                Smile
              </Toggle>
              <Toggle active={sliceAxis === "moneyness"} onClick={() => setSliceAxis("moneyness")}>
                Term
              </Toggle>
            </div>
          </div>

          <div className="mt-3 flex items-baseline justify-between gap-3">
            <span className="num text-sm text-text">
              {sliceAxis === "expiry"
                ? expirationLabel === undefined
                  ? "-"
                  : shortDate(expirationLabel)
                : moneynessLabel === undefined
                  ? "-"
                  : `k ${moneynessLabel.toFixed(2)}`}
            </span>
            <span className="num text-xs text-text-faint">
              {sliceAxis === "expiry" && expirationLabel !== undefined
                ? `${daysBetween(snapshot.tradeDate, expirationLabel)}d`
                : `${smile.points.length} expiries`}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={Math.max(maxIndex, 0)}
            step={1}
            value={safeIndex}
            onChange={(event) => setSliceIndex(Number(event.target.value))}
            aria-label={sliceAxis === "expiry" ? "Expiry to slice" : "Moneyness to slice"}
            className="mt-3 w-full cursor-pointer accent-accent"
          />

          <div className="mt-3">
            {smile.points.length > 1 ? (
              <SmileChart
                points={smile.points}
                xLabel={smile.xLabel}
                marker={sliceAxis === "expiry" ? snapshot.underlyingPrice : null}
                {...(sliceAxis === "expiry" ? { markerLabel: "spot" } : {})}
                sqrtScale={sliceAxis === "moneyness"}
              />
            ) : (
              <p className="py-6 text-center text-xs text-text-muted">
                Not enough fitted points at this cut to draw a curve.
              </p>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <SurfaceReadout
            slice={activeSlice}
            atmVol={atmVol}
            calendarArbFree={calendarArbFree}
            skippedExpirations={skippedExpirations}
            summary={{
              expiryCount: slices.length,
              quoteCount: slices.reduce((total, fit) => total + fit.quoteCount, 0),
              butterflyArbFreeCount: slices.filter((fit) => fit.butterflyArbFree).length,
              repairedCount: slices.filter((fit) => fit.calendarRepaired === true).length,
            }}
          />
        </div>
      </aside>
    </div>
  );
};
