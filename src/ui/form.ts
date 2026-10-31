import { categoriesFor } from "../lib/categories";
import { isValidDate } from "../lib/dates";
import { parseAmount, toDecimal } from "../lib/money";
import type { Kind, Transaction } from "../lib/types";
import type { UiContext } from "./context";
import { h } from "./dom";

export type EntryInput = Omit<Transaction, "id">;

export interface FormOptions {
  ctx: UiContext;
  editing: Transaction | null;
  defaultDate: string;
  onSubmit: (entry: EntryInput) => void;
  onCancel: () => void;
}

export function field(label: string, control: HTMLElement): HTMLElement {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), control);
}

/** Fill a category list for one kind. A category this version does not know stays selectable. */
export function fillCategories(
  select: HTMLSelectElement,
  ctx: UiContext,
  kind: Kind,
  selected?: string,
): void {
  const options = categoriesFor(kind).map((c) => ({ id: c.id, label: ctx.category(c.id) }));
  if (selected && !options.some((o) => o.id === selected)) {
    options.push({ id: selected, label: selected });
  }
  select.replaceChildren(
    ...options.map((o) => h("option", { value: o.id, selected: o.id === selected }, o.label)),
  );
}

export function segmented<T extends string>(
  legend: string,
  name: string,
  options: readonly { value: T; label: string; class?: string }[],
  current: T,
  onChange: (value: T) => void,
): HTMLElement {
  return h(
    "fieldset",
    { class: "segmented" },
    h("legend", { class: "sr-only" }, legend),
    options.map((option) =>
      h(
        "label",
        { class: `segment ${option.class ?? ""}` },
        h("input", {
          type: "radio",
          name,
          value: option.value,
          checked: option.value === current,
          onchange: () => onChange(option.value),
        }),
        h("span", {}, option.label),
      ),
    ),
  );
}

export function kindToggle(ctx: UiContext, current: Kind, onChange: (kind: Kind) => void): HTMLElement {
  const kinds = (["expense", "income"] as const).map((k) => ({
    value: k,
    label: ctx.t(k),
    class: `segment-${k}`,
  }));
  return segmented(ctx.t("kind"), "kind", kinds, current, onChange);
}

export function entryForm({ ctx, editing, defaultDate, onSubmit, onCancel }: FormOptions): HTMLElement {
  const { t } = ctx;
  let kind: Kind = editing?.kind ?? "expense";

  const amount = h("input", {
    name: "amount",
    inputmode: "decimal",
    autocomplete: "off",
    placeholder: "0.00",
    required: true,
    "aria-describedby": "entry-error",
    value: editing ? toDecimal(editing.amount) : "",
  });
  const date = h("input", {
    name: "date",
    type: "date",
    required: true,
    "aria-describedby": "entry-error",
    value: editing?.date ?? defaultDate,
  });
  const category = h("select", { name: "category" });
  const note = h("input", {
    name: "note",
    maxlength: 200,
    autocomplete: "off",
    dir: "auto",
    placeholder: t("notePlaceholder"),
    value: editing?.note ?? "",
  });
  const error = h("p", { class: "form-error", id: "entry-error", hidden: true });

  fillCategories(category, ctx, kind, editing?.category);

  function showError(message: string, input: HTMLInputElement): void {
    error.textContent = message;
    error.hidden = false;
    input.setAttribute("aria-invalid", "true");
    input.focus();
  }

  function clearError(event: Event): void {
    (event.target as HTMLElement).removeAttribute("aria-invalid");
    error.hidden = true;
  }
  amount.addEventListener("input", clearError);
  date.addEventListener("input", clearError);

  function submit(event: Event): void {
    event.preventDefault();
    const value = parseAmount(amount.value);
    if (value === null || value <= 0) return showError(t("amountInvalid"), amount);
    if (!isValidDate(date.value)) return showError(t("dateInvalid"), date);
    onSubmit({
      kind,
      amount: value,
      category: category.value,
      date: date.value,
      note: note.value.trim(),
    });
  }

  const kinds = kindToggle(ctx, kind, (next) => {
    kind = next;
    fillCategories(category, ctx, kind);
  });

  return h(
    "form",
    {
      class: "entry-form",
      novalidate: true,
      onsubmit: submit,
      onkeydown: (event) => {
        if (editing && (event as KeyboardEvent).key === "Escape") onCancel();
      },
    },
    kinds,
    h("div", { class: "field-row" }, field(t("amount"), amount), field(t("date"), date)),
    field(t("category"), category),
    field(t("note"), note),
    error,
    h(
      "div",
      { class: "form-actions" },
      h("button", { type: "submit", class: "btn btn-primary" }, editing ? t("saveChanges") : t("add")),
      editing && h("button", { type: "button", class: "btn", onclick: onCancel }, t("cancel")),
    ),
  );
}
