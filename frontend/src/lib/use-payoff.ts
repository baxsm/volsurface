import { useEffect, useRef, useState } from "react";
import { ApiError } from "./api";
import { fetchPayoff } from "./queries";
import { legsAreComplete, type PayoffResult, type StrategyLeg, spotRangeFor } from "./strategy";

const DEBOUNCE_MS = 180;

export interface PayoffState {
  payoff: PayoffResult | null;
  error: string | null;
  /** a request is in flight for legs newer than the curve currently shown */
  stale: boolean;
}

/**
 * recomputes the payoff as legs change, debounced so a dragged quantity does not
 * fire a request per keystroke.
 *
 * every run carries a sequence number and only the newest is allowed to write.
 * without that, a slow early request can land after a fast later one and leave
 * the chart showing a position the user has already edited away.
 */
export const usePayoff = (legs: StrategyLeg[], spot: number | null): PayoffState => {
  const [payoff, setPayoff] = useState<PayoffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const seqRef = useRef(0);
  // the legs are rebuilt on every edit, so the request is keyed on their values.
  // spot belongs in the key too: it sets the drawn window, so switching snapshot
  // has to redraw even when the legs themselves did not change.
  const key = JSON.stringify([
    spot,
    legs.map((leg) => [leg.action, leg.type, leg.strike, leg.quantity, leg.entryPrice]),
  ]);

  const complete = legsAreComplete(legs);

  // the request reads these when the debounce fires, not when the effect runs.
  // held in refs so a re-render with the same key cannot leave the timer holding
  // an older array, and so the effect depends only on what should restart it.
  const legsRef = useRef(legs);
  const rangeRef = useRef(spotRangeFor(legs, spot));
  legsRef.current = legs;
  rangeRef.current = spotRangeFor(legs, spot);

  // key is not read in the body, it is the trigger: it changes exactly when the
  // legs or the spot change, which is when a new payoff has to be requested
  // biome-ignore lint/correctness/useExhaustiveDependencies: key is the intended trigger
  useEffect(() => {
    if (!complete) {
      // a half-typed leg is not an error, it is an unfinished edit. the previous
      // curve stays on screen, dimmed, rather than flashing an error state.
      setStale(true);
      return;
    }

    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setStale(true);

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetchPayoff({ legs: legsRef.current, spotRange: rangeRef.current }, controller.signal)
        .then((result) => {
          if (seqRef.current !== seq) return;
          setPayoff(result);
          setError(null);
          setStale(false);
        })
        .catch((cause: unknown) => {
          if (seqRef.current !== seq) return;
          // an abort is our own cancellation, not something to report
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setError(
            cause instanceof ApiError ? cause.message : "The payoff could not be calculated.",
          );
          setStale(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, complete]);

  return { payoff, error, stale };
};
