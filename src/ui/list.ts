import { categoryName } from "../lib/categories";
import { parseLocalDate } from "../lib/dates";
import type { Translate } from "../lib/i18n";
import { formatSigned } from "../lib/money";
import type { Transaction } from "../lib/types";
import { h, icon } from "./dom";

export interface ListOptions {
  t: Translate;
  locale: string;
  /** Already filtered and sorted newest first. */
  transactions: readonly Transaction[];
  editingId: string | null;
  emptyText: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function entryRow(tx: Transaction, o: ListOptions): HTMLElement {
  const name = categoryName(tx.category);
  const signed = formatSigned(tx.kind === "income" ? tx.amount : -tx.amount, o.locale);
  const label = `${name}, ${signed}`;
  return h(
    "li",
    { class: tx.id === o.editingId ? "entry is-editing" : "entry" },
    h(
      "div",
      { class: "entry-text" },
      h("span", { class: "entry-category" }, name),
      tx.note && h("span", { class: "entry-note", dir: "auto" }, tx.note),
    ),
    h("span", { class: `entry-amount ${tx.kind}` }, signed),
    h(
      "div",
      { class: "entry-actions" },
      h(
        "button",
        {
          type: "button",
          class: "icon-btn",
          title: o.t("edit"),
          "aria-label": o.t("editLabel", { name: label }),
          onclick: () => o.onEdit(tx.id),
        },
        icon("edit"),
      ),
      h(
        "button",
        {
          type: "button",
          class: "icon-btn danger",
          title: o.t("delete"),
          "aria-label": o.t("deleteLabel", { name: label }),
          onclick: () => o.onDelete(tx.id),
        },
        icon("trash"),
      ),
    ),
  );
}

export function entryList(o: ListOptions): HTMLElement {
  if (o.transactions.length === 0) return h("p", { class: "empty" }, o.emptyText);

  const groups: { date: string; items: Transaction[] }[] = [];
  for (const tx of o.transactions) {
    const last = groups.at(-1);
    if (last && last.date === tx.date) last.items.push(tx);
    else groups.push({ date: tx.date, items: [tx] });
  }

  const dayFormat = new Intl.DateTimeFormat(o.locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return h(
    "div",
    { class: "entries" },
    groups.map((group) =>
      h(
        "section",
        { class: "day" },
        h(
          "h3",
          { class: "day-title" },
          h("time", { datetime: group.date }, dayFormat.format(parseLocalDate(group.date))),
        ),
        h("ul", { class: "entry-list" }, group.items.map((tx) => entryRow(tx, o))),
      ),
    ),
  );
}
