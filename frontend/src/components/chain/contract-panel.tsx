import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FC, useEffect } from "react";
import { decimal, integer, longDate, money, percent } from "@/lib/format";
import type { Contract, SnapshotMeta } from "@/lib/types";
import { useCountUp } from "@/lib/use-count-up";

/**
 * one figure in the panel.
 *
 * `value` is the raw number and `format` renders it, rather than the caller
 * passing a finished string, because the number is tweened: clicking down the
 * strike ladder used to replace all sixteen readouts in a single frame while
 * the panel itself spring-animated, so the panel moved and its contents did
 * not. null is passed straight through - there is nothing to count toward.
 */
const Metric: FC<{
  label: string;
  value: number | null;
  format: (value: number | null) => string;
  /** a count rather than a measurement: rounded every frame, never fractional */
  whole?: boolean;
  tone?: string;
  hint?: string;
}> = ({ label, value, format, whole = false, tone = "text-text", hint }) => {
  const reduced = useReducedMotion();
  const shown = useCountUp(value ?? 0, reduced !== true && value !== null);

  // volume and open interest are contract counts. tweening one produced
  // "3.986 contracts" on the way to 2, which is not a quantity that exists.
  const display = value === null ? format(null) : format(whole ? Math.round(shown) : shown);

  return (
    <div>
      <dt className="text-xs text-text-faint">{label}</dt>
      <dd className={`num mt-1 text-sm ${tone}`}>{display}</dd>
      {hint !== undefined && <p className="mt-0.5 text-xs text-text-faint">{hint}</p>}
    </div>
  );
};

/** the same row for a value that is a word rather than a number */
const TextMetric: FC<{ label: string; value: string; tone?: string }> = ({
  label,
  value,
  tone = "text-text",
}) => (
  <div>
    <dt className="text-xs text-text-faint">{label}</dt>
    <dd className={`num mt-1 text-sm transition-colors duration-200 ${tone}`}>{value}</dd>
  </div>
);

interface ContractPanelProps {
  contract: Contract | null;
  expiration: string | null;
  snapshot: SnapshotMeta;
  onClose: () => void;
}

export const ContractPanel: FC<ContractPanelProps> = ({
  contract,
  expiration,
  snapshot,
  onClose,
}) => {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (contract === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [contract, onClose]);

  const spread = contract?.bid != null && contract.ask != null ? contract.ask - contract.bid : null;

  return (
    <AnimatePresence>
      {contract !== null && (
        <motion.aside
          key="contract-panel"
          aria-label="Contract detail"
          initial={reduced === true ? false : { x: "100%" }}
          animate={{ x: 0 }}
          exit={reduced === true ? { opacity: 0 } : { x: "100%" }}
          transition={
            reduced === true ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 32 }
          }
          className="scrollbar-thin absolute inset-y-0 right-0 z-30 w-full overflow-y-auto border-l border-border bg-surface sm:w-80"
        >
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            {/* the identity of the contract is the one thing that cannot tween,
                so it cross-fades on the id instead */}
            <motion.div
              key={contract.contractId}
              initial={reduced === true ? false : { opacity: 0, y: -3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced === true ? 0 : 0.18 }}
              className="min-w-0"
            >
              <p className="num truncate text-sm text-text">{contract.contractId}</p>
              <p className="mt-1 text-xs text-text-muted">
                {snapshot.ticker} {contract.type} at {money(contract.strike)}
                {expiration !== null && ` - ${longDate(expiration)}`}
              </p>
            </motion.div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close contract detail"
              className="-m-1.5 shrink-0 cursor-pointer rounded-sm p-3 text-text-muted transition-colors hover:bg-surface-2 hover:text-text active:translate-y-px"
            >
              <X size={16} strokeWidth={1.4} aria-hidden="true" />
            </button>
          </div>

          <section className="border-b border-border px-5 py-4">
            <h3 className="mb-3 text-xs tracking-wide text-text-faint uppercase">Market</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Metric label="Bid" value={contract.bid} format={money} />
              <Metric label="Ask" value={contract.ask} format={money} />
              <Metric label="Mark" value={contract.mark} format={money} />
              <Metric label="Spread" value={spread} format={money} />
              <Metric label="Last" value={contract.last} format={money} />
              <Metric label="Volume" value={contract.volume} format={integer} whole />
              <Metric label="Open interest" value={contract.openInterest} format={integer} whole />
            </dl>
          </section>

          <section className="border-b border-border px-5 py-4">
            <h3 className="mb-3 text-xs tracking-wide text-text-faint uppercase">
              Implied volatility
            </h3>
            {contract.computedIv === null ? (
              <p className="text-sm text-warn">
                No implied volatility exists for this quote. The mark sits outside the no-arbitrage
                bounds, so no volatility reprices it.
              </p>
            ) : (
              <dl className="grid grid-cols-2 gap-4">
                {/* ours vs vendor is provenance, not selection, so neither side
                    takes the accent. the solver row below is the only value here
                    with a semantic tone. */}
                <Metric label="Ours" value={contract.computedIv} format={(v) => percent(v, 2)} />
                <Metric label="Vendor" value={contract.vendorIv} format={(v) => percent(v, 2)} />
                <Metric
                  label="Difference"
                  value={contract.vendorIv == null ? null : contract.computedIv - contract.vendorIv}
                  format={(v) => (v === null ? "-" : percent(v, 2))}
                />
                <TextMetric
                  label="Solver"
                  value={contract.ivConverged === true ? "converged" : "did not converge"}
                  tone={contract.ivConverged === true ? "text-pos" : "text-warn"}
                />
              </dl>
            )}
          </section>

          <section className="px-5 py-4">
            <h3 className="mb-3 text-xs tracking-wide text-text-faint uppercase">Greeks</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Metric label="Delta" value={contract.greeks.delta} format={(v) => decimal(v, 4)} />
              <Metric label="Gamma" value={contract.greeks.gamma} format={(v) => decimal(v, 5)} />
              <Metric
                label="Vega"
                value={contract.greeks.vega}
                format={(v) => decimal(v, 4)}
                hint="per 1.00 of vol"
              />
              <Metric
                label="Theta"
                value={contract.greeks.theta}
                format={(v) => decimal(v, 4)}
                hint="per year"
              />
              <Metric
                label="Rho"
                value={contract.greeks.rho}
                format={(v) => decimal(v, 4)}
                hint="per 1.00 of rate"
              />
            </dl>
            <p className="mt-4 text-xs leading-relaxed text-text-faint">
              Priced at {percent(snapshot.rate, 2)} rate and {percent(snapshot.dividendYield, 2)}{" "}
              dividend yield, the values stored with this snapshot.
            </p>
          </section>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
