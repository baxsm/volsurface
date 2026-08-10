import { type FC, useEffect, useMemo, useRef } from "react";
import { decimal, integer, money, percent } from "@/lib/format";
import type { Contract } from "@/lib/types";

export interface StrikeRow {
  strike: number;
  call: Contract | undefined;
  put: Contract | undefined;
}

/** pairs calls and puts onto one strike ladder, the standard chain layout */
export const toStrikeRows = (contracts: Contract[]): StrikeRow[] => {
  const byStrike = new Map<number, StrikeRow>();

  for (const contract of contracts) {
    const row = byStrike.get(contract.strike) ?? {
      strike: contract.strike,
      call: undefined,
      put: undefined,
    };
    if (contract.type === "call") row.call = contract;
    else row.put = contract;
    byStrike.set(contract.strike, row);
  }

  return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
};

/** the listed strike closest to spot, which anchors the ladder */
export const atmStrike = (rows: StrikeRow[], spot: number | null): number | null => {
  if (spot === null || rows.length === 0) return null;
  let best = rows[0]?.strike ?? null;
  let bestGap = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const gap = Math.abs(row.strike - spot);
    if (gap < bestGap) {
      bestGap = gap;
      best = row.strike;
    }
  }
  return best;
};

const COLUMNS = ["Vol", "OI", "Bid", "Ask", "Delta", "IV"] as const;

// the column row sticks directly under the calls/strike/puts row. one pixel
// short of that row's height on purpose: landing exactly on it leaves a
// sub-pixel seam that scrolling rows show through.
const ROW_ONE_H = "top-[28px]";

interface SideCellsProps {
  contract: Contract | undefined;
  showVendor: boolean;
  itm: boolean;
  selected: boolean;
  onSelect: (contract: Contract) => void;
  label: string;
}

/**
 * one side of the ladder. cells are emitted flat into the parent row so every
 * column stays on the same grid - a nested table per side would let each row
 * size its own columns and the numbers would stop lining up.
 */
const SideCells: FC<SideCellsProps> = ({
  contract,
  showVendor,
  itm,
  selected,
  onSelect,
  label,
}) => {
  const shade = itm ? "bg-white/[0.025]" : "";
  const base = `num px-2 py-1.5 text-right ${shade}`;

  if (contract === undefined) {
    const columns = showVendor ? [...COLUMNS, "Vendor"] : [...COLUMNS];
    return (
      <>
        {columns.map((column) => (
          <td key={column} className={`${base} text-text-faint`}>
            -
          </td>
        ))}
      </>
    );
  }

  // clicking anywhere on the side selects it, but only the first cell holds a
  // real button - one focus stop and one announcement per contract instead of
  // the same label repeated across all seven columns
  const select = () => onSelect(contract);

  const cell = (tone: string) => ({
    onClick: select,
    className: `${base} cursor-pointer ${tone}`,
  });

  return (
    <>
      <td className={`num p-0 text-right ${shade}`}>
        <button
          type="button"
          onClick={select}
          aria-label={label}
          aria-pressed={selected}
          className="num block w-full cursor-pointer px-2 py-1.5 text-right text-text-muted"
        >
          {integer(contract.volume)}
        </button>
      </td>
      <td {...cell("text-text-muted")}>{integer(contract.openInterest)}</td>
      <td {...cell("text-text")}>{money(contract.bid)}</td>
      <td {...cell("text-text")}>{money(contract.ask)}</td>
      <td {...cell("text-text-muted")}>{decimal(contract.greeks.delta, 3)}</td>
      <td
        {...cell(contract.ivConverged === false ? "text-warn" : "text-accent")}
        title={contract.ivConverged === false ? "Implied vol did not converge" : undefined}
      >
        {contract.computedIv === null ? "no fit" : percent(contract.computedIv)}
      </td>
      {showVendor && <td {...cell("text-text-faint")}>{percent(contract.vendorIv)}</td>}
    </>
  );
};

export type ChainSide = "both" | "call" | "put";

interface ChainTableProps {
  contracts: Contract[];
  spot: number | null;
  showVendor: boolean;
  selectedId: string | null;
  side: ChainSide;
  onSelect: (contract: Contract) => void;
}

