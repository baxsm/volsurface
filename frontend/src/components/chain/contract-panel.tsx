import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type FC, useEffect } from "react";
import { decimal, integer, longDate, money, percent } from "@/lib/format";
import type { Contract, SnapshotMeta } from "@/lib/types";

const Metric: FC<{ label: string; value: string; tone?: string; hint?: string }> = ({
  label,
  value,
  tone = "text-text",
  hint,
}) => (
  <div>
    <dt className="text-xs text-text-faint">{label}</dt>
    <dd className={`num mt-1 text-sm ${tone}`}>{value}</dd>
    {hint !== undefined && <p className="mt-0.5 text-xs text-text-faint">{hint}</p>}
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
            <div className="min-w-0">
              <p className="num truncate text-sm text-text">{contract.contractId}</p>
              <p className="mt-1 text-xs text-text-muted">
                {snapshot.ticker} {contract.type} at {money(contract.strike)}
                {expiration !== null && ` - ${longDate(expiration)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close contract detail"
              className="shrink-0 cursor-pointer rounded-sm p-1 text-text-faint transition-colors hover:text-text"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>

          <section className="border-b border-border px-5 py-4">
            <h3 className="mb-3 text-xs tracking-wide text-text-faint uppercase">Market</h3>
            <dl className="grid grid-cols-2 gap-4">
              <Metric label="Bid" value={money(contract.bid)} />
              <Metric label="Ask" value={money(contract.ask)} />
              <Metric label="Mark" value={money(contract.mark)} />
              <Metric label="Spread" value={money(spread)} />
              <Metric label="Last" value={money(contract.last)} />
              <Metric label="Volume" value={integer(contract.volume)} />
              <Metric label="Open interest" value={integer(contract.openInterest)} />
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
                <Metric label="Ours" value={percent(contract.computedIv, 2)} tone="text-accent" />
                <Metric label="Vendor" value={percent(contract.vendorIv, 2)} />
                <Metric
                  label="Difference"
                  value={
                    contract.vendorIv == null
                      ? "-"
                      : percent(contract.computedIv - contract.vendorIv, 2)
                  }
                />
                <Metric
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
              <Metric label="Delta" value={decimal(contract.greeks.delta, 4)} />
              <Metric label="Gamma" value={decimal(contract.greeks.gamma, 5)} />
              <Metric
                label="Vega"
                value={decimal(contract.greeks.vega, 4)}
                hint="per 1.00 of vol"
              />
              <Metric label="Theta" value={decimal(contract.greeks.theta, 4)} hint="per year" />
              <Metric label="Rho" value={decimal(contract.greeks.rho, 4)} hint="per 1.00 of rate" />
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
