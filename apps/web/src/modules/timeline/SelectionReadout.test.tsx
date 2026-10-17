import { render } from "@testing-library/react";
import { expect, it } from "vitest";
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
