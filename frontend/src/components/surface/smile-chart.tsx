import { LinearGradient } from "@visx/gradient";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear, scalePower } from "@visx/scale";
import { AreaClosed, Line, LinePath } from "@visx/shape";
import type { FC } from "react";
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
/** until the container is measured, so the curve does not flash a 0-wide box */
const INITIAL_SIZE = { width: 360, height: HEIGHT };

const axisLabel = {
  className: "num",
  fill: "var(--color-text-faint)",
  fontSize: 10,
} as const;

interface PlotProps extends SmileChartProps {
  width: number;
}

const Plot: FC<PlotProps> = ({ points, xLabel, marker, markerLabel, sqrtScale, width }) => {
  const xs = points.map((p) => p.x);
  const ivs = points.map((p) => p.iv);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const rawMinIv = Math.min(...ivs);
  const rawMaxIv = Math.max(...ivs);
  const pad = Math.max((rawMaxIv - rawMinIv) * 0.15, 0.005);

  const innerWidth = Math.max(width - PAD.left - PAD.right, 1);
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;

  // a sqrt scale is a power scale at exponent 0.5, so the term cut spaces its
  // expiries the same way the mesh does rather than by raw years
  const xScale = sqrtScale
    ? scalePower<number>({ domain: [minX, maxX], range: [0, innerWidth], exponent: 0.5 })
    : scaleLinear<number>({ domain: [minX, maxX], range: [0, innerWidth] });

  const yScale = scaleLinear<number>({
    domain: [rawMinIv - pad, rawMaxIv + pad],
    range: [innerHeight, 0],
  });

  // a term cut can span less than a point of vol, where all three ticks round to
  // the same label and the axis reads as a repeated number. deduping on the
  // formatted text drops the collision rather than the precision.
  const ticks: number[] = [];
  const seen = new Set<string>();
  for (const value of [rawMinIv, (rawMinIv + rawMaxIv) / 2, rawMaxIv]) {
    const label = percent(value, 0);
    if (seen.has(label)) continue;
    seen.add(label);
    ticks.push(value);
  }

  return (
    <svg
      width={width}
      height={HEIGHT}
      role="img"
      aria-label={`Implied volatility against ${xLabel}`}
    >
      <title>{`Implied volatility against ${xLabel}`}</title>

      {/* ids are document-global, so these are namespaced rather than named
          for what they draw - the auth page defines its own smile gradient */}
      <LinearGradient
        id="smile-chart-fill"
        from={rampHex(0.62)}
        to={rampHex(0.62)}
        fromOpacity={0.18}
        toOpacity={0}
      />
      {/* the stroke walks the same perceptual ramp the 3d mesh paints, so a cut
          through the surface is coloured like the surface it cuts */}
      <LinearGradient id="smile-chart-stroke" vertical from={rampHex(0.95)} to={rampHex(0.15)} />

      <Group left={PAD.left} top={PAD.top}>
        {ticks.map((tick) => (
          <Group key={tick}>
            <Line
              from={{ x: 0, y: yScale(tick) }}
              to={{ x: innerWidth, y: yScale(tick) }}
              stroke="var(--color-border)"
              strokeDasharray="2 4"
            />
            <text x={-8} y={yScale(tick) + 3} textAnchor="end" {...axisLabel}>
              {percent(tick, 0)}
            </text>
          </Group>
        ))}

        <AreaClosed<SmilePoint>
          data={points}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.iv)}
          yScale={yScale}
          fill="url(#smile-chart-fill)"
        />
        <LinePath<SmilePoint>
          data={points}
          x={(d) => xScale(d.x)}
          y={(d) => yScale(d.iv)}
          stroke="url(#smile-chart-stroke)"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />

        {marker != null && marker >= minX && marker <= maxX && (
          <Group>
            <Line
              from={{ x: xScale(marker), y: 0 }}
              to={{ x: xScale(marker), y: innerHeight }}
              stroke="var(--color-text-faint)"
              strokeDasharray="3 3"
            />
            {markerLabel !== undefined && (
              <text x={xScale(marker)} y={innerHeight + 18} textAnchor="middle" {...axisLabel}>
                {markerLabel}
              </text>
            )}
          </Group>
        )}

        <text x={0} y={innerHeight + 18} {...axisLabel}>
          {decimal(minX, minX >= 10 ? 0 : 2)}
        </text>
        <text x={innerWidth} y={innerHeight + 18} textAnchor="end" {...axisLabel}>
          {decimal(maxX, maxX >= 10 ? 0 : 2)}
        </text>
      </Group>
    </svg>
  );
};

export const SmileChart: FC<SmileChartProps> = (props) => (
  /* an explicit height, not a min-height: ParentSize sizes its own wrappers at
     height:100%, which resolves to 0 against a min-height and clips the chart
     to nothing. the fixed height also reserves the row whether or not the curve
     draws, so the panel below does not jump on the first paint. */
  <div className="w-full" style={{ height: HEIGHT }}>
    {props.points.length > 1 && (
      <ParentSize initialSize={INITIAL_SIZE}>
        {({ width }) => (width < 1 ? null : <Plot {...props} width={width} />)}
      </ParentSize>
    )}
  </div>
);
