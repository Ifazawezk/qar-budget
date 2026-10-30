import { formatMonth } from "../lib/format";
import { type MonthSummary, percentChange, savingsRate } from "../lib/summary";
import type { UiContext } from "./context";
import { h, icon } from "./dom";

export interface MonthNavOptions {
  ctx: UiContext;
  month: string;
  isCurrentMonth: boolean;
  onShift: (delta: number) => void;
  onCurrent: () => void;
}

export function monthNav({ ctx, month, isCurrentMonth, onShift, onCurrent }: MonthNavOptions): HTMLElement {
  const { t } = ctx;
  return h(
    "nav",
    { class: "month-nav", "aria-label": t("month") },
    h(
      "button",
      {
        type: "button",
        class: "icon-btn",
        title: t("previousMonth"),
        "aria-label": t("previousMonth"),
        onclick: () => onShift(-1),
      },
      icon("back"),
    ),
    h("h2", { class: "month-label", "aria-live": "polite" }, formatMonth(month, ctx.locale)),
    h(
      "button",
      {
        type: "button",
        class: "icon-btn",
        title: t("nextMonth"),
        "aria-label": t("nextMonth"),
        onclick: () => onShift(1),
      },
      icon("forward"),
    ),
    !isCurrentMonth &&
      h("button", { type: "button", class: "btn btn-small", onclick: onCurrent }, t("thisMonth")),
  );
}

function card(label: string, value: string, note: string | null, className: string): HTMLElement {
  return h(
    "div",
    { class: `card ${className}` },
    h("span", { class: "card-label" }, label),
    h("span", { class: "card-value" }, value),
    note && h("span", { class: "card-note" }, note),
  );
}

export interface CardsOptions {
  ctx: UiContext;
  summary: MonthSummary;
  previous: MonthSummary;
}

export function summaryCards({ ctx, summary, previous }: CardsOptions): HTMLElement {
  const { t } = ctx;
  const previousName = formatMonth(previous.month, ctx.locale, false);
  const change = percentChange(summary.expense, previous.expense);
  let spendingNote: string | null = null;
  if (change !== null && summary.expense > 0) {
    spendingNote =
      Math.abs(change) < 0.005
        ? t("sameAs", { month: previousName })
        : t(change > 0 ? "moreThan" : "lessThan", {
            percent: ctx.percent(Math.abs(change)),
            month: previousName,
          });
  }

  const rate = savingsRate(summary);
  let balanceNote: string | null = null;
  if (rate !== null) {
    balanceNote = rate < 0 ? t("overspent") : t("kept", { percent: ctx.percent(rate) });
  }

  return h(
    "section",
    { class: "cards", "aria-label": t("summary") },
    card(
      t("balance"),
      ctx.money(summary.balance),
      balanceNote,
      summary.balance < 0 ? "card-balance negative" : "card-balance",
    ),
    card(t("incomeTotal"), ctx.money(summary.income), null, "card-income"),
    card(t("expenseTotal"), ctx.money(summary.expense), spendingNote, "card-expense"),
  );
}
