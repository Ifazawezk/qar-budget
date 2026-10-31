import { isValidDate } from "../lib/dates";
import { formatDay, formatWeekday } from "../lib/format";
import { formatSigned, parseAmount, toDecimal } from "../lib/money";
import {
  anchorDay,
  FREQUENCIES,
  isAllowedStart,
  type RuleInput,
  sortRules,
  upcomingDate,
} from "../lib/recurring";
import type { Frequency, Kind, RecurringRule } from "../lib/types";
import type { UiContext } from "./context";
import { h, icon } from "./dom";
import { field, fillCategories, kindToggle, segmented } from "./form";

export interface RecurringPanelOptions {
  ctx: UiContext;
  rules: readonly RecurringRule[];
  today: string;
  /** The rule being edited, "new" while adding one, or null when only the list shows. */
  editing: RecurringRule | "new" | null;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onCancel: () => void;
  onSave: (input: RuleInput) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function scheduleText(rule: RecurringRule, next: string, ctx: UiContext): string {
  return rule.frequency === "monthly"
    ? ctx.t("scheduleMonthly", { day: ctx.count(anchorDay(rule)) })
    : ctx.t("scheduleWeekly", { weekday: formatWeekday(next, ctx.locale) });
}

function ruleRow(rule: RecurringRule, o: RecurringPanelOptions): HTMLElement {
  const { ctx } = o;
  const { t } = ctx;
  const name = ctx.category(rule.category);
  const signed = formatSigned(rule.kind === "income" ? rule.amount : -rule.amount, ctx.locale);
  const label = `${name}, ${signed}`;
  const next = upcomingDate(rule, o.today);
  const schedule = scheduleText(rule, next, ctx);
  const toggleLabel = t(rule.paused ? "resumeLabel" : "pauseLabel", { name: label });
  return h(
    "li",
    { class: rule.paused ? "entry rule is-paused" : "entry rule" },
    h(
      "div",
      { class: "entry-text" },
      h("span", { class: "entry-category" }, name),
      rule.note && h("span", { class: "entry-note", dir: "auto" }, rule.note),
    ),
    h("span", { class: `entry-amount ${rule.kind}` }, signed),
    h(
      "p",
      { class: "rule-schedule" },
      rule.paused
        ? t("schedulePaused", { schedule })
        : t("scheduleNext", { schedule, date: formatDay(next, ctx.locale, o.today) }),
    ),
    h(
      "div",
      { class: "entry-actions" },
      h(
        "button",
        {
          type: "button",
          class: "icon-btn",
          title: t(rule.paused ? "resume" : "pause"),
          "aria-label": toggleLabel,
          onclick: () => o.onToggle(rule.id),
        },
        icon(rule.paused ? "play" : "pause"),
      ),
      h(
        "button",
        {
          type: "button",
          class: "icon-btn",
          title: t("edit"),
          "aria-label": t("editLabel", { name: label }),
          onclick: () => o.onEdit(rule.id),
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
          onclick: () => o.onDelete(rule.id),
        },
        icon("trash"),
      ),
    ),
  );
}

function ruleList(o: RecurringPanelOptions): HTMLElement {
  const { t } = o.ctx;
  return h(
    "div",
    { class: "recurring" },
    o.rules.length === 0
      ? h("p", { class: "empty" }, t("noRules"))
      : h(
          "ul",
          { class: "entry-list" },
          sortRules(o.rules).map((rule) => ruleRow(rule, o)),
        ),
    h("button", { type: "button", class: "btn", onclick: o.onAdd }, t("addRule")),
  );
}

function ruleForm(o: RecurringPanelOptions): HTMLElement {
  const { ctx, today, onSave, onCancel } = o;
  const { t } = ctx;
  const rule = o.editing === "new" ? null : o.editing;
  const initialDate = rule ? upcomingDate(rule, today) : today;
  let kind: Kind = rule?.kind ?? "expense";
  let frequency: Frequency = rule?.frequency ?? "monthly";

  const amount = h("input", {
    name: "amount",
    inputmode: "decimal",
    autocomplete: "off",
    placeholder: "0.00",
    required: true,
    "aria-describedby": "rule-error",
    value: rule ? toDecimal(rule.amount) : "",
  });
  const date = h("input", {
    name: "date",
    type: "date",
    required: true,
    "aria-describedby": "rule-error rule-hint",
    value: initialDate,
  });
  const category = h("select", { name: "category" });
  fillCategories(category, ctx, kind, rule?.category);
  const note = h("input", {
    name: "note",
    maxlength: 200,
    autocomplete: "off",
    dir: "auto",
    placeholder: t("rulePlaceholder"),
    value: rule?.note ?? "",
  });
  const error = h("p", { class: "form-error", id: "rule-error", hidden: true });

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
    // A date left as it was is always fine, however long a rule has been waiting.
    if (date.value !== initialDate && !isAllowedStart(date.value, today)) {
      return showError(t("ruleDateTooOld"), date);
    }
    onSave({
      kind,
      amount: value,
      category: category.value,
      note: note.value.trim(),
      frequency,
      date: date.value,
    });
  }

  const frequencies = FREQUENCIES.map((f) => ({ value: f, label: t(f) }));

  return h(
    "form",
    {
      class: "entry-form rule-form",
      novalidate: true,
      onsubmit: submit,
      onkeydown: (event) => {
        if ((event as KeyboardEvent).key === "Escape") onCancel();
      },
    },
    kindToggle(ctx, kind, (next) => {
      kind = next;
      fillCategories(category, ctx, kind);
    }),
    h(
      "div",
      { class: "field-row" },
      field(t("amount"), amount),
      field(rule ? t("nextDate") : t("firstDate"), date),
    ),
    field(t("category"), category),
    field(t("note"), note),
    segmented(t("frequency"), "frequency", frequencies, frequency, (next) => {
      frequency = next;
    }),
    h("p", { class: "hint", id: "rule-hint" }, t("ruleHint")),
    error,
    h(
      "div",
      { class: "form-actions" },
      h("button", { type: "submit", class: "btn btn-primary" }, rule ? t("saveChanges") : t("add")),
      h("button", { type: "button", class: "btn", onclick: onCancel }, t("cancel")),
    ),
  );
}

export function recurringPanel(o: RecurringPanelOptions): HTMLElement {
  return o.editing ? ruleForm(o) : ruleList(o);
}
