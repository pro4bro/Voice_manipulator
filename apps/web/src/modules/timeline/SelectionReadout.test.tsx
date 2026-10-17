import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { compositeColor, contrastRatio } from "../../domain/accessible-color";
import { contrastPalette } from "../../ui/color-theme";
import { SelectionReadout } from "./SelectionReadout";

it("renders source-time values with screen-reader labels and no visible field names", () => {
  const view = render(<SelectionReadout range={{ id: "r1", start: 2, end: 6 }} duration={10} canvasWidth={1000} viewportLeft={100} viewportWidth={700} />);
  const visible = [...view.container.querySelectorAll<HTMLElement>(".selection-readout__value")].map((node) => {
    const copy = node.cloneNode(true) as HTMLElement;
    copy.querySelector(".selection-readout__screen-reader")?.remove();
    return copy.textContent;
  }).join(" ");
  expect(visible).toContain("2.000s");
  expect(visible).toContain("4.000s");
  expect(visible).toContain("6.000s");
  expect(visible).not.toMatch(/IN|OUT|DURATION|START|END/);
  expect(view.getByLabelText("IN 2.000 seconds")).toBeInTheDocument();
  expect(view.getByLabelText("Duration 4.000 seconds")).toBeInTheDocument();
  expect(view.getByLabelText("OUT 6.000 seconds")).toBeInTheDocument();
});

it("displays original source times when imported-window geometry is clipped", () => {
  const view = render(<SelectionReadout range={{ id: "r2", start: 0, end: 1 }} duration={5} canvasWidth={500} viewportLeft={0} viewportWidth={500} displayStart={12.4} displayEnd={12.6} />);
  expect(view.container).toHaveTextContent("12.400s");
  expect(view.container).toHaveTextContent("0.200s");
  expect(view.container).toHaveTextContent("12.600s");
});

it("keeps large source timestamps exact and collision-free on one compact row", () => {
  const view = render(<SelectionReadout range={{ id: "r3", start: 0, end: 1 }} duration={5} canvasWidth={500}
    viewportLeft={0} viewportWidth={120} displayStart={123456789.123} displayEnd={123456789.456} />);
  expect(view.container).toHaveTextContent("123456789.123s");
  expect(view.container).toHaveTextContent("0.333s");
  expect(view.container).toHaveTextContent("123456789.456s");
  const markers = [...view.container.querySelectorAll<HTMLElement>(".selection-readout__value")];
  expect(markers).toHaveLength(3);
  expect(markers.map((marker) => getComputedStyle(marker).top)).toEqual(["4px", "4px", "4px"]);
  const fontSize = Number.parseFloat(view.container.querySelector<HTMLElement>(".selection-readout")!.style.getPropertyValue("--readout-font-size"));
  expect(fontSize).toBeLessThan(11);
  expect(fontSize).toBeGreaterThan(0);
});

it.each(["light", "dark"] as const)("renders opaque accent-hued text at AA contrast in the %s theme", (theme) => {
  const previousTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = theme;
  try {
    const view = render(<SelectionReadout range={{ id: `contrast-${theme}`, start: 2, end: 3 }} duration={10}
      canvasWidth={1000} viewportLeft={0} viewportWidth={1000} />);
    const values = [...view.container.querySelectorAll<HTMLElement>(".selection-readout__value")];
    expect(values).toHaveLength(3);
    const foreground = values[0].style.color;
    expect(foreground).toMatch(/^(?:#[\da-f]{6}|rgb\(\d+,\s*\d+,\s*\d+\))$/iu);
    expect(values.every((value) => value.style.color === foreground)).toBe(true);
    const palette = contrastPalette(theme);
    const compositedSelection = compositeColor("#ff6745", palette.audio, 0.3);
    expect(contrastRatio(foreground, palette.audio)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(foreground, compositedSelection)).toBeGreaterThanOrEqual(4.5);
  } finally {
    if (previousTheme === undefined) document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = previousTheme;
  }
});
