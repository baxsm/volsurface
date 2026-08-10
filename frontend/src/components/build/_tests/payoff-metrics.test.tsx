import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PayoffResult } from "@/lib/strategy";
import { PayoffMetrics } from "../payoff-metrics";

const result = (overrides: Partial<PayoffResult> = {}): PayoffResult => ({
  points: [
    { spot: 190, profit: -2.1 },
    { spot: 230, profit: 2.9 },
  ],
  breakevens: [214.6],
  maxProfit: 2.9,
  maxLoss: -2.1,
  netDebit: 2.1,
  range: { min: 190, max: 230 },
  ...overrides,
});

describe("PayoffMetrics", () => {
  it("shows a debit as paid", () => {
    render(<PayoffMetrics payoff={result()} />);
    expect(screen.getByText("Net debit")).toBeInTheDocument();
    expect(screen.getByText("paid")).toBeInTheDocument();
  });

  it("shows a credit as received, without a minus sign", () => {
    render(<PayoffMetrics payoff={result({ netDebit: -3.42 })} />);
    expect(screen.getByText("Net credit")).toBeInTheDocument();
    expect(screen.getByText("received")).toBeInTheDocument();
    expect(screen.getByText("3.42")).toBeInTheDocument();
  });

  // unlimited is not a number, and rendering it as one would be a lie about a
  // position whose upside has no cap
  it("calls an uncapped profit unlimited rather than zero", () => {
    render(<PayoffMetrics payoff={result({ maxProfit: null })} />);
    expect(screen.getByText("Unlimited")).toBeInTheDocument();
  });

  it("lists both breakevens", () => {
    render(<PayoffMetrics payoff={result({ breakevens: [204.08, 220.92] })} />);
    expect(screen.getByText("Breakevens")).toBeInTheDocument();
    expect(screen.getByText(/204\.08/)).toBeInTheDocument();
    expect(screen.getByText(/220\.92/)).toBeInTheDocument();
  });

  it("says so when the position never crosses zero", () => {
    render(<PayoffMetrics payoff={result({ breakevens: [] })} />);
    expect(screen.getByText("None")).toBeInTheDocument();
    expect(screen.getByText("never crosses zero")).toBeInTheDocument();
  });

  it("uses the singular label for one breakeven", () => {
    render(<PayoffMetrics payoff={result()} />);
    expect(screen.getByText("Breakeven")).toBeInTheDocument();
  });
});
