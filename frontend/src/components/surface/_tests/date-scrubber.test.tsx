import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SnapshotSummary } from "@/lib/types";
import { DateScrubber } from "../date-scrubber";

const snapshot = (id: string, tradeDate: string): SnapshotSummary => ({
  id,
  tradeDate,
  underlyingPrice: 213.1,
  contractCount: 2444,
});

describe("DateScrubber", () => {
  it("renders nothing when the symbol has no snapshots", () => {
    const { container } = render(
      <DateScrubber snapshots={[]} activeId={null} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("says there is nothing to scrub rather than showing a dead slider", () => {
    render(
      <DateScrubber snapshots={[snapshot("a", "2026-07-20")]} activeId="a" onSelect={vi.fn()} />,
    );

    expect(screen.getByText(/nothing to scrub yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(screen.getByText("July 20, 2026")).toBeInTheDocument();
  });

  it("orders the timeline oldest first and puts the active date on the handle", () => {
    render(
      <DateScrubber
        snapshots={[
          snapshot("c", "2026-07-22"),
          snapshot("a", "2026-07-20"),
          snapshot("b", "2026-07-21"),
        ]}
        activeId="b"
        onSelect={vi.fn()}
      />,
    );

    const slider = screen.getByRole("slider");
    expect(slider).toHaveValue("1");
    expect(slider).toHaveAttribute("aria-valuetext", "July 21, 2026");
  });

  it("selects the snapshot the handle lands on", () => {
    const onSelect = vi.fn();
    render(
      <DateScrubber
        snapshots={[
          snapshot("a", "2026-07-20"),
          snapshot("b", "2026-07-21"),
          snapshot("c", "2026-07-22"),
        ]}
        activeId="a"
        onSelect={onSelect}
      />,
    );

    // a range input reports a drag as one change event, which is what the
    // browser fires and what arrow keys resolve to
    fireEvent.change(screen.getByRole("slider"), { target: { value: "2" } });
    expect(onSelect).toHaveBeenCalledWith("c");
  });
});
