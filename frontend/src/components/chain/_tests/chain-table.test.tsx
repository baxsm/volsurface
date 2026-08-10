import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { atmStrike, ChainTable, toStrikeRows } from "../chain-table";
import { contract, ladder } from "./fixtures";

describe("toStrikeRows", () => {
  it("pairs the call and put at each strike", () => {
    const rows = toStrikeRows(ladder());
    expect(rows).toHaveLength(3);
    expect(rows[0]?.call?.contractId).toBe("c-205");
    expect(rows[0]?.put?.contractId).toBe("p-205");
  });

  it("sorts ascending by strike", () => {
    const rows = toStrikeRows([...ladder()].reverse());
    expect(rows.map((r) => r.strike)).toEqual([205, 212.5, 220]);
  });

  it("keeps a strike that has only one side", () => {
    const rows = toStrikeRows([contract({ type: "call", strike: 300 })]);
    expect(rows[0]?.call).toBeDefined();
    expect(rows[0]?.put).toBeUndefined();
  });
});

describe("atmStrike", () => {
  it("picks the listed strike nearest spot", () => {
    const rows = toStrikeRows(ladder());
    expect(atmStrike(rows, 213.1)).toBe(212.5);
  });

  it("is null without a spot", () => {
    expect(atmStrike(toStrikeRows(ladder()), null)).toBeNull();
  });

  it("is null with no rows", () => {
    expect(atmStrike([], 200)).toBeNull();
  });
});

const renderTable = (props: Partial<Parameters<typeof ChainTable>[0]> = {}) => {
  const onSelect = vi.fn();
  render(
    <ChainTable
      contracts={ladder()}
      spot={213.1}
      showVendor={false}
      side="both"
      selectedId={null}
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect };
};

describe("ChainTable", () => {
  it("renders a row per strike", () => {
    renderTable();
    expect(screen.getByText("205.00")).toBeInTheDocument();
    expect(screen.getByText("212.50")).toBeInTheDocument();
    expect(screen.getByText("220.00")).toBeInTheDocument();
  });

  it("marks exactly one row as at the money", () => {
    const { container } = render(
      <ChainTable
        contracts={ladder()}
        spot={213.1}
        showVendor={false}
        side="both"
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    const atm = container.querySelectorAll("tr[data-atm=true]");
    expect(atm).toHaveLength(1);
    expect(within(atm[0] as HTMLElement).getByText("212.50")).toBeInTheDocument();
  });

  it("hides the vendor column until it is asked for", () => {
    renderTable();
    expect(screen.queryByText("Vendor")).not.toBeInTheDocument();
  });

  it("shows a vendor column on both sides when toggled", () => {
    renderTable({ showVendor: true });
    expect(screen.getAllByText("Vendor")).toHaveLength(2);
  });

  it("calls back with the contract that was clicked", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderTable();

    await user.click(screen.getByRole("button", { name: "Call at strike 212.5" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0]?.[0]).toMatchObject({ contractId: "c-212", type: "call" });
  });

  it("selects on Enter for keyboard users", async () => {
    const user = userEvent.setup();
    const { onSelect } = renderTable();

    const cell = screen.getAllByRole("button", { name: "Put at strike 205" })[0];
    cell?.focus();
    await user.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("shows a dash where a strike has no contract on that side", () => {
    render(
      <ChainTable
        contracts={[contract({ type: "call", strike: 205 })]}
        spot={205}
        showVendor={false}
        side="both"
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("reports no fit rather than a number when iv did not solve", () => {
    render(
      <ChainTable
        contracts={[contract({ computedIv: null, ivConverged: false })]}
        spot={212.5}
        showVendor={false}
        side="both"
        selectedId={null}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("no fit")).toBeInTheDocument();
  });

  it("renders only the requested side on a narrow layout", () => {
    renderTable({ side: "call" });
    expect(screen.getByText("Calls")).toBeInTheDocument();
    expect(screen.queryByText("Puts")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Put at strike 205" })).not.toBeInTheDocument();
  });
});
