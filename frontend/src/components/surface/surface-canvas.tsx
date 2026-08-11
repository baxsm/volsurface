import { Canvas } from "@react-three/fiber";
import { type FC, useMemo } from "react";
import { decimal, percent } from "@/lib/format";
import { type SurfaceBounds, surfaceBounds } from "@/lib/surface-geometry";
import type { SurfaceGrid } from "@/lib/types";
import { SurfaceMeshView } from "./surface-mesh";
import { Controls, SlicePlane, Stage, StudioLights } from "./surface-scene";

interface SurfaceCanvasProps {
  grid: SurfaceGrid;
  previous: SurfaceGrid | null;
  sliceAxis: "expiry" | "moneyness";
  sliceIndex: number;
  showWireframe: boolean;
  showSlice: boolean;
  reducedMotion: boolean;
  onMorphSettled?: () => void;
}

/** the axis legend, rendered as DOM rather than in-scene text. drei's Text
    pulls a font from a CDN, and the app self-hosts every font it uses. */
const AxisLegend: FC<{ grid: SurfaceGrid; bounds: SurfaceBounds }> = ({ grid, bounds }) => {
  const strikes = useMemo(() => {
    const all = grid.strikes.flat().filter((value) => Number.isFinite(value));
    if (all.length === 0) return null;
    return { min: Math.min(...all), max: Math.max(...all) };
  }, [grid]);

  return (
    /* fades into the canvas rather than floating bare over the mesh: overlaid
       on a phone the ticks land right on the surface and neither reads */
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-x-6 gap-y-2 bg-gradient-to-t from-bg via-bg/85 to-transparent px-4 pt-8 pb-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <dt className="text-xs text-text-faint">Moneyness</dt>
          <dd className="num text-xs text-text-muted">
            {decimal(bounds.minMoneyness, 2)} to {decimal(bounds.maxMoneyness, 2)}
          </dd>
        </div>
        {strikes !== null && (
          <div>
            <dt className="text-xs text-text-faint">Strike</dt>
            <dd className="num text-xs text-text-muted">
              {decimal(strikes.min, 0)} to {decimal(strikes.max, 0)}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-text-faint">Expiry</dt>
          <dd className="num text-xs text-text-muted">
            {decimal(bounds.minYears, 2)}y to {decimal(bounds.maxYears, 2)}y
          </dd>
        </div>
      </dl>

      <div className="flex items-center gap-2">
        <span className="num text-xs text-text-faint">{percent(bounds.minIv, 0)}</span>
        <div className="relative">
          <div
            className="h-1.5 w-28 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, #12233a 0%, #2e8aa6 33%, #6fe9c8 67%, #f2e9a0 100%)",
            }}
          />
          {/* the ramp is spaced by the same compression the surface uses, so the
              midpoint tick sits where that vol actually falls on the gradient */}
          <span
            className="num absolute -top-4.5 -translate-x-1/2 text-[0.625rem] leading-none text-text-faint"
            style={{ left: "50%" }}
          >
            {percent(bounds.minIv + (bounds.maxIv - bounds.minIv) * 0.25, 0)}
          </span>
        </div>
        <span className="num text-xs text-text-faint">{percent(bounds.maxIv, 0)}</span>
        <span className="ml-1 text-xs text-text-faint">IV</span>
      </div>
    </div>
  );
};

export const SurfaceCanvas: FC<SurfaceCanvasProps> = ({
  grid,
  previous,
  sliceAxis,
  sliceIndex,
  showWireframe,
  showSlice,
  reducedMotion,
  onMorphSettled,
}) => {
  const bounds = useMemo(() => surfaceBounds(grid), [grid]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        // capped so a high-dpi screen does not render four times the pixels for
        // a surface that is mostly smooth gradient
        dpr={[1, 1.75]}
        // looks down the term axis from the front-right, which is the angle the
        // skew and the term structure both read from at once
        camera={{ position: [3.05, 1.85, 3.05], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        // r3f keeps the default WebGLRenderer, whose context is released with the
        // canvas element on unmount; geometries and materials dispose themselves
        onCreated={({ gl }) => gl.setClearColor("#0a0b0d", 0)}
      >
        <StudioLights />
        {bounds !== null && <Stage bounds={bounds} />}
        <SurfaceMeshView
          grid={grid}
          previous={previous}
          showWireframe={showWireframe}
          instant={reducedMotion}
          {...(onMorphSettled === undefined ? {} : { onMorphSettled })}
        />
        {showSlice && bounds !== null && (
          <SlicePlane grid={grid} bounds={bounds} axis={sliceAxis} index={sliceIndex} />
        )}
        <Controls reducedMotion={reducedMotion} />
      </Canvas>

      {bounds !== null && <AxisLegend grid={grid} bounds={bounds} />}
    </div>
  );
};
