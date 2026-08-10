import { useReducedMotion } from "motion/react";
import { type FC, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  areaPaths,
  type Box,
  buildScale,
  gridOver,
  linePath,
  resample,
  spotTicks,
} from "@/lib/payoff-geometry";
import type { PayoffPoint, PayoffResult } from "@/lib/strategy";

/** the y labels need room, but 52px of it on a 375px screen is most of the plot,
    so the gutter shrinks with the box instead of squeezing the curve */
const paddingFor = (width: number) =>
  width < 480
    ? { padLeft: 38, padRight: 12, padTop: 22, padBottom: 30 }
    : { padLeft: 52, padRight: 20, padTop: 24, padBottom: 34 };
/** until the container reports a width, so the first paint is not a 0-wide box.
    kept narrow: the svg is width-governed by its container, and a wide default
    would still set the aspect ratio for the frame before the observer fires */
const FALLBACK = { width: 360, height: 320 };
/** the tween grid. dense enough that the kinks stay sharp, small enough to
    rebuild every frame without dropping one */
const GRID_STEPS = 160;

/**
 * the viewBox has to match the element's real pixel size. a fixed viewBox scaled
 * into a wider box letterboxes the drawing, which reads as a clipped chart with
 * dead margins, and it stretches the type along with the geometry.
 */
const useMeasuredBox = (): [(node: HTMLDivElement | null) => void, Box] => {
  const [size, setSize] = useState(FALLBACK);
  const observerRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (node === null) return;

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect === undefined) return;
      if (rect.width < 1 || rect.height < 1) return;
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [ref, { ...size, ...paddingFor(size.width) }];
};

/**
 * critically damped spring on each vertex. a css transition cannot cross-fade
 * two paths with different vertex counts, and animating the `d` string directly
 * snaps, so the curve is tweened as data and re-serialised each frame.
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

interface PayoffChartProps {
  payoff: PayoffResult;
  spot: number | null;
  /** dims the curve while a fresh one is in flight, so a stale shape does not
      read as the answer to the edit just made */
  stale?: boolean;
}

export const PayoffChart: FC<PayoffChartProps> = ({ payoff, spot, stale = false }) => {
  const reduced = useReducedMotion() === true;
  const [containerRef, box] = useMeasuredBox();

  const grid = useMemo(
    () => gridOver(payoff.range.min, payoff.range.max, GRID_STEPS),
    [payoff.range.min, payoff.range.max],
  );
  const target = useMemo(() => resample(payoff.points, grid), [payoff.points, grid]);
  const curve = useSprungCurve(target, !reduced);

  const scale = useMemo(() => buildScale(curve, box), [curve, box]);

  if (scale === null) {
    return (
      <div ref={containerRef} className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-text-muted">
          This position has no range to draw. Check the strikes and prices.
        </p>
      </div>
    );
  }

  const { positive, negative } = areaPaths(curve, scale);
  const path = linePath(curve, scale);
  // fewer ticks on a narrow chart, where five sets of labels would collide
  const ticks = spotTicks(scale.domain.minSpot, scale.domain.maxSpot, box.width < 480 ? 3 : 5);
  const inWindow = (value: number) =>
    value >= scale.domain.minSpot && value <= scale.domain.maxSpot;

  const plotBottom = box.height - box.padBottom;
  const plotRight = box.width - box.padRight;

  // the spot marker and a breakeven can land on nearly the same x. the spot
  // label then sits at the top and the breakevens below the axis, so neither
  // overlaps the curve or the other.
  return (
    <div ref={containerRef} className="h-full w-full">
      <svg
        viewBox={`0 0 ${box.width} ${box.height}`}
        className={`block h-full w-full transition-opacity duration-200 ${stale ? "opacity-50" : "opacity-100"}`}
        role="img"
        aria-label="Profit and loss at expiry across the underlying price"
      >
        <title>Profit and loss at expiry across the underlying price</title>

        {ticks.map((tick) => (
          <line
            key={`grid-${tick}`}
            x1={scale.x(tick)}
            x2={scale.x(tick)}
            y1={box.padTop}
            y2={plotBottom}
            stroke="var(--color-border)"
            strokeWidth="1"
          />
        ))}

        <path d={negative} fill="var(--color-neg)" fillOpacity="0.14" />
        <path d={positive} fill="var(--color-pos)" fillOpacity="0.16" />

        <line
          x1={box.padLeft}
          x2={plotRight}
          y1={scale.zeroY}
          y2={scale.zeroY}
          stroke="var(--color-border-strong)"
          strokeWidth="1"
        />

        {spot !== null && inWindow(spot) && (
          <g>
            <line
              x1={scale.x(spot)}
              x2={scale.x(spot)}
              y1={box.padTop}
              y2={plotBottom}
              stroke="var(--color-text-faint)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={scale.x(spot)}
              y={box.padTop - 9}
              textAnchor="middle"
              className="num"
              fill="var(--color-text-faint)"
              fontSize="10"
            >
              spot {spot.toFixed(2)}
            </text>
          </g>
        )}

        <path
          d={path}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {payoff.breakevens.filter(inWindow).map((value) => {
          const cx = scale.x(value);
          const labelY = Math.min(scale.zeroY + 16, plotBottom - 3);
          const label = value.toFixed(2);
          // the spot marker's dashed line can pass straight through this label,
          // so it sits on its own chip rather than being read over a line
          const chipWidth = label.length * 5.6 + 8;
          return (
            <g key={`be-${value}`}>
              <circle
                cx={cx}
                cy={scale.zeroY}
                r="3.5"
                fill="var(--color-bg)"
                stroke="var(--color-accent)"
                strokeWidth="1.5"
              />
              <rect
                x={cx - chipWidth / 2}
                y={labelY - 8}
                width={chipWidth}
                height="12"
                rx="2"
                fill="var(--color-bg)"
              />
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                className="num"
                fill="var(--color-accent)"
                fontSize="10"
              >
                {label}
              </text>
            </g>
          );
        })}

        {ticks.map((tick) => (
          <text
            key={`tick-${tick}`}
            x={scale.x(tick)}
            y={plotBottom + 16}
            textAnchor="middle"
            className="num"
            fill="var(--color-text-faint)"
            fontSize="10"
          >
            {tick}
          </text>
        ))}

        {[scale.domain.maxProfit, 0, scale.domain.minProfit].map((value) => (
          <text
            key={`y-${value}`}
            x={box.padLeft - 10}
            y={scale.y(value) + 3}
            textAnchor="end"
            className="num"
            fill="var(--color-text-faint)"
            fontSize="10"
          >
            {value.toFixed(2)}
          </text>
        ))}
      </svg>
    </div>
  );
};
