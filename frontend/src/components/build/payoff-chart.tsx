import { AxisBottom, AxisLeft } from "@visx/axis";
import { Group } from "@visx/group";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { AreaClosed, Line, LinePath } from "@visx/shape";
import { useReducedMotion } from "motion/react";
import { type FC, useEffect, useMemo, useRef, useState } from "react";
import { gridOver, payoffDomain, resample, withCrossings } from "@/lib/payoff-geometry";
import type { PayoffPoint, PayoffResult } from "@/lib/strategy";

/** the y labels need room, but 52px of it on a 375px screen is most of the plot,
    so the gutter shrinks with the box instead of squeezing the curve */
const paddingFor = (width: number) =>
  width < 480
    ? { left: 38, right: 12, top: 22, bottom: 30 }
    : { left: 52, right: 20, top: 24, bottom: 34 };
/** the tween grid. dense enough that the kinks stay sharp, small enough to
    rebuild every frame without dropping one */
const GRID_STEPS = 160;
/** what the chart draws at before the container is measured, so the first paint
    is not a 0-wide box. kept narrow so an over-wide frame never flashes. */
const INITIAL_SIZE = { width: 360, height: 320 };

const axisLabel = {
  className: "num",
  fill: "var(--color-text-faint)",
  fontSize: 10,
} as const;

/**
 * critically damped spring on each vertex. this animates the data, not the
 * drawing: visx re-serialises the path from whatever points it is handed, and
 * two payoffs with different vertex counts have nothing to cross-fade between,
 * so the curve is tweened as numbers and redrawn each frame.
 */
