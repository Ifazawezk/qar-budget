import { categoryName } from "../lib/categories";
import { formatPercent } from "../lib/format";
import { formatQAR } from "../lib/money";
import type { CategoryTotal } from "../lib/summary";
import { h, s } from "./dom";

export interface ChartOptions {
  spending: readonly CategoryTotal[];
  locale: string;
  rtl: boolean;
  /** Caption for the screen reader table. */
  caption: string;
  headers: [category: string, amount: string, share: string];
}

// One row per category: the name and its share on the first line, the bar below it
// with the amount at its tip. Putting the name above the bar leaves the full width
// for the bar, which matters on a phone.
const ROW = 46;
const LABEL_Y = 15;
const BAR_Y = 24;
const BAR_H = 14;
const GAP = 6;

/** A bar that is square at the baseline and has a 4px rounded tip. */
function barPath(baseline: number, length: number, y: number, rtl: boolean): string {
  const r = Math.min(4, length / 2, BAR_H / 2);
  const dir = rtl ? -1 : 1;
  const tip = baseline + dir * length;
  const sweep = rtl ? 0 : 1;
  return (
    `M${baseline} ${y}H${tip - dir * r}` +
    `A${r} ${r} 0 0 ${sweep} ${tip} ${y + r}V${y + BAR_H - r}` +
    `A${r} ${r} 0 0 ${sweep} ${tip - dir * r} ${y + BAR_H}H${baseline}Z`
  );
}

function draw(host: HTMLElement, width: number, o: ChartOptions): void {
  const height = o.spending.length * ROW;
  // Mirroring is done by hand, so the SVG itself always lays out left to right.
  const svg = s("svg", {
    class: "chart-svg",
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    direction: "ltr",
    "aria-hidden": "true",
  });
  host.replaceChildren(svg);

  // Measure the amount labels first so even the longest bar leaves room for its label.
  const values = o.spending.map((c) =>
    s("text", { class: "chart-value", "dominant-baseline": "central" }, formatQAR(c.total, o.locale)),
  );
  svg.append(...values);
  const widest = Math.max(0, ...values.map((text) => text.getComputedTextLength()));
  const room = Math.max(width - widest - GAP, 40);
  const largest = o.spending[0]?.total || 1;

  const x = (offset: number) => (o.rtl ? width - offset : offset);
  const startAnchor = o.rtl ? "end" : "start";
  const endAnchor = o.rtl ? "start" : "end";

  o.spending.forEach((c, i) => {
    const top = i * ROW;
    const length = Math.max(2, (c.total / largest) * room);
    const name = categoryName(c.category);
    const amount = formatQAR(c.total, o.locale);
    const share = formatPercent(c.share, o.locale);
    const value = values[i];
    if (!value) return;
    value.setAttribute("x", String(x(length + GAP)));
    value.setAttribute("y", String(top + BAR_Y + BAR_H / 2));
    value.setAttribute("text-anchor", startAnchor);

    svg.append(
      s(
        "g",
        { class: "chart-row" },
        s("title", {}, `${name}: ${amount} (${share})`),
        s("rect", { class: "chart-hit", x: 0, y: top, width, height: ROW }),
        s("text", { class: "chart-label", x: x(0), y: top + LABEL_Y, "text-anchor": startAnchor }, name),
        s("text", { class: "chart-share", x: x(width), y: top + LABEL_Y, "text-anchor": endAnchor }, share),
        s("path", { class: "chart-bar", d: barPath(x(0), length, top + BAR_Y, o.rtl) }),
        value,
      ),
    );
  });
}

/** Horizontal bar chart of spending per category, redrawn whenever its width changes. */
export function spendingChart(o: ChartOptions): HTMLElement {
  const canvas = h("div", { class: "chart" });
  let drawnWidth = -1;
  const observer = new ResizeObserver(() => {
    // The old chart is detached on every re-render; stop watching it.
    if (!canvas.isConnected) return observer.disconnect();
    const width = Math.floor(canvas.clientWidth);
    if (width === 0 || width === drawnWidth) return;
    drawnWidth = width;
    draw(canvas, width, o);
  });
  observer.observe(canvas);

  const table = h(
    "table",
    { class: "sr-only" },
    h("caption", {}, o.caption),
    h("thead", {}, h("tr", {}, o.headers.map((text) => h("th", { scope: "col" }, text)))),
    h(
      "tbody",
      {},
      o.spending.map((c) =>
        h(
          "tr",
          {},
          h("th", { scope: "row" }, categoryName(c.category)),
          h("td", {}, formatQAR(c.total, o.locale)),
          h("td", {}, formatPercent(c.share, o.locale)),
        ),
      ),
    ),
  );

  return h("figure", { class: "chart-figure" }, canvas, table);
}
