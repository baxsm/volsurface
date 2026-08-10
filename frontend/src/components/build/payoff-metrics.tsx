import { useReducedMotion } from "motion/react";
import { type FC, useEffect, useRef, useState } from "react";
import type { PayoffResult } from "@/lib/strategy";

/** tweens a number toward its target. the readouts are the position's summary,
    so they move with the curve instead of jumping while it springs. */
const useCountUp = (value: number, enabled: boolean): number => {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const from = fromRef.current;
    if (from === value) return;

    const duration = 320;
    const start = performance.now();

    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      // ease-out: fast enough to feel responsive, settles rather than stopping
      const eased = 1 - (1 - t) ** 3;
      const next = from + (value - from) * eased;
      fromRef.current = next;
      setShown(next);

      if (t < 1) {
        frameRef.current = requestAnimationFrame(step);
        return;
      }
      fromRef.current = value;
      setShown(value);
      frameRef.current = null;
    };

    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [value, enabled]);

  return shown;
};

interface ReadoutProps {
  label: string;
  /** null means the value is unbounded, which is not the same as zero */
  value: number | null;
  hint?: string;
  tone?: string;
  animate: boolean;
  unbounded?: string;
}

const Readout: FC<ReadoutProps> = ({
  label,
  value,
  hint,
  tone = "text-text",
  animate,
  unbounded = "Unlimited",
}) => {
  const shown = useCountUp(value ?? 0, animate && value !== null);

  return (
    <div>
      <dt className="text-xs text-text-faint">{label}</dt>
      <dd className={`num mt-1 text-md ${value === null ? "text-text-muted" : tone}`}>
        {value === null ? unbounded : shown.toFixed(2)}
      </dd>
      {hint !== undefined && <p className="mt-0.5 text-xs text-text-faint">{hint}</p>}
    </div>
  );
};

interface PayoffMetricsProps {
  payoff: PayoffResult;
}

export const PayoffMetrics: FC<PayoffMetricsProps> = ({ payoff }) => {
  const animate = useReducedMotion() !== true;
  const credit = payoff.netDebit < 0;

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
      <Readout
        label="Max profit"
        value={payoff.maxProfit}
        tone="text-pos"
        animate={animate}
        hint="per contract"
      />
      <Readout
        label="Max loss"
        value={payoff.maxLoss}
        tone="text-neg"
        animate={animate}
        hint="per contract"
      />
      <Readout
        label={credit ? "Net credit" : "Net debit"}
        value={Math.abs(payoff.netDebit)}
        tone={credit ? "text-pos" : "text-text"}
        animate={animate}
        hint={credit ? "received" : "paid"}
      />
      <div>
        <dt className="text-xs text-text-faint">
          {payoff.breakevens.length === 1 ? "Breakeven" : "Breakevens"}
        </dt>
        <dd className="num mt-1 text-md text-accent">
          {payoff.breakevens.length === 0
            ? "None"
            : payoff.breakevens.map((value) => value.toFixed(2)).join("  ")}
        </dd>
        <p className="mt-0.5 text-xs text-text-faint">
          {payoff.breakevens.length === 0 ? "never crosses zero" : "underlying at expiry"}
        </p>
      </div>
    </dl>
  );
};
