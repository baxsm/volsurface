import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SviSlice } from "@/lib/types";
import { SurfaceReadout } from "../surface-readout";

const slice: SviSlice = {
  expiration: "2026-07-24",
  t: 0.010958904109589041,
  params: {
    a: -0.009751625566571196,
    b: 0.14323684182755528,
    rho: -0.8245934216354376,
    m: -0.3381014942173358,
    sigma: 0.19196967014481253,
  },
  quoteCount: 31,
  rmse: 0.00022409239278507439,
  iterations: 2000,
  butterflyArbFree: true,
  kMin: -0.19730537358984185,
  kMax: 0.19859028350217184,
};

const summary = {
  expiryCount: 18,
  quoteCount: 713,
  butterflyArbFreeCount: 18,
  repairedCount: 0,
};

describe("SurfaceReadout", () => {
  it("shows the fitted svi parameters for the active slice", () => {
    render(
      <SurfaceReadout
        slice={slice}
        atmVol={0.7457}
        calendarArbFree
        skippedExpirations={[]}
        summary={summary}
      />,
    );

    expect(screen.getByText("74.57%")).toBeInTheDocument();
    expect(screen.getByText("0.00022")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
    expect(screen.getByText("0.14324")).toBeInTheDocument();
    expect(screen.getByText("-0.82459")).toBeInTheDocument();
  });

  it("reports both arbitrage checks as passing", () => {
    render(
      <SurfaceReadout
        slice={slice}
        atmVol={0.74}
        calendarArbFree
        skippedExpirations={[]}
        summary={summary}
      />,
    );

    expect(screen.getByText("Butterfly arb-free")).toBeInTheDocument();
    expect(screen.getByText("Calendar arb-free")).toBeInTheDocument();
  });

  it("says so when a slice carries butterfly arbitrage", () => {
    render(
      <SurfaceReadout
        slice={{ ...slice, butterflyArbFree: false }}
        atmVol={0.74}
        calendarArbFree={false}
        skippedExpirations={[]}
        summary={summary}
      />,
    );

    expect(screen.getByText("Butterfly arb present")).toBeInTheDocument();
    expect(screen.getByText("Calendar arb present")).toBeInTheDocument();
  });

  it("notes a slice that was lifted to clear an earlier expiry", () => {
    render(
      <SurfaceReadout
        slice={{ ...slice, calendarRepaired: true }}
        atmVol={0.74}
        calendarArbFree
        skippedExpirations={[]}
        summary={summary}
      />,
    );

    expect(screen.getByText(/lifted to clear an earlier slice/i)).toBeInTheDocument();
  });

  it("names the expiries that could not be fitted", () => {
    render(
      <SurfaceReadout
        slice={slice}
        atmVol={0.74}
        calendarArbFree
        skippedExpirations={["2026-08-07", "2026-09-18"]}
        summary={summary}
      />,
    );

    expect(screen.getByText(/too few usable quotes/i)).toBeInTheDocument();
    expect(screen.getByText(/Aug 7 26, Sep 18 26/)).toBeInTheDocument();
  });

  it("falls back to the whole fit on a term cut instead of going blank", () => {
    render(
      <SurfaceReadout
        slice={undefined}
        atmVol={null}
        calendarArbFree
        skippedExpirations={[]}
        summary={summary}
      />,
    );

    expect(screen.getByText(/no single set of SVI parameters/i)).toBeInTheDocument();
    expect(screen.getByText("Every slice butterfly arb-free")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
    expect(screen.getByText("713")).toBeInTheDocument();
  });

  it("counts the slices carrying butterfly arb on a term cut", () => {
    render(
      <SurfaceReadout
        slice={undefined}
        atmVol={null}
        calendarArbFree
        skippedExpirations={[]}
        summary={{ ...summary, butterflyArbFreeCount: 16 }}
      />,
    );

    expect(screen.getByText("2 slice with butterfly arb")).toBeInTheDocument();
  });
});
