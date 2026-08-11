import { type FC, useId } from "react";
import { longDate, shortDate } from "@/lib/format";
import type { SnapshotSummary } from "@/lib/types";

interface DateScrubberProps {
  snapshots: SnapshotSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * the snapshot timeline. dragging it swaps the fitted grid and the mesh travels
 * to the new one.
 *
 * with a single stored date there is nothing to drag, so it says so rather than
 * rendering a dead slider that implies history the database does not hold.
 */
export const DateScrubber: FC<DateScrubberProps> = ({ snapshots, activeId, onSelect }) => {
  const inputId = useId();

  // oldest to newest reads left to right, the way a timeline is expected to
  const ordered = [...snapshots].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate));
  const activeIndex = ordered.findIndex((snapshot) => snapshot.id === activeId);
  const active = ordered[activeIndex];

  if (ordered.length === 0) return null;

  if (ordered.length === 1) {
    const only = ordered[0] as SnapshotSummary;
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="text-xs tracking-wide text-text-faint uppercase">Snapshot</span>
        <span className="num text-sm text-text">{longDate(only.tradeDate)}</span>
        <span className="text-xs text-text-muted">
          One stored trade date, so there is nothing to scrub yet.
        </span>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-xs tracking-wide text-text-faint uppercase">
          Snapshot
        </label>
        <span className="num text-sm text-text">
          {active === undefined ? "-" : longDate(active.tradeDate)}
        </span>
      </div>

      <input
        id={inputId}
        type="range"
        min={0}
        max={ordered.length - 1}
        step={1}
        value={activeIndex < 0 ? 0 : activeIndex}
        onChange={(event) => {
          const next = ordered[Number(event.target.value)];
          if (next !== undefined) onSelect(next.id);
        }}
        aria-label="Snapshot trade date"
        aria-valuetext={active === undefined ? undefined : longDate(active.tradeDate)}
        className="mt-3 w-full cursor-pointer accent-accent"
      />

      <div className="mt-1 flex justify-between">
        <span className="num text-xs text-text-faint">
          {shortDate((ordered[0] as SnapshotSummary).tradeDate)}
        </span>
        <span className="num text-xs text-text-faint">
          {shortDate((ordered[ordered.length - 1] as SnapshotSummary).tradeDate)}
        </span>
      </div>
    </div>
  );
};
