import { formatMonth, formatYear, monthAxisLabel } from "../lib/format";
import { REMITTANCE_CATEGORY, type RemittanceYear } from "../lib/remittance";
import { drawOnResize, srTable } from "./chart";
import type { UiContext } from "./context";
import { h, s } from "./dom";

export interface RemittancePanelOptions {
  ctx: UiContext;
  year: RemittanceYear;
  /** The month on screen, which the chart highlights. */
  month: string;
}

const VALUE_BAND = 22;
const PLOT_H = 110;
const AXIS_BAND = 22;
const COLUMN_MAX = 24;
const GAP = 2;

/** A column that is square at the baseline and has a 4px rounded top. */
function columnPath(center: number, width: number, top: number, baseline: number): string {
  const left = center - width / 2;
  const right = center + width / 2;
  const r = Math.min(4, width / 2, baseline - top);
  return (
    `M${left} ${baseline}V${top + r}A${r} ${r} 0 0 1 ${left + r} ${top}` +
    `H${right - r}A${r} ${r} 0 0 1 ${right} ${top + r}V${baseline}Z`
  );
}

/** Month names where twelve of them fit side by side, otherwise month numbers. */
function axisLabels(svg: SVGSVGElement, slot: number, o: RemittancePanelOptions): string[] {
  const { locale } = o.ctx;
  const names = o.year.months.map((m) => monthAxisLabel(m.month, locale, "short"));
  const probes = names.map((name) => s("text", { class: "chart-tick" }, name));
  svg.append(...probes);
  const widest = Math.max(...probes.map((text) => text.getComputedTextLength()));
  for (const probe of probes) probe.remove();
  if (widest <= slot - GAP) return names;
  return o.year.months.map((m) => monthAxisLabel(m.month, locale, "numeric"));
}

function draw(host: HTMLElement, width: number, o: RemittancePanelOptions): void {
  const { ctx, year, month } = o;
  const baseline = VALUE_BAND + PLOT_H;
  const height = baseline + AXIS_BAND;
  // Like the spending chart, the SVG always lays out left to right and is mirrored by hand.
  const svg = s("svg", {
    class: "chart-svg",
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    direction: "ltr",
    "aria-hidden": "true",
  });
  host.replaceChildren(svg);

  const slot = width / 12;
  const column = Math.max(2, Math.min(COLUMN_MAX, slot - GAP));
  const center = (i: number) => (ctx.rtl ? width - (i + 0.5) * slot : (i + 0.5) * slot);
  const labels = axisLabels(svg, slot, o);
  const largest = year.peak?.total || 1;

  year.months.forEach((m, i) => {
    const selected = m.month === month;
    const top = baseline - Math.max(2, (m.total / largest) * PLOT_H);
    svg.append(
      s(
        "g",
        { class: selected ? "chart-month is-selected" : "chart-month" },
        s("title", {}, `${formatMonth(m.month, ctx.locale)}: ${ctx.money(m.total)}`),
        s("rect", { class: "chart-hit", x: center(i) - slot / 2, y: 0, width: slot, height }),
        m.total > 0 && s("path", { class: "chart-column", d: columnPath(center(i), column, top, baseline) }),
        s(
          "text",
          { class: "chart-tick", x: center(i), y: height - 6, "text-anchor": "middle" },
          labels[i],
        ),
      ),
    );
  });

  svg.append(s("line", { class: "chart-axis", x1: 0, x2: width, y1: baseline, y2: baseline }));

  // Only the biggest month is labelled. Moving through the months shows the others in text.
  const peakIndex = year.months.findIndex((m) => m.month === year.peak?.month);
  if (year.peak && peakIndex >= 0) {
    const value = s("text", { class: "chart-value", "text-anchor": "middle" }, ctx.money(year.peak.total));
    svg.append(value);
    const half = value.getComputedTextLength() / 2;
    value.setAttribute("x", String(Math.min(Math.max(center(peakIndex), half), width - half)));
    value.setAttribute("y", String(VALUE_BAND - 7));
  }
}

function monthlyChart(o: RemittancePanelOptions, caption: string): HTMLElement {
  const { ctx, year } = o;
  const canvas = h("div", { class: "chart" });
  drawOnResize(canvas, (width) => draw(canvas, width, o));

  const table = srTable(
    h("caption", {}, caption),
    h(
      "thead",
      {},
      h(
        "tr",
        {},
        h("th", { scope: "col" }, ctx.t("month")),
        h("th", { scope: "col" }, ctx.t("amount")),
      ),
    ),
    h(
      "tbody",
      {},
      year.months.map((m) =>
        h(
          "tr",
          {},
          h("th", { scope: "row" }, formatMonth(m.month, ctx.locale)),
          h("td", {}, ctx.money(m.total)),
        ),
      ),
    ),
  );

  return h("figure", { class: "chart-figure" }, canvas, table);
}

export function remittanceTitle(ctx: UiContext, year: string): string {
  return ctx.t("sentHomeTitle", { year: formatYear(year, ctx.locale) });
}

export function remittancePanel(o: RemittancePanelOptions): HTMLElement {
  const { ctx, year, month } = o;
  const { t } = ctx;

  if (year.count === 0) {
    return h(
      "p",
      { class: "empty" },
      t("noSentHome", {
        year: formatYear(year.year, ctx.locale),
        category: ctx.category(REMITTANCE_CATEGORY),
      }),
    );
  }

  const selected = year.months.find((m) => m.month === month);
  return h(
    "div",
    { class: "remittance" },
    h(
      "div",
      { class: "remittance-total" },
      h("span", { class: "remittance-value" }, ctx.money(year.total)),
      h("span", { class: "card-note" }, t("sentHomeCount", { count: ctx.count(year.count) })),
      year.shareOfIncome !== null &&
        h("span", { class: "card-note" }, t("sentHomeShare", { percent: ctx.percent(year.shareOfIncome) })),
    ),
    monthlyChart(o, remittanceTitle(ctx, year.year)),
    selected &&
      h(
        "p",
        { class: "remittance-month" },
        t("sentHomeMonth", {
          month: formatMonth(selected.month, ctx.locale),
          amount: ctx.money(selected.total),
        }),
      ),
  );
}
