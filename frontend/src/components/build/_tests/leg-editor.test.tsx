import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { makeLeg, type StrategyLeg } from "@/lib/strategy";
import { LegEditor } from "../leg-editor";

const EXPIRY = "2026-07-24";
const EXPIRATIONS = [EXPIRY, "2026-08-21"];

const legs = (): StrategyLeg[] => [
  makeLeg({
    action: "buy",
    type: "call",
    strike: 212.5,
    expiration: EXPIRY,
    quantity: 1,
    entryPrice: 7,
  }),
  makeLeg({
    action: "sell",
    type: "call",
    strike: 217.5,
    expiration: EXPIRY,
    quantity: 1,
    entryPrice: 4.9,
  }),
];

const renderEditor = (overrides: Partial<Parameters<typeof LegEditor>[0]> = {}) => {
  const onChange = vi.fn();
  const onRemove = vi.fn();
  const onAdd = vi.fn();
  render(
    <LegEditor
      legs={legs()}
      expirations={EXPIRATIONS}
      maxLegs={12}
      onChange={onChange}
      onRemove={onRemove}
      onAdd={onAdd}
      {...overrides}
    />,
  );
  return { onChange, onRemove, onAdd };
};

describe("LegEditor", () => {
  it("renders a row per leg", () => {
    renderEditor();
    expect(screen.getByLabelText("Leg 1 strike")).toHaveValue(212.5);
    expect(screen.getByLabelText("Leg 2 strike")).toHaveValue(217.5);
  });

  it("reports a strike edit", async () => {
    const { onChange } = renderEditor();
    await userEvent.clear(screen.getByLabelText("Leg 1 strike"));
    expect(onChange).toHaveBeenCalled();
  });

  it("reports an action change", async () => {
    const { onChange } = renderEditor();
    await userEvent.selectOptions(screen.getByLabelText("Leg 1 action"), "sell");
    expect(onChange).toHaveBeenCalledWith(expect.any(String), { action: "sell" });
  });

  it("reports a type change", async () => {
    const { onChange } = renderEditor();
    await userEvent.selectOptions(screen.getByLabelText("Leg 2 type"), "put");
    expect(onChange).toHaveBeenCalledWith(expect.any(String), { type: "put" });
  });

  it("removes a leg", async () => {
    const { onRemove } = renderEditor();
    await userEvent.click(screen.getByLabelText("Remove leg 2"));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("adds a leg", async () => {
    const { onAdd } = renderEditor();
    await userEvent.click(screen.getByRole("button", { name: "Add leg" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  // a position with no legs cannot be priced, so the last one has to stay
  it("cannot remove the only leg", () => {
    renderEditor({ legs: [legs()[0] as StrategyLeg] });
    expect(screen.getByLabelText("Remove leg 1")).toBeDisabled();
  });

  it("stops adding past the leg limit and says why", () => {
    renderEditor({ maxLegs: 2 });
    expect(screen.getByRole("button", { name: "Add leg" })).toBeDisabled();
    expect(screen.getByText(/twelve legs is the limit/i)).toBeInTheDocument();
  });

  // a saved leg can name an expiry the current snapshot does not carry. dropping
  // it from the list would silently move the position to another expiry.
  it("keeps an expiry the current snapshot does not list", () => {
    const orphan = makeLeg({
      action: "buy",
      type: "call",
      strike: 200,
      expiration: "2027-01-15",
      quantity: 1,
      entryPrice: 3,
    });
    renderEditor({ legs: [orphan] });
    expect(screen.getByLabelText("Leg 1 expiry")).toHaveValue("2027-01-15");
  });

  it("leaves a cleared field empty rather than forcing it to zero", async () => {
    const { onChange } = renderEditor();
    const price = screen.getByLabelText("Leg 1 price");
    await userEvent.clear(price);
    const patches = onChange.mock.calls.map((call) => call[1]);
    expect(patches.some((patch) => Number.isNaN(patch.entryPrice))).toBe(true);
  });
});
