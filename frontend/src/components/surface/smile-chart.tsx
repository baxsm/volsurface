import { type FC, useEffect, useRef, useState } from "react";
import { decimal, percent } from "@/lib/format";
import { rampHex } from "@/lib/surface-geometry";

export interface SmilePoint {
  /** the horizontal axis value: strike for a smile, years for a term cut */
  x: number;
  iv: number;
}

interface SmileChartProps {
  points: SmilePoint[];
  xLabel: string;
  /** drawn as a dashed vertical marker, e.g. spot on a smile cut */
  marker?: number | null;
  markerLabel?: string;
  /**
   * spaces the x axis by its square root. the term cut needs it for the same
   * reason the surface does: expiries bunch at the front, and spacing them by
   * raw years crushes them into the left edge as a spike.
   */
  sqrtScale?: boolean;
}

const PAD = { left: 44, right: 12, top: 14, bottom: 26 };
const HEIGHT = 168;

/**
 * the 2D cross-section under the slice plane. hand-written SVG for the same
 * reason the payoff chart is: it draws one path from data the engine already
 * shaped, and a chart library would add packages to do less.
 */
export const SmileChart: FC<SmileChartProps> = ({
  points,
  xLabel,
  marker,
  markerLabel,
  sqrtScale = false,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // the viewBox matches real pixels, so the curve never letterboxes inside a
  // wider container the way a fixed viewBox does
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const usable = width > 0 && points.length > 1;

  const xs = points.map((p) => p.x);
  const ivs = points.map((p) => p.iv);
  const minX = usable ? Math.min(...xs) : 0;
  const maxX = usable ? Math.max(...xs) : 1;
  const rawMinIv = usable ? Math.min(...ivs) : 0;
  const rawMaxIv = usable ? Math.max(...ivs) : 1;
  const pad = Math.max((rawMaxIv - rawMinIv) * 0.15, 0.005);
  const minIv = rawMinIv - pad;
  const maxIv = rawMaxIv + pad;

  const scaleX = (value: number) => (sqrtScale ? Math.sqrt(Math.max(value, 0)) : value);
  const scaledMin = scaleX(minX);
  const scaledMax = scaleX(maxX);

  const xSpan = scaledMax - scaledMin || 1;
  const ivSpan = maxIv - minIv || 1;
  const innerWidth = Math.max(width - PAD.left - PAD.right, 1);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;

  const toX = (value: number) => PAD.left + ((scaleX(value) - scaledMin) / xSpan) * innerWidth;
  const toY = (value: number) => PAD.top + ((maxIv - value) / ivSpan) * innerHeight;

  const path = usable
    ? points
        .map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.x).toFixed(2)} ${toY(p.iv).toFixed(2)}`)
        .join(" ")
    : "";

  const area = usable
    ? `${path} L${toX(maxX).toFixed(2)} ${(HEIGHT - PAD.bottom).toFixed(2)} L${toX(minX).toFixed(2)} ${(HEIGHT - PAD.bottom).toFixed(2)} Z`
    : "";

  const ticks = usable ? [rawMinIv, (rawMinIv + rawMaxIv) / 2, rawMaxIv] : [];

  return (
    /* the height is reserved whether or not the curve draws. without it the
       container collapses to nothing on the first paint, before the observer
       has reported a width, and the panel below jumps up. */
    <div ref={ref} className="w-full" style={{ minHeight: HEIGHT }}>
      {usable && (
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-label={`Implied volatility against ${xLabel}`}
        >
          <title>{`Implied volatility against ${xLabel}`}</title>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={toY(tick)}
                y2={toY(tick)}
                stroke="var(--color-border)"
                strokeDasharray="2 4"
              />
              <text
                x={PAD.left - 8}
                y={toY(tick) + 3}
                textAnchor="end"
                className="num"
                fontSize="10"
                fill="var(--color-text-faint)"
              >
                {percent(tick, 0)}
              </text>
            </g>
          ))}

          {/* ids are document-global, so these are namespaced rather than named
              for what they draw - the auth page defines its own smile gradient */}
          <defs>
            <linearGradient id="smile-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={rampHex(0.62)} stopOpacity="0.18" />
              <stop offset="100%" stopColor={rampHex(0.62)} stopOpacity="0" />
            </linearGradient>
            {/* the stroke walks the same perceptual ramp the 3d mesh paints, so
                a cut through the surface is coloured like the surface it cuts */}
            <linearGradient id="smile-chart-stroke" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor={rampHex(0.15)} />
              <stop offset="50%" stopColor={rampHex(0.55)} />
              <stop offset="100%" stopColor={rampHex(0.95)} />
            </linearGradient>
          </defs>

          <path d={area} fill="url(#smile-chart-fill)" />
          <path
            d={path}
            fill="none"
            stroke="url(#smile-chart-stroke)"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />

          {marker != null && marker >= minX && marker <= maxX && (
            <g>
              <line
                x1={toX(marker)}
                x2={toX(marker)}
                y1={PAD.top}
                y2={HEIGHT - PAD.bottom}
                stroke="var(--color-text-faint)"
                strokeDasharray="3 3"
              />
              {markerLabel !== undefined && (
                <text
                  x={toX(marker)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className="num"
                  fontSize="10"
                  fill="var(--color-text-faint)"
                >
                  {markerLabel}
                </text>
              )}
            </g>
          )}

          <text
            x={PAD.left}
            y={HEIGHT - 8}
            className="num"
            fontSize="10"
            fill="var(--color-text-faint)"
          >
            {decimal(minX, minX >= 10 ? 0 : 2)}
          </text>
          <text
            x={width - PAD.right}
            y={HEIGHT - 8}
            textAnchor="end"
            className="num"
            fontSize="10"
            fill="var(--color-text-faint)"
          >
            {decimal(maxX, maxX >= 10 ? 0 : 2)}
          </text>
        </svg>
      )}
    </div>
  );
};
