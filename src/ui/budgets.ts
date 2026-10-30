import { type BudgetLine, budgetTotals, setBudget } from "../lib/budgets";
import { categoriesFor } from "../lib/categories";
import { parseAmount, toDecimal } from "../lib/money";
import type { Budgets } from "../lib/types";
import type { UiContext } from "./context";
import { h, icon } from "./dom";

export interface BudgetPanelOptions {
  ctx: UiContext;
  lines: readonly BudgetLine[];
  budgets: Budgets;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (budgets: Budgets) => void;
}

function statusText(line: BudgetLine, ctx: UiContext): string {
  if (line.state === "over") return ctx.t("overBy", { amount: ctx.money(-line.remaining) });
  if (line.state === "near") {
    return ctx.t("nearLimit", { percent: ctx.percent(line.ratio), amount: ctx.money(line.remaining) });
  }
  return ctx.t("left", { amount: ctx.money(line.remaining) });
}

function budgetRow(line: BudgetLine, ctx: UiContext): HTMLElement {
  const filled = Math.min(line.ratio, 1) * 100;
  return h(
    "li",
    { class: `budget budget-${line.state}` },
    h(
      "div",
      { class: "budget-head" },
      h("span", { class: "budget-name" }, ctx.category(line.category)),
      h(
        "span",
        { class: "budget-amounts" },
        ctx.t("spentOf", { spent: ctx.money(line.spent), limit: ctx.money(line.limit) }),
      ),
    ),
    // The text below says the same thing, so the bar is hidden from screen readers.
    h(
      "div",
      { class: "meter", "aria-hidden": "true" },
      h("div", { class: "meter-fill", style: `inline-size: ${filled.toFixed(1)}%` }),
    ),
    h(
      "p",
      { class: "budget-status" },
      line.state !== "ok" && icon("warning"),
      h("span", {}, statusText(line, ctx)),
    ),
  );
}

function budgetView({ ctx, lines, onEdit }: BudgetPanelOptions): HTMLElement {
  const { t } = ctx;
  if (lines.length === 0) {
    return h(
      "div",
      { class: "budgets" },
      h("p", { class: "empty" }, t("noBudgets")),
      h("button", { type: "button", class: "btn", onclick: onEdit }, t("setBudgets")),
    );
  }

  const over = lines.filter((line) => line.state === "over");
  const names = new Intl.ListFormat(ctx.locale, { type: "conjunction" });
  const totals = budgetTotals(lines);
  return h(
    "div",
    { class: "budgets" },
    over.length > 0 &&
      h(
        "p",
        { class: "budget-warning" },
        icon("warning"),
        h("span", {}, t("overWarning", { names: names.format(over.map((l) => ctx.category(l.category))) })),
      ),
    h("ul", { class: "budget-list" }, lines.map((line) => budgetRow(line, ctx))),
    lines.length > 1 &&
      h(
        "p",
        { class: "budget-total" },
        h("span", {}, t("allBudgets")),
        h("span", {}, t("spentOf", { spent: ctx.money(totals.spent), limit: ctx.money(totals.limit) })),
      ),
    h("button", { type: "button", class: "btn", onclick: onEdit }, t("setBudgets")),
  );
}

function budgetForm({ ctx, budgets, onSave, onCancel }: BudgetPanelOptions): HTMLElement {
  const { t } = ctx;
  const fields = categoriesFor("expense").map((category) => {
    const limit = budgets[category.id];
    return {
      id: category.id,
      input: h("input", {
        name: category.id,
        inputmode: "decimal",
        autocomplete: "off",
        placeholder: t("noLimit"),
        value: limit ? toDecimal(limit) : "",
      }),
    };
  });
  const error = h("p", { class: "form-error", hidden: true });

  function submit(event: Event): void {
    event.preventDefault();
    // Start from the saved budgets so limits for categories this version does not list survive.
    let next = budgets;
    for (const { id, input } of fields) {
      const text = input.value.trim();
      const limit = text === "" ? 0 : parseAmount(text);
      if (limit === null) {
        error.textContent = t("budgetInvalid", { name: ctx.category(id) });
        error.hidden = false;
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      next = setBudget(next, id, limit);
    }
    onSave(next);
  }

  return h(
    "form",
    { class: "budget-form", novalidate: true, onsubmit: submit },
    h("p", { class: "hint" }, t("budgetHint")),
    h(
      "div",
      { class: "budget-inputs" },
      fields.map(({ id, input }) =>
        h("label", { class: "budget-input" }, h("span", {}, ctx.category(id)), input),
      ),
    ),
    error,
    h(
      "div",
      { class: "form-actions" },
      h("button", { type: "submit", class: "btn btn-primary" }, t("saveBudgets")),
      h("button", { type: "button", class: "btn", onclick: onCancel }, t("cancel")),
    ),
  );
}

export function budgetPanel(o: BudgetPanelOptions): HTMLElement {
  return o.editing ? budgetForm(o) : budgetView(o);
}