const useSprungCurve = (target: PayoffPoint[], enabled: boolean): PayoffPoint[] => {
  const [curve, setCurve] = useState<PayoffPoint[]>(target);
  const currentRef = useRef<PayoffPoint[]>(target);
  const velocityRef = useRef<number[]>([]);
  const targetRef = useRef<PayoffPoint[]>(target);
  const frameRef = useRef<number | null>(null);

  targetRef.current = target;

  // target is read through the ref inside the animation frame, but it is also
  // what has to restart the spring, so it stays in the list as the trigger
  // biome-ignore lint/correctness/useExhaustiveDependencies: target is the intended trigger
  useEffect(() => {
    if (!enabled) {
      currentRef.current = targetRef.current;
      setCurve(targetRef.current);
      return;
    }

    // a leg added or removed changes the vertex count; without matching lengths
    // there is nothing to spring between, so it starts from the new shape
    if (currentRef.current.length !== targetRef.current.length) {
      currentRef.current = targetRef.current;
      velocityRef.current = [];
      setCurve(targetRef.current);
      return;
    }

    const stiffness = 170;
    const damping = 26;
    let last = performance.now();

    const step = (now: number) => {
      // clamped so a backgrounded tab does not resume with one huge timestep
      const dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;

      const goal = targetRef.current;
      const from = currentRef.current;
      if (from.length !== goal.length) {
        currentRef.current = goal;
        setCurve(goal);
        frameRef.current = null;
        return;
      }

      if (velocityRef.current.length !== goal.length) {
        velocityRef.current = new Array(goal.length).fill(0);
      }

      const next: PayoffPoint[] = new Array(goal.length);
      let settled = true;

      for (let i = 0; i < goal.length; i++) {
        const to = goal[i] as PayoffPoint;
        const at = from[i] as PayoffPoint;
        const velocity = velocityRef.current[i] ?? 0;

        const displacement = at.profit - to.profit;
        const acceleration = -stiffness * displacement - damping * velocity;
        const nextVelocity = velocity + acceleration * dt;
        const nextProfit = at.profit + nextVelocity * dt;

        velocityRef.current[i] = nextVelocity;
        next[i] = { spot: to.spot, profit: nextProfit };

        if (Math.abs(displacement) > 0.001 || Math.abs(nextVelocity) > 0.001) settled = false;
      }

      if (settled) {
        currentRef.current = goal;
        setCurve(goal);
        frameRef.current = null;
        return;
      }

      currentRef.current = next;
      setCurve(next);
      frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [target, enabled]);

  return curve;
};

interface PlotProps {
  curve: PayoffPoint[];
  breakevens: number[];
  spot: number | null;
  width: number;
  height: number;
}

const Plot: FC<PlotProps> = ({ curve, breakevens, spot, width, height }) => {
  const pad = paddingFor(width);
  const domain = useMemo(() => payoffDomain(curve), [curve]);

  const innerWidth = Math.max(width - pad.left - pad.right, 1);
  const innerHeight = Math.max(height - pad.top - pad.bottom, 1);

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [domain?.minSpot ?? 0, domain?.maxSpot ?? 1],
        range: [0, innerWidth],
      }),
    [domain, innerWidth],
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [domain?.minProfit ?? 0, domain?.maxProfit ?? 1],
        range: [innerHeight, 0],
      }),
    [domain, innerHeight],
  );

  // the fills are split by a predicate over whole samples, so the crossings have
  // to exist as vertices or the two areas meet at the nearest grid point instead
  // of on the breakeven
  const split = useMemo(() => withCrossings(curve), [curve]);

  if (domain === null) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-text-muted">
          This position has no range to draw. Check the strikes and prices.
        </p>
      </div>
    );
  }

  const zeroY = yScale(0);
  const inWindow = (value: number) => value >= domain.minSpot && value <= domain.maxSpot;
  // fewer ticks on a narrow chart, where five sets of labels would collide
  const tickCount = width < 480 ? 3 : 5;

  const x = (d: PayoffPoint) => xScale(d.spot);
  const y = (d: PayoffPoint) => yScale(d.profit);

  // the spot marker and a breakeven can land on nearly the same x. the spot
  // label then sits at the top and the breakevens below the axis, so neither
  // overlaps the curve or the other.
  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="Profit and loss at expiry across the underlying price"
    >
      <title>Profit and loss at expiry across the underlying price</title>

      <Group left={pad.left} top={pad.top}>
        {xScale.ticks(tickCount).map((tick) => (
          <Line
            key={`grid-${tick}`}
            from={{ x: xScale(tick), y: 0 }}
            to={{ x: xScale(tick), y: innerHeight }}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        ))}

        <AreaClosed<PayoffPoint>
          data={split}
          x={x}
          y={y}
          y0={() => zeroY}
          yScale={yScale}
          defined={(d) => d.profit <= 0}
          fill="var(--color-neg)"
          fillOpacity={0.14}
        />
        <AreaClosed<PayoffPoint>
          data={split}
          x={x}
          y={y}
          y0={() => zeroY}
          yScale={yScale}
          defined={(d) => d.profit >= 0}
          fill="var(--color-pos)"
          fillOpacity={0.16}
        />

        <Line
          from={{ x: 0, y: zeroY }}
          to={{ x: innerWidth, y: zeroY }}
          stroke="var(--color-border-strong)"
          strokeWidth={1}
        />

        {spot !== null && inWindow(spot) && (
          <>
            <Line
              from={{ x: xScale(spot), y: 0 }}
              to={{ x: xScale(spot), y: innerHeight }}
              stroke="var(--color-text-faint)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <text x={xScale(spot)} y={-9} textAnchor="middle" {...axisLabel}>
              spot {spot.toFixed(2)}
            </text>
          </>
        )}

        <LinePath<PayoffPoint>
          data={curve}
          x={x}
          y={y}
          stroke="var(--color-accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {breakevens.filter(inWindow).map((value) => {
          const cx = xScale(value);
          const labelY = Math.min(zeroY + 16, innerHeight - 3);
          const label = value.toFixed(2);
          // the spot marker's dashed line can pass straight through this label,
          // so it sits on its own chip rather than being read over a line
          const chipWidth = label.length * 5.6 + 8;
          return (
            <Group key={`be-${value}`}>
              <circle
                cx={cx}
                cy={zeroY}
                r={3.5}
                fill="var(--color-bg)"
                stroke="var(--color-accent)"
                strokeWidth={1.5}
              />
              <rect
                x={cx - chipWidth / 2}
                y={labelY - 8}
                width={chipWidth}
                height={12}
                rx={2}
                fill="var(--color-bg)"
              />
              <text x={cx} y={labelY} textAnchor="middle" {...axisLabel} fill="var(--color-accent)">
                {label}
              </text>
            </Group>
          );
        })}

        <AxisBottom
          scale={xScale}
          top={innerHeight}
          numTicks={tickCount}
          stroke="var(--color-border)"
          hideTicks
          hideAxisLine
          tickFormat={(value) => `${Number(value)}`}
          tickLabelProps={() => ({ ...axisLabel, textAnchor: "middle", dy: "0.25em" })}
        />

        <AxisLeft
          scale={yScale}
          tickValues={[domain.maxProfit, 0, domain.minProfit]}
          hideTicks
          hideAxisLine
          tickFormat={(value) => Number(value).toFixed(2)}
          tickLabelProps={() => ({ ...axisLabel, textAnchor: "end", dx: "-0.5em", dy: "0.25em" })}
        />
      </Group>
    </svg>
  );
};

interface PayoffChartProps {
  payoff: PayoffResult;
  spot: number | null;
  /** dims the curve while a fresh one is in flight, so a stale shape does not
      read as the answer to the edit just made */
  stale?: boolean;
}

export const PayoffChart: FC<PayoffChartProps> = ({ payoff, spot, stale = false }) => {
  const reduced = useReducedMotion() === true;

  const grid = useMemo(
    () => gridOver(payoff.range.min, payoff.range.max, GRID_STEPS),
    [payoff.range.min, payoff.range.max],
  );
  const target = useMemo(() => resample(payoff.points, grid), [payoff.points, grid]);
  const curve = useSprungCurve(target, !reduced);

  return (
    <div
      className={`h-full w-full transition-opacity duration-200 ${stale ? "opacity-50" : "opacity-100"}`}
    >
      <ParentSize initialSize={INITIAL_SIZE}>
        {({ width, height }) =>
          width < 1 || height < 1 ? null : (
            <Plot
              curve={curve}
              breakevens={payoff.breakevens}
              spot={spot}
              width={width}
              height={height}
            />
          )
        }
      </ParentSize>
    </div>
  );
};
