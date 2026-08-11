import type { FC } from "react";
import { shortDate } from "@/lib/format";
import type { LegAction, LegType, StrategyLeg } from "@/lib/strategy";

const CELL =
  "w-full rounded-sm border border-border bg-surface-2 px-2 py-1.5 text-sm text-text transition-colors hover:border-border-strong focus:border-accent-dim focus:outline-none";

/**
 * the native select keeps its semantics and keyboard behaviour, but the OS draws
 * its own arrow in the platform's colours, which reads as a stray light control
 * on a dark panel. appearance-none removes it and the chevron is drawn as an
 * inline svg data uri in the faint token instead.
 */
export const SELECT_CELL = `${CELL} cursor-pointer appearance-none bg-[length:12px] bg-[right_0.5rem_center] bg-no-repeat pr-7 [background-image:url("data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2016%2016'%20fill='none'%20stroke='%235B616B'%20stroke-width='1.5'%20stroke-linecap='round'%20stroke-linejoin='round'%3E%3Cpath%20d='M4%206l4%204%204-4'/%3E%3C/svg%3E")]`;

interface LegRowProps {
  leg: StrategyLeg;
  index: number;
  expirations: string[];
  canRemove: boolean;
  onChange: (id: string, patch: Partial<StrategyLeg>) => void;
  onRemove: (id: string) => void;
}

/** a blank field must not silently become 0, so an unparseable entry is left
    for the user to finish rather than coerced into a number they did not type */
const numberOr = (raw: string, fallback: number): number => {
  if (raw.trim() === "") return Number.NaN;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

/**
 * each control names itself with aria-label rather than a visually hidden
 * <label>. tailwind's sr-only hides with clip-path, which still counts toward
 * the scroll width of an ancestor - inside this horizontally scrolled table the
 * six hidden labels sat at the table's scrolled x and dragged the whole document
 * 80px wider than a 375px viewport. the accessible name is identical either way.
 */
const LegRow: FC<LegRowProps> = ({ leg, index, expirations, canRemove, onChange, onRemove }) => (
  <tr className="border-t border-border">
    <td className="py-2 pr-2">
      <select
        id={`action-${leg.id}`}
        aria-label={`Leg ${index + 1} action`}
        value={leg.action}
        onChange={(event) => onChange(leg.id, { action: event.target.value as LegAction })}
        className={`${SELECT_CELL} ${leg.action === "buy" ? "text-pos" : "text-neg"}`}
      >
        <option value="buy">Buy</option>
        <option value="sell">Sell</option>
      </select>
    </td>
    <td className="py-2 pr-2">
      <select
        id={`type-${leg.id}`}
        aria-label={`Leg ${index + 1} type`}
        value={leg.type}
        onChange={(event) => onChange(leg.id, { type: event.target.value as LegType })}
        className={SELECT_CELL}
      >
        <option value="call">Call</option>
        <option value="put">Put</option>
      </select>
    </td>
    <td className="py-2 pr-2">
      <input
        id={`strike-${leg.id}`}
        aria-label={`Leg ${index + 1} strike`}
        type="number"
        inputMode="decimal"
        step="0.5"
        min="0"
        value={Number.isFinite(leg.strike) ? leg.strike : ""}
        onChange={(event) => onChange(leg.id, { strike: numberOr(event.target.value, leg.strike) })}
        className={`${CELL} num`}
      />
    </td>
    <td className="py-2 pr-2">
      <select
        id={`expiry-${leg.id}`}
        aria-label={`Leg ${index + 1} expiry`}
        value={leg.expiration}
        onChange={(event) => onChange(leg.id, { expiration: event.target.value })}
        className={`${SELECT_CELL} num`}
      >
        {/* a leg loaded from a save can name an expiry this snapshot does not
            carry, and dropping it would silently move the position */}
        {expirations.includes(leg.expiration) ? null : (
          <option value={leg.expiration}>{shortDate(leg.expiration)}</option>
        )}
        {expirations.map((expiration) => (
          <option key={expiration} value={expiration}>
            {shortDate(expiration)}
          </option>
        ))}
      </select>
    </td>
    <td className="py-2 pr-2">
      <input
        id={`qty-${leg.id}`}
        aria-label={`Leg ${index + 1} quantity`}
        type="number"
        inputMode="numeric"
        step="1"
        min="1"
        value={Number.isFinite(leg.quantity) ? leg.quantity : ""}
        onChange={(event) =>
          onChange(leg.id, { quantity: numberOr(event.target.value, leg.quantity) })
        }
        className={`${CELL} num`}
      />
    </td>
    <td className="py-2 pr-2">
      <input
        id={`price-${leg.id}`}
        aria-label={`Leg ${index + 1} price`}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={Number.isFinite(leg.entryPrice) ? leg.entryPrice : ""}
        onChange={(event) =>
          onChange(leg.id, { entryPrice: numberOr(event.target.value, leg.entryPrice) })
        }
        className={`${CELL} num`}
      />
    </td>
    <td className="py-2 text-right">
      <button
        type="button"
        onClick={() => onRemove(leg.id)}
        disabled={!canRemove}
        aria-label={`Remove leg ${index + 1}`}
        className="cursor-pointer rounded-sm p-1.5 text-text-faint transition-colors hover:text-neg disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-text-faint"
      >
        <svg
          width="14"
          height="14"
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
    </td>
  </tr>
);

interface LegEditorProps {
  legs: StrategyLeg[];
  expirations: string[];
  maxLegs: number;
  onChange: (id: string, patch: Partial<StrategyLeg>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}

export const LegEditor: FC<LegEditorProps> = ({
  legs,
  expirations,
  maxLegs,
  onChange,
  onRemove,
  onAdd,
}) => (
  <div className="min-w-0">
    {/* min-w-0 lets this shrink below the table's intrinsic width, so the table
        scrolls inside it rather than widening the page and pushing the chart
        off a narrow screen */}
    <div className="scrollbar-thin min-w-0 max-w-full overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse">
        <thead>
          <tr className="text-left text-xs text-text-faint">
            <th className="w-24 pb-1 font-normal">Action</th>
            <th className="w-24 pb-1 font-normal">Type</th>
            <th className="w-24 pb-1 font-normal">Strike</th>
            <th className="w-28 pb-1 font-normal">Expiry</th>
            <th className="w-20 pb-1 font-normal">Qty</th>
            <th className="w-24 pb-1 font-normal">Price</th>
            <th className="w-10 pb-1" />
          </tr>
        </thead>
        <tbody>
          {legs.map((leg, index) => (
            <LegRow
              key={leg.id}
              leg={leg}
              index={index}
              expirations={expirations}
              canRemove={legs.length > 1}
              onChange={onChange}
              onRemove={onRemove}
            />
          ))}
        </tbody>
      </table>
    </div>

    <button
      type="button"
      onClick={onAdd}
      disabled={legs.length >= maxLegs}
      className="mt-3 cursor-pointer rounded-sm border border-border-strong px-3 py-1.5 text-xs text-text-muted transition-colors hover:border-accent-dim hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:text-text-muted"
    >
      Add leg
    </button>
    {legs.length >= maxLegs && (
      <span className="ml-3 text-xs text-text-faint">Twelve legs is the limit.</span>
    )}
  </div>
);
