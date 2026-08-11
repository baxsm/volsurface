import { useEffect, useRef, useState } from "react";

/**
 * tweens a number toward its target so a changed readout moves rather than
 * cutting. written for the payoff metrics, then pulled out here when the
 * contract panel and the surface readout needed the same thing: both were
 * hard-swapping every figure while the geometry beside them animated.
 *
 * `enabled` is false under reduced motion, where the value is set outright.
 */
export const useCountUp = (value: number, enabled: boolean): number => {
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
