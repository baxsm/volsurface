/** an em dash placeholder would read as data, so absent values render as a dash */
const ABSENT = "-";

export const money = (value: number | null | undefined, digits = 2): string =>
  value == null ? ABSENT : value.toFixed(digits);

export const percent = (value: number | null | undefined, digits = 1): string =>
  value == null ? ABSENT : `${(value * 100).toFixed(digits)}%`;

export const decimal = (value: number | null | undefined, digits = 4): string =>
  value == null ? ABSENT : value.toFixed(digits);

export const integer = (value: number | null | undefined): string =>
  value == null ? ABSENT : value.toLocaleString("en-US");

/** dates arrive as plain yyyy-mm-dd and are parsed into local time rather than
    through Date(iso), which reads them as utc and shifts a day behind it */
export const shortDate = (iso: string): string => {
  const date = toLocalDate(iso);
  if (date === null) return iso;
  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${label} ${String(date.getFullYear()).slice(2)}`;
};

export const longDate = (iso: string): string => {
  const date = toLocalDate(iso);
  if (date === null) return iso;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const toLocalDate = (iso: string): Date | null => {
  const parts = iso.split("-").map(Number);
  // NaN survives a plain undefined check and would render as "Invalid Date",
  // so each part has to be a real number
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts as [number, number, number];
  return new Date(year, month - 1, day);
};

/**
 * whole days between two plain dates. expiries are measured from the snapshot's
 * trade date, not from today - a stored snapshot is a fixed point in time and
 * counting from now would show its expiries as already past.
 */
export const daysBetween = (fromIso: string, toIso: string): number => {
  const from = toLocalDate(fromIso);
  const to = toLocalDate(toIso);
  if (from === null || to === null) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
};
