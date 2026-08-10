import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "../states";

describe("data view states", () => {
  it("announces loading to assistive tech", () => {
    render(<LoadingState label="Loading chain" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading chain");
  });

  it("renders an empty state without an alert", () => {
    render(<EmptyState title="No snapshots yet" hint="Nothing has been ingested." />);
    expect(screen.getByText("No snapshots yet")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // the two are visually and semantically different on purpose: a failure that
  // renders as "no data" tells the user the wrong thing
  it("renders an error state as an alert, distinct from empty", () => {
    render(<ErrorState title="Could not load the chain" message="The server did not answer." />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load the chain");
  });

  it("offers a retry only when one is given", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();

    const { rerender } = render(<ErrorState title="Failed" message="Try again." />);
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();

    rerender(<ErrorState title="Failed" message="Try again." onRetry={onRetry} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
