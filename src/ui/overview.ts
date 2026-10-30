import { formatMonth, formatPercent } from "../lib/format";
import type { Translate } from "../lib/i18n";
import { formatQAR } from "../lib/money";
import { type MonthSummary, percentChange, savingsRate } from "../lib/summary";
import { h, icon } from "./dom";

export interface MonthNavOptions {
  t: Translate;
  locale: string;
  month: string;
  isCurrentMonth: boolean;
  onShift: (delta: number) => void;
  onCurrent: () => void;
}

export function monthNav(o: MonthNavOptions): HTMLElement {
  return h(
    "nav",
    { class: "month-nav", "aria-label": o.t("month") },
    h(
      "button",
      {
        type: "button",
        class: "icon-btn",
        title: o.t("previousMonth"),
        "aria-label": o.t("previousMonth"),
        onclick: () => o.onShift(-1),
      },
      icon("back"),
    ),
    h("h2", { class: "month-label", "aria-live": "polite" }, formatMonth(o.month, o.locale)),
    h(
      "button",
      {
        type: "button",
        class: "icon-btn",
        title: o.t("nextMonth"),
        "aria-label": o.t("nextMonth"),
        onclick: () => o.onShift(1),
      },
      icon("forward"),
    ),
    !o.isCurrentMonth &&
      h("button", { type: "button", class: "btn btn-small", onclick: o.onCurrent }, o.t("thisMonth")),
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
  t: Translate;
  locale: string;
  summary: MonthSummary;
  previous: MonthSummary;
}

export function summaryCards({ t, locale, summary, previous }: CardsOptions): HTMLElement {
  const previousName = formatMonth(previous.month, locale, false);
  const change = percentChange(summary.expense, previous.expense);
  let spendingNote: string | null = null;
  if (change !== null && summary.expense > 0) {
    spendingNote =
      Math.abs(change) < 0.005
        ? t("sameAs", { month: previousName })
        : t(change > 0 ? "moreThan" : "lessThan", {
            percent: formatPercent(Math.abs(change), locale),
            month: previousName,
          });
  }

  const rate = savingsRate(summary);
  let balanceNote: string | null = null;
  if (rate !== null) {
    balanceNote = rate < 0 ? t("overspent") : t("kept", { percent: formatPercent(rate, locale) });
  }

  return h(
    "section",
    { class: "cards", "aria-label": t("summary") },
    card(
      t("balance"),
      formatQAR(summary.balance, locale),
      balanceNote,
      summary.balance < 0 ? "card-balance negative" : "card-balance",
    ),
    card(t("incomeTotal"), formatQAR(summary.income, locale), null, "card-income"),
    card(t("expenseTotal"), formatQAR(summary.expense, locale), spendingNote, "card-expense"),
  );
}
