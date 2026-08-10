import { describe, expect, it } from "vitest";
import { daysBetween, decimal, integer, longDate, money, percent, shortDate } from "../format";

describe("number formatting", () => {
  it("renders a dash for absent values rather than a zero", () => {
    expect(money(null)).toBe("-");
    expect(percent(undefined)).toBe("-");
    expect(integer(null)).toBe("-");
    expect(decimal(null)).toBe("-");
  });

  // zero is a real quote, not a missing one - a falsy check here would hide it
  it("keeps a genuine zero", () => {
    expect(money(0)).toBe("0.00");
    expect(integer(0)).toBe("0");
    expect(percent(0)).toBe("0.0%");
  });

  it("formats prices to two decimals", () => {
    expect(money(6.849)).toBe("6.85");
  });

  it("formats vol as a percent", () => {
    expect(percent(0.7497, 2)).toBe("74.97%");
  });

  it("groups large counts", () => {
    expect(integer(2444)).toBe("2,444");
  });
});

describe("date formatting", () => {
  // a plain yyyy-mm-dd parsed as utc renders as the previous day anywhere west
  // of greenwich, so these must stay local
  it("does not shift the day", () => {
    expect(shortDate("2026-07-20")).toBe("Jul 20 26");
    expect(longDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("returns the input unchanged when it is not a date", () => {
    expect(shortDate("not-a-date")).toBe("not-a-date");
    expect(longDate("")).toBe("");
  });

  it("counts days between two plain dates", () => {
    expect(daysBetween("2026-07-20", "2026-07-24")).toBe(4);
    expect(daysBetween("2026-07-20", "2026-07-20")).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(daysBetween("2026-07-20", "2026-08-21")).toBe(32);
  });

  it("is negative for a date already past", () => {
    expect(daysBetween("2026-07-24", "2026-07-20")).toBe(-4);
  });
});
