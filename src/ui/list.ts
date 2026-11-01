import { parseLocalDate } from "../lib/dates";
import { formatSigned } from "../lib/money";
import type { Transaction } from "../lib/types";
import type { UiContext } from "./context";
import { h, icon } from "./dom";

export interface ListOptions {
  ctx: UiContext;
  /** Already filtered and sorted newest first. */
  transactions: readonly Transaction[];
  editingId: string | null;
  emptyText: string;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

function entryRow(tx: Transaction, o: ListOptions): HTMLElement {
  const { t } = o.ctx;
  const name = o.ctx.category(tx.category);
  const signed = formatSigned(tx.kind === "income" ? tx.amount : -tx.amount, o.ctx.locale);
  const label = `${name}, ${signed}`;
  return h(
    "li",
    { class: tx.id === o.editingId ? "entry is-editing" : "entry", "data-id": tx.id },
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
          title: t("edit"),
          "aria-label": t("editLabel", { name: label }),
          onclick: () => o.onEdit(tx.id),
        },
        icon("edit"),
      ),
      h(
        "button",
        {
          type: "button",
          class: "icon-btn danger",
          title: t("delete"),
          "aria-label": t("deleteLabel", { name: label }),
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

  const dayFormat = new Intl.DateTimeFormat(o.ctx.locale, {
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
