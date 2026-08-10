import { type FC, useEffect, useMemo, useState } from "react";
import { type ChainSide, ChainTable } from "@/components/chain/chain-table";
import { ContractPanel } from "@/components/chain/contract-panel";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { ApiError } from "@/lib/api";
import { daysBetween, shortDate } from "@/lib/format";
import { useChain } from "@/lib/queries";
import { useAppStore } from "@/lib/store";
import type { Contract } from "@/lib/types";
import { useActiveSnapshot } from "@/lib/use-active-snapshot";
import { useIsNarrow } from "@/lib/use-media-query";

export const ChainPage: FC = () => {
  const { snapshotId, symbols, snapshots } = useActiveSnapshot();
  const chain = useChain(snapshotId);
  const showVendor = useAppStore((s) => s.showVendor);
  const setShowVendor = useAppStore((s) => s.setShowVendor);

  const [expiration, setExpiration] = useState<string | null>(null);
  const [selected, setSelected] = useState<Contract | null>(null);
  const [mobileSide, setMobileSide] = useState<Exclude<ChainSide, "both">>("call");
  const isNarrow = useIsNarrow();

  const groups = useMemo(() => chain.data?.expirations ?? [], [chain.data]);

  // the stored expiry can vanish when the snapshot changes, so it falls back to
  // the front month rather than showing an empty table
  useEffect(() => {
    if (groups.length === 0) return;
    if (groups.some((group) => group.expiration === expiration)) return;
    setExpiration(groups[0]?.expiration ?? null);
  }, [groups, expiration]);

  // a contract selected on one expiry is meaningless on another, so the panel
  // closes when the expiry changes. expiration is the trigger, not a value the
  // effect reads, which is why the linter sees it as unnecessary.
  // biome-ignore lint/correctness/useExhaustiveDependencies: expiration is the intended trigger
  useEffect(() => {
    setSelected(null);
  }, [expiration]);

  const active = groups.find((group) => group.expiration === expiration);

  if (symbols.isError || snapshots.isError) {
    return (
      <ErrorState
        title="Could not load symbols"
        message="The server did not answer. Check that it is running and try again."
        onRetry={() => {
          void symbols.refetch();
          void snapshots.refetch();
        }}
      />
    );
  }

  if (symbols.isPending || snapshots.isPending) {
    return <LoadingState label="Loading symbols" rows={4} />;
  }

  if (snapshotId === null) {
    return (
      <EmptyState
        title="No snapshots yet"
        hint="Chains appear here once a snapshot has been ingested for this symbol."
      />
    );
  }

  if (chain.isPending) return <LoadingState label="Loading chain" rows={12} />;

  if (chain.isError) {
    const message =
      chain.error instanceof ApiError
        ? chain.error.message
        : "The chain could not be loaded. Try again.";
    return (
      <ErrorState
        title="Could not load the chain"
        message={message}
        onRetry={() => void chain.refetch()}
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="This snapshot has no contracts"
        hint="The snapshot was stored without any option contracts. Pick another date."
      />
    );
  }

  const spot = chain.data.snapshot.underlyingPrice;

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="scrollbar-thin -mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
          {groups.map((group) => {
            const days = daysBetween(chain.data.snapshot.tradeDate, group.expiration);
            const isActive = group.expiration === expiration;
            return (
              <button
                key={group.expiration}
                type="button"
                onClick={() => setExpiration(group.expiration)}
                aria-pressed={isActive}
                className={`shrink-0 cursor-pointer rounded-sm px-2.5 py-1.5 text-xs transition-colors ${
                  isActive
                    ? "bg-accent-glow text-accent"
                    : "text-text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                <span className="num">{shortDate(group.expiration)}</span>
                <span className="num ml-1.5 text-text-faint">{days}d</span>
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {isNarrow && (
            <fieldset className="flex rounded-sm border border-border">
              <legend className="sr-only">Side</legend>
              {(["call", "put"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setMobileSide(option)}
                  aria-pressed={mobileSide === option}
                  className={`cursor-pointer px-2.5 py-1 text-xs capitalize transition-colors ${
                    mobileSide === option ? "bg-accent-glow text-accent" : "text-text-muted"
                  }`}
                >
                  {option}s
                </button>
              ))}
            </fieldset>
          )}

          <label className="flex cursor-pointer items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={showVendor}
              onChange={(event) => setShowVendor(event.target.checked)}
              className="size-3.5 cursor-pointer accent-accent"
            />
            Vendor IV
          </label>
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {active === undefined ? (
          <EmptyState title="No contracts for this expiry" hint="Pick another expiry above." />
        ) : (
          <ChainTable
            contracts={active.contracts}
            spot={spot}
            showVendor={showVendor}
            side={isNarrow ? mobileSide : "both"}
            selectedId={selected?.contractId ?? null}
            onSelect={setSelected}
          />
        )}
      </div>

      <ContractPanel
        contract={selected}
        expiration={expiration}
        snapshot={chain.data.snapshot}
        onClose={() => setSelected(null)}
      />
    </div>
  );
};
