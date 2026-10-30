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

function field(label: string, control: HTMLElement): HTMLElement {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, label), control);
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

  function fillCategories(selected?: string): void {
    const options = categoriesFor(kind).map((c) => ({ id: c.id, label: ctx.category(c.id) }));
    // An imported entry may use a category this version does not know. Keep it selectable.
    if (selected && !options.some((o) => o.id === selected)) {
      options.push({ id: selected, label: selected });
    }
    category.replaceChildren(
      ...options.map((o) => h("option", { value: o.id, selected: o.id === selected }, o.label)),
    );
  }
  fillCategories(editing?.category);

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

  const kindToggle = h(
    "fieldset",
    { class: "segmented" },
    h("legend", { class: "sr-only" }, t("kind")),
    (["expense", "income"] as const).map((k) =>
      h(
        "label",
        { class: `segment segment-${k}` },
        h("input", {
          type: "radio",
          name: "kind",
          value: k,
          checked: k === kind,
          onchange: () => {
            kind = k;
            fillCategories();
          },
        }),
        h("span", {}, t(k)),
      ),
    ),
  );

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
    kindToggle,
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