export const ChainTable: FC<ChainTableProps> = ({
  contracts,
  spot,
  showVendor,
  selectedId,
  side,
  onSelect,
}) => {
  const rows = useMemo(() => toStrikeRows(contracts), [contracts]);
  const atm = useMemo(() => atmStrike(rows, spot), [rows, spot]);
  const atmRef = useRef<HTMLTableRowElement>(null);

  // a full ladder runs far past the money in both directions, so the money is
  // centred whenever the ladder changes rather than leaving the user parked at
  // the lowest strike. atm is the trigger rather than something the effect
  // reads, so the linter cannot see why it belongs here.
  // biome-ignore lint/correctness/useExhaustiveDependencies: atm is the intended trigger
  useEffect(() => {
    atmRef.current?.scrollIntoView({ block: "center" });
  }, [atm]);

  const headers = showVendor ? [...COLUMNS, "Vendor"] : [...COLUMNS];
  const span = headers.length;

  // both sides at once needs more width than a phone has, so narrow screens
  // show one side with the strike leading instead of shrinking the columns
  // until the numbers stop being readable
  const showCalls = side !== "put";
  const showPuts = side !== "call";
  const strikeFirst = side !== "both";

  // sticky has to sit on each th, not on thead or tr: in table layout those two
  // are not reliable containing blocks, and the group row would scroll under
  // the column row instead of sticking above it. ROW_ONE_H is the measured
  // height of the group row, which becomes the second row's offset.
  const groupCell =
    "sticky top-0 z-20 bg-surface-2 px-2 py-1.5 text-xs font-normal text-text-faint";
  const columnCell = `sticky ${ROW_ONE_H} z-20 bg-surface-2 px-2 py-1.5 text-right font-normal`;

  const strikeHeader = (
    <th scope="col" className={`${groupCell} text-center ${strikeFirst ? "left-0 z-30" : ""}`}>
      Strike
    </th>
  );

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border">
          {strikeFirst && strikeHeader}
          {showCalls && (
            <th colSpan={span} className={`${groupCell} text-left`}>
              Calls
            </th>
          )}
          {!strikeFirst && strikeHeader}
          {showPuts && (
            <th colSpan={span} className={`${groupCell} text-right`}>
              Puts
            </th>
          )}
        </tr>
        <tr className="border-b border-border text-xs text-text-faint">
          {strikeFirst && (
            <th scope="col" className={`${columnCell} left-0 z-30`}>
              <span className="sr-only">Strike</span>
            </th>
          )}
          {showCalls &&
            headers.map((header) => (
              <th key={`call-${header}`} scope="col" className={columnCell}>
                {header}
              </th>
            ))}
          {!strikeFirst && (
            <th scope="col" className={columnCell}>
              <span className="sr-only">Strike</span>
            </th>
          )}
          {showPuts &&
            headers.map((header) => (
              <th key={`put-${header}`} scope="col" className={columnCell}>
                {header}
              </th>
            ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isAtm = row.strike === atm;
          const strikeCell = (
            <td
              className={`num px-3 py-1.5 text-center ${strikeFirst ? "sticky left-0 z-10" : ""} ${
                isAtm ? "bg-atm font-medium text-accent" : "bg-surface-2 text-text"
              }`}
            >
              {money(row.strike)}
            </td>
          );

          return (
            <tr
              key={row.strike}
              ref={isAtm ? atmRef : undefined}
              data-atm={isAtm ? "true" : undefined}
              className={`border-b border-border/50 ${isAtm ? "bg-accent-glow" : ""}`}
            >
              {strikeFirst && strikeCell}
              {showCalls && (
                <SideCells
                  contract={row.call}
                  showVendor={showVendor}
                  itm={spot !== null && row.strike < spot}
                  selected={row.call?.contractId === selectedId}
                  onSelect={onSelect}
                  label={`Call at strike ${row.strike}`}
                />
              )}
              {!strikeFirst && strikeCell}
              {showPuts && (
                <SideCells
                  contract={row.put}
                  showVendor={showVendor}
                  itm={spot !== null && row.strike > spot}
                  selected={row.put?.contractId === selectedId}
                  onSelect={onSelect}
                  label={`Put at strike ${row.strike}`}
                />
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
