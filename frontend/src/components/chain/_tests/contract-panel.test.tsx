import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SnapshotMeta } from "@/lib/types";
import { ContractPanel } from "../contract-panel";
import { contract } from "./fixtures";

const snapshot: SnapshotMeta = {
  id: "snap-1",
  ticker: "IBM",
  tradeDate: "2026-07-20",
  underlyingPrice: 213.1,
  rate: 0.04,
  dividendYield: 0.01,
};

const renderPanel = (overrides: Partial<Parameters<typeof ContractPanel>[0]> = {}) => {
  const onClose = vi.fn();
  render(
    <ContractPanel
      contract={contract()}
      expiration="2026-07-24"
      snapshot={snapshot}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onClose };
};

describe("ContractPanel", () => {
  it("renders nothing without a contract", () => {
    renderPanel({ contract: null });
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  });

  it("shows the contract id and market data", () => {
    renderPanel();
    expect(screen.getByText("IBM260724C00212500")).toBeInTheDocument();
    expect(screen.getByText("6.85")).toBeInTheDocument();
    expect(screen.getByText("7.15")).toBeInTheDocument();
  });

  it("shows the spread between bid and ask", () => {
    renderPanel();
    expect(screen.getByText("0.30")).toBeInTheDocument();
  });

  it("reports convergence when the solver converged", () => {
    renderPanel();
    expect(screen.getByText("converged")).toBeInTheDocument();
    expect(screen.getByText("74.97%")).toBeInTheDocument();
  });

  it("reports a failed solve distinctly", () => {
    renderPanel({ contract: contract({ ivConverged: false, computedIv: null }) });
    expect(screen.getByText(/no volatility reprices it/i)).toBeInTheDocument();
    expect(screen.queryByText("converged")).not.toBeInTheDocument();
  });

  it("states the rate and dividend the greeks were priced under", () => {
    renderPanel();
    expect(screen.getByText(/4.00% rate and 1.00% dividend yield/)).toBeInTheDocument();
  });

  it("closes on the close button", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Close contract detail" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPanel();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
