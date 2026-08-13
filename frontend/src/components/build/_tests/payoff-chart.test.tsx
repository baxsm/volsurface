import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PayoffResult } from "@/lib/strategy";
import { PayoffChart } from "../payoff-chart";

const longCall = (): PayoffResult => {
  const points = Array.from({ length: 41 }, (_, i) => {
    const spot = 80 + i;
    return { spot, profit: Math.max(spot - 100, 0) - 5 };
  });
  return {
    points,
    breakevens: [105],
    range: { min: 80, max: 120 },
    maxProfit: null,
    maxLoss: -5,
    netDebit: 5,
  };
};

const flat = (profit: number): PayoffResult => ({
  points: Array.from({ length: 41 }, (_, i) => ({ spot: 80 + i, profit })),
  breakevens: [],
  range: { min: 80, max: 120 },
  maxProfit: profit,
  maxLoss: profit,
  netDebit: 0,
});

describe("PayoffChart", () => {
  it("draws the curve with real geometry", () => {
    const { container } = render(<PayoffChart payoff={longCall()} spot={100} />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(1);
    for (const path of paths) {
      const d = path.getAttribute("d") ?? "";
      expect(d).not.toContain("NaN");
      expect(d.length).toBeGreaterThan(5);
    }
  });

  it("labels the chart for screen readers", () => {
    render(<PayoffChart payoff={longCall()} spot={100} />);
    expect(screen.getByRole("img", { name: /profit and loss at expiry/i })).toBeInTheDocument();
  });

  it("marks the spot when it falls inside the window", () => {
    render(<PayoffChart payoff={longCall()} spot={100} />);
    expect(screen.getByText(/spot 100/)).toBeInTheDocument();
  });

  it("omits the spot marker when it falls outside the window", () => {
    render(<PayoffChart payoff={longCall()} spot={500} />);
    expect(screen.queryByText(/spot 500/)).not.toBeInTheDocument();
  });

  it("labels each breakeven", () => {
    render(<PayoffChart payoff={longCall()} spot={100} />);
    expect(screen.getByText("105.00")).toBeInTheDocument();
  });

  it("renders a position that only ever loses", () => {
    const { container } = render(<PayoffChart payoff={flat(-5)} spot={100} />);
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("renders a position that only ever profits", () => {
    const { container } = render(<PayoffChart payoff={flat(5)} spot={100} />);
    expect(container.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("explains itself when there is no range to draw", () => {
    const degenerate: PayoffResult = {
      points: [{ spot: 100, profit: 1 }],
      breakevens: [],
      range: { min: 100, max: 100 },
      maxProfit: 1,
      maxLoss: 1,
      netDebit: 0,
    };
    render(<PayoffChart payoff={degenerate} spot={100} />);
    expect(screen.getByText(/no range to draw/i)).toBeInTheDocument();
  });

  it("dims the curve while a fresh one is in flight", () => {
    const { container } = render(<PayoffChart payoff={longCall()} spot={100} stale />);
    expect(container.querySelector(".opacity-50")).not.toBeNull();
  });
});
