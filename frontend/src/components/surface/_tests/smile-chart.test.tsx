import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SmileChart, type SmilePoint } from "../smile-chart";

const smile: SmilePoint[] = [
  { x: 90, iv: 0.52 },
  { x: 100, iv: 0.47 },
  { x: 110, iv: 0.49 },
  { x: 120, iv: 0.55 },
];

describe("SmileChart", () => {
  it("draws the curve with real geometry", () => {
    const { container } = render(<SmileChart points={smile} xLabel="strike" />);

    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThan(1);
    for (const path of paths) {
      const d = path.getAttribute("d") ?? "";
      expect(d).not.toContain("NaN");
      expect(d.length).toBeGreaterThan(5);
    }
  });

  it("labels the chart for screen readers", () => {
    render(<SmileChart points={smile} xLabel="strike" />);
    expect(
      screen.getByRole("img", { name: /implied volatility against strike/i }),
    ).toBeInTheDocument();
  });

  it("draws nothing when there is only one fitted point", () => {
    const { container } = render(<SmileChart points={[{ x: 100, iv: 0.5 }]} xLabel="strike" />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("marks the spot when it falls inside the window", () => {
    render(<SmileChart points={smile} xLabel="strike" marker={105} markerLabel="spot" />);
    expect(screen.getByText("spot")).toBeInTheDocument();
  });

  it("omits the marker when it falls outside the window", () => {
    render(<SmileChart points={smile} xLabel="strike" marker={500} markerLabel="spot" />);
    expect(screen.queryByText("spot")).not.toBeInTheDocument();
  });

  it("renders a term cut on a square root axis", () => {
    const term: SmilePoint[] = [
      { x: 0.01, iv: 0.87 },
      { x: 0.25, iv: 0.51 },
      { x: 1.2, iv: 0.47 },
      { x: 2.4, iv: 0.46 },
    ];
    const { container } = render(<SmileChart points={term} xLabel="years" sqrtScale />);
    const d = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(d).not.toContain("NaN");
    expect(d.length).toBeGreaterThan(5);
  });

  // a min-height here let ParentSize's height:100% wrappers resolve to 0, which
  // clipped the whole chart away while leaving it present in the dom
  it("gives the chart a resolvable height, not just a floor", () => {
    const { container } = render(<SmileChart points={[]} xLabel="strike" />);
    const box = container.firstElementChild as HTMLElement;
    expect(box.style.height).toBe("168px");
  });

  // the chart rendered into a zero-height wrapper once, so it was in the dom
  // with real geometry and still painted nothing
  it("does not sit inside a collapsed wrapper", () => {
    const { container } = render(<SmileChart points={smile} xLabel="strike" />);
    const svg = container.querySelector("svg");
    if (svg === null) throw new Error("no chart");

    let node = svg.parentElement;
    while (node !== null && node !== container) {
      const height = node.style.height;
      if (height !== "") expect(height).not.toBe("0px");
      node = node.parentElement;
    }
    expect(svg.getAttribute("height")).toBe("168");
  });

  it("does not repeat a rounded axis label on a narrow range", () => {
    const narrow: SmilePoint[] = [
      { x: 0.41, iv: 0.5312 },
      { x: 1.2, iv: 0.5348 },
      { x: 2.41, iv: 0.5375 },
    ];
    render(<SmileChart points={narrow} xLabel="years" sqrtScale />);
    const labels = screen.getAllByText(/^\d+%$/).map((n) => n.textContent);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("survives a perfectly flat smile", () => {
    const flat: SmilePoint[] = [
      { x: 90, iv: 0.5 },
      { x: 100, iv: 0.5 },
      { x: 110, iv: 0.5 },
    ];
    const { container } = render(<SmileChart points={flat} xLabel="strike" />);
    const d = container.querySelector("path")?.getAttribute("d") ?? "";
    expect(d).not.toContain("NaN");
  });
});
