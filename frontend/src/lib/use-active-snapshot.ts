import { useEffect } from "react";
import { useSnapshots, useSymbols } from "./queries";
import { useAppStore } from "./store";

/**
 * resolves the globally selected symbol + snapshot, healing a stored selection
 * that no longer exists. persisted state can outlive the row it points at, so a
 * stale id must fall back to the newest snapshot rather than 404 forever.
 */
export const useActiveSnapshot = () => {
  const ticker = useAppStore((s) => s.ticker);
  const snapshotId = useAppStore((s) => s.snapshotId);
  const setTicker = useAppStore((s) => s.setTicker);
  const setSnapshotId = useAppStore((s) => s.setSnapshotId);

  const symbols = useSymbols();
  const known = symbols.data;

  useEffect(() => {
    if (known === undefined || known.length === 0) return;
    const valid = known.some((s) => s.ticker === ticker);
    if (!valid) {
      const first = known[0];
      if (first !== undefined) setTicker(first.ticker);
    }
  }, [known, ticker, setTicker]);

  const activeTicker = known?.some((s) => s.ticker === ticker) === true ? ticker : null;
  const snapshots = useSnapshots(activeTicker);
  const available = snapshots.data;

  useEffect(() => {
    if (available === undefined || available.length === 0) return;
    const valid = available.some((s) => s.id === snapshotId);
    if (!valid) {
      const latest = available[0];
      if (latest !== undefined) setSnapshotId(latest.id);
    }
  }, [available, snapshotId, setSnapshotId]);

  const activeSnapshot = available?.find((s) => s.id === snapshotId);

  return {
    ticker: activeTicker,
    symbols,
    snapshots,
    snapshotId: activeSnapshot?.id ?? null,
    activeSnapshot,
  };
};
