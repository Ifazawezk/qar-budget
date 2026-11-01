import { budgetLines } from "../lib/budgets";
import { currentMonth, monthOf, shiftMonth, today } from "../lib/dates";
import { exportCSV, exportFileName, exportJSON, importFile } from "../lib/files";
import { formatDay, formatMonth } from "../lib/format";
import { type Lang, manifestFile } from "../lib/i18n";
import { applyRuleEdit, createRule, postDue, resumeRule, type RuleInput } from "../lib/recurring";
import { remittanceYear } from "../lib/remittance";
import {
  type KeyValueStore,
  load,
  loadSettings,
  save,
  saveSettings,
  type Settings,
} from "../lib/storage";
import { inMonth, summarize } from "../lib/summary";
import { newId, remove, restore, sortNewestFirst, upsert } from "../lib/transactions";
import type { AppData, Budgets } from "../lib/types";
import { budgetPanel } from "./budgets";
import { spendingChart } from "./chart";
import { type UiContext, uiContext } from "./context";
import { dataPanel, download, type ImportReport } from "./data";
import { h, icon } from "./dom";
import { type EntryInput, entryForm } from "./form";
import { entryList } from "./list";
import { monthNav, summaryCards } from "./overview";
import { recurringPanel } from "./recurring";
import { remittancePanel, remittanceTitle } from "./remittance";

interface Notice {
  tone: "info" | "error";
  text: string;
  action?: { label: string; run: () => void };
  /** Stays until dismissed, like an error. */
  sticky?: boolean;
}

export interface App {
  /** Tell the user a new version has arrived and let them reload when they are ready. */
  offerReload: () => void;
}

function panel(title: string, body: Node, className: string): HTMLElement {
  return h("section", { class: `panel ${className}` }, h("h2", { class: "panel-title" }, title), body);
}

export function startApp(root: HTMLElement, store: KeyValueStore, browserLang: Lang): App {
  const loaded = load(store);
  let data: AppData = loaded.data;
  let settings: Settings = loadSettings(store, browserLang);
  let ctx: UiContext = uiContext(settings.lang);
  let month = currentMonth();
  let editingId: string | null = null;
  let editingBudgets = false;
  let editingRule: string | "new" | null = null;
  let report: ImportReport | null = null;
  let lastRecurringRun = today();

  const touchQuery = window.matchMedia("(pointer: coarse)");
  const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
  darkQuery.addEventListener("change", () => {
    if (settings.theme === "auto") render();
  });

  // Notices live outside the main tree so re-rendering never cuts one off,
  // and the live region exists before its text changes so screen readers announce it.
  const toastHost = h("div", { class: "toast-host", "aria-live": "polite" });
  document.body.append(toastHost);
  let notice: Notice | null = null;
  let toastTimer = 0;

  function showNotice(next: Notice | null): void {
    notice = next;
    window.clearTimeout(toastTimer);
    if (next?.tone === "info" && !next.sticky) {
      toastTimer = window.setTimeout(() => showNotice(null), next.action ? 8000 : 5000);
    }
    toastHost.replaceChildren(
      notice
        ? h(
            "div",
            { class: `toast toast-${notice.tone}` },
            h("span", { class: "toast-text" }, notice.text),
            notice.action &&
              h("button", { type: "button", class: "toast-action", onclick: notice.action.run }, notice.action.label),
            h(
              "button",
              { type: "button", class: "icon-btn", "aria-label": ctx.t("dismiss"), onclick: () => showNotice(null) },
              icon("close"),
            ),
          )
        : "",
    );
  }

  /** Save and report problems. Returns false when the browser refused to store the data. */
  function commit(next: AppData): boolean {
    data = next;
    try {
      save(store, data);
      return true;
    } catch {
      showNotice({ tone: "error", text: ctx.t("saveFailed") });
      return false;
    }
  }

  /** Add the entries that have fallen due. Returns how many were added and saved. */
  function runRecurring(): number {
    lastRecurringRun = today();
    const result = postDue(data.transactions, data.recurring, lastRecurringRun);
    if (!result.changed) return 0;
    const { transactions, recurring } = result;
    return commit({ ...data, transactions, recurring }) ? result.posted : 0;
  }

  /** `text` followed by a count of any recurring entries that were just added. */
  function withPosted(text: string, posted: number): string {
    return posted > 0 ? `${text} ${ctx.t("posted", { count: ctx.count(posted) })}` : text;
  }

  /**
   * Bring a panel into view with its heading at the top, then put the cursor in `field`.
   * Letting the browser scroll to the field instead can leave the heading off the screen.
   */
  function reveal(panelClass: string, field?: HTMLElement | null): void {
    const panel = root.querySelector<HTMLElement>(panelClass);
    const box = panel?.getBoundingClientRect();
    if (box && (box.top < 0 || box.bottom > window.innerHeight)) {
      panel?.scrollIntoView({ block: "start" });
    }
    field?.focus({ preventScroll: true });
  }

  function amountField(): HTMLInputElement | null {
    return root.querySelector<HTMLInputElement>('.panel-form input[name="amount"]');
  }

  /** Go back to the row that was being edited, which can be a long way below the form. */
  function returnToRow(id: string): void {
    const rows = root.querySelectorAll<HTMLElement>(".panel-list .entry");
    const row = [...rows].find((element) => element.dataset.id === id);
    row?.scrollIntoView({ block: "center" });
    row?.querySelector("button")?.focus({ preventScroll: true });
  }

  function submitEntry(entry: EntryInput): void {
    const wasEditing = editingId !== null;
    const tx = { id: editingId ?? newId(), ...entry };
    editingId = null;
    // Show the month the entry landed in, so it never seems to disappear.
    month = monthOf(tx.date);
    const saved = commit({ ...data, transactions: upsert(data.transactions, tx) });
    if (!wasEditing) {
      settings = {
        ...settings,
        lastCategory: { ...settings.lastCategory, [tx.kind]: tx.category },
      };
      storeSettings();
    }
    render();
    if (saved) showNotice({ tone: "info", text: ctx.t(wasEditing ? "updated" : "added") });
    if (wasEditing) returnToRow(tx.id);
    // On a phone this would bring the keyboard back over the confirmation.
    else if (!touchQuery.matches) amountField()?.focus();
  }

  function startEdit(id: string): void {
    editingId = id;
    render();
    reveal(".panel-form", amountField());
  }

  function cancelEdit(): void {
    const id = editingId;
    editingId = null;
    render();
    if (id) returnToRow(id);
  }

  function deleteEntry(id: string): void {
    const index = data.transactions.findIndex((tx) => tx.id === id);
    const tx = data.transactions[index];
    if (!tx) return;
    if (editingId === id) editingId = null;
    const saved = commit({ ...data, transactions: remove(data.transactions, id) });
    render();
    if (!saved) return;
    showNotice({
      tone: "info",
      text: ctx.t("deleted"),
      action: {
        label: ctx.t("undo"),
        run: () => {
          if (commit({ ...data, transactions: restore(data.transactions, tx, index) })) showNotice(null);
          render();
        },
      },
    });
  }

  function saveBudgets(budgets: Budgets): void {
    editingBudgets = false;
    const saved = commit({ ...data, budgets });
    render();
    reveal(".panel-budgets");
    if (saved) showNotice({ tone: "info", text: ctx.t("budgetsSaved") });
  }

  function openRuleForm(next: string | "new"): void {
    editingRule = next;
    render();
    reveal(".panel-recurring", root.querySelector<HTMLElement>(".rule-form input[name='amount']"));
  }

  function closeRuleForm(): void {
    editingRule = null;
    render();
    reveal(".panel-recurring");
  }

  function saveRule(input: RuleInput): void {
    const existing = data.recurring.find((rule) => rule.id === editingRule);
    const rule = existing ? applyRuleEdit(existing, input, today()) : createRule(newId(), input);
    editingRule = null;
    const saved = commit({ ...data, recurring: upsert(data.recurring, rule) });
    const posted = saved ? runRecurring() : 0;
    render();
    reveal(".panel-recurring");
    if (saved) showNotice({ tone: "info", text: withPosted(ctx.t("ruleSaved"), posted) });
  }

  function toggleRule(id: string): void {
    const rule = data.recurring.find((r) => r.id === id);
    if (!rule) return;
    const now = today();
    const next = rule.paused ? resumeRule(rule, now) : { ...rule, paused: true };
    const saved = commit({ ...data, recurring: upsert(data.recurring, next) });
    const posted = saved ? runRecurring() : 0;
    render();
    if (!saved) return;
    const text = next.paused
      ? ctx.t("rulePaused")
      : ctx.t("ruleResumed", { date: formatDay(next.nextDue, ctx.locale, now) });
    showNotice({ tone: "info", text: withPosted(text, posted) });
  }

  function deleteRule(id: string): void {
    const index = data.recurring.findIndex((rule) => rule.id === id);
    const rule = data.recurring[index];
    if (!rule) return;
    const saved = commit({ ...data, recurring: remove(data.recurring, id) });
    render();
    if (!saved) return;
    showNotice({
      tone: "info",
      text: ctx.t("ruleDeleted"),
      action: {
        label: ctx.t("undo"),
        run: () => {
          if (commit({ ...data, recurring: restore(data.recurring, rule, index) })) showNotice(null);
          render();
        },
      },
    });
  }

  function exportData(format: "json" | "csv"): void {
    if (format === "json") {
      download(exportFileName("json"), exportJSON(data), "application/json");
    } else {
      download(exportFileName("csv"), exportCSV(data), "text/csv;charset=utf-8");
    }
  }

  async function importData(file: File): Promise<void> {
    try {
      const result = importFile(data, file.name, await file.text(), newId);
      report = { fileName: file.name, issues: result.issues };
      const saved = commit(result.data);
      // A restored backup can bring rules with dates that have passed since it was made.
      const posted = saved ? runRecurring() : 0;
      render();
      if (saved) {
        const text = ctx.t("importDone", {
          added: ctx.count(result.added),
          updated: ctx.count(result.updated),
          skipped: ctx.count(result.skipped),
        });
        showNotice({ tone: "info", text: withPosted(text, posted) });
      }
    } catch (error) {
      report = null;
      render();
      const detail = error instanceof Error ? error.message : String(error);
      showNotice({ tone: "error", text: ctx.t("importFailed", { file: file.name, detail }) });
    }
  }

  function showMonth(next: string): void {
    month = next;
    editingId = null;
    render();
  }

  /** Today when looking at the current month, otherwise the first day of the month on screen. */
  function defaultDate(): string {
    const now = today();
    return monthOf(now) === month ? now : `${month}-01`;
  }

  function isDark(): boolean {
    return settings.theme === "dark" || (settings.theme === "auto" && darkQuery.matches);
  }

  function storeSettings(): void {
    try {
      saveSettings(store, settings);
    } catch {
      // Preferences are a convenience; the page still works without saving them.
    }
  }

  function updateSettings(next: Settings): void {
    settings = next;
    ctx = uiContext(settings.lang);
    storeSettings();
    render();
  }

  function toggleLang(): void {
    // A notice in the old language would look out of place.
    showNotice(null);
    updateSettings({ ...settings, lang: settings.lang === "ar" ? "en" : "ar" });
  }

  // A phone keeps an installed app alive for days, so coming back to it has to count as
  // opening it. Reading from storage first keeps a second tab from saving over this one.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || today() === lastRecurringRun) return;
    const fresh = load(store);
    if (fresh.problem) return;
    if (month === monthOf(lastRecurringRun)) month = currentMonth();
    data = fresh.data;
    const posted = runRecurring();
    render();
    if (posted > 0) {
      showNotice({ tone: "info", text: ctx.t("posted", { count: ctx.count(posted) }) });
    }
  });

  function render(): void {
    const { t } = ctx;
    const html = document.documentElement;
    html.lang = ctx.lang;
    html.dir = ctx.rtl ? "rtl" : "ltr";
    if (settings.theme === "auto") html.removeAttribute("data-theme");
    else html.dataset.theme = settings.theme;
    document.title = t("appTitle");
    const manifest = `${import.meta.env.BASE_URL}${manifestFile(ctx.lang)}`;
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink?.getAttribute("href") !== manifest) manifestLink?.setAttribute("href", manifest);

    const editing = data.transactions.find((tx) => tx.id === editingId) ?? null;
    const themeLabel = isDark() ? t("themeToLight") : t("themeToDark");
    const summary = summarize(data.transactions, month);
    const previous = summarize(data.transactions, shiftMonth(month, -1));
    const monthName = formatMonth(month, ctx.locale);
    const ruleBeingEdited = data.recurring.find((rule) => rule.id === editingRule) ?? null;
    const sentHome = remittanceYear(data.transactions, month.slice(0, 4));

    root.replaceChildren(
      h(
        "header",
        { class: "topbar" },
        h(
          "div",
          { class: "brand" },
          h("span", { class: "brand-mark", "aria-hidden": "true" }, "ر.ق"),
          h("h1", {}, t("appTitle")),
        ),
        h(
          "div",
          { class: "toolbar" },
          h(
            "button",
            {
              type: "button",
              class: "btn btn-small lang-btn",
              lang: ctx.lang === "ar" ? "en" : "ar",
              "aria-label": t("switchLangLabel"),
              onclick: toggleLang,
            },
            t("switchLang"),
          ),
          h(
            "button",
            {
              type: "button",
              class: "icon-btn",
              title: themeLabel,
              "aria-label": themeLabel,
              onclick: () => updateSettings({ ...settings, theme: isDark() ? "light" : "dark" }),
            },
            icon(isDark() ? "sun" : "moon"),
          ),
        ),
      ),
      h(
        "main",
        { class: "layout" },
        monthNav({
          ctx,
          month,
          isCurrentMonth: month === currentMonth(),
          onShift: (delta) => showMonth(shiftMonth(month, delta)),
          onCurrent: () => showMonth(currentMonth()),
        }),
        summaryCards({ ctx, summary, previous }),
        h(
          "div",
          { class: "columns" },
          h(
            "div",
            { class: "column" },
            panel(
              editing ? t("editEntry") : t("addEntry"),
              entryForm({
                ctx,
                editing,
                defaultDate: defaultDate(),
                lastCategory: settings.lastCategory,
                onSubmit: submitEntry,
                onCancel: cancelEdit,
              }),
              "panel-form",
            ),
            panel(
              t("entries"),
              entryList({
                ctx,
                transactions: sortNewestFirst(inMonth(data.transactions, month)),
                editingId,
                emptyText:
                  data.transactions.length === 0
                    ? t("noEntries")
                    : t("noEntriesMonth", { month: monthName }),
                onEdit: startEdit,
                onDelete: deleteEntry,
              }),
              "panel-list",
            ),
          ),
          h(
            "div",
            { class: "column" },
            panel(
              t("spending"),
              summary.spending.length > 0
                ? spendingChart({
                    ctx,
                    spending: summary.spending,
                    caption: `${t("spending")}, ${monthName}`,
                    headers: [t("category"), t("amount"), t("share")],
                  })
                : h("p", { class: "empty" }, t("noSpending", { month: monthName })),
              "panel-chart",
            ),
            panel(
              t("budgets"),
              budgetPanel({
                ctx,
                lines: budgetLines(data.budgets, summary),
                budgets: data.budgets,
                editing: editingBudgets,
                onEdit: () => {
                  editingBudgets = true;
                  render();
                  reveal(".panel-budgets", root.querySelector<HTMLElement>(".budget-form input"));
                },
                onCancel: () => {
                  editingBudgets = false;
                  render();
                  reveal(".panel-budgets");
                },
                onSave: saveBudgets,
              }),
              "panel-budgets",
            ),
            panel(
              remittanceTitle(ctx, sentHome.year),
              remittancePanel({ ctx, year: sentHome, month }),
              "panel-remittance",
            ),
            panel(
              editingRule === null
                ? t("recurring")
                : t(editingRule === "new" ? "addRule" : "editRule"),
              recurringPanel({
                ctx,
                rules: data.recurring,
                today: today(),
                editing: editingRule === "new" ? "new" : ruleBeingEdited,
                onAdd: () => openRuleForm("new"),
                onEdit: openRuleForm,
                onCancel: closeRuleForm,
                onSave: saveRule,
                onToggle: toggleRule,
                onDelete: deleteRule,
              }),
              "panel-recurring",
            ),
            panel(
              t("files"),
              dataPanel({ ctx, report, onExport: exportData, onImport: (file) => void importData(file) }),
              "panel-data",
            ),
          ),
        ),
      ),
      h("footer", { class: "footer" }, t("privacy")),
    );
  }

  const posted = loaded.problem ? 0 : runRecurring();
  render();
  if (loaded.problem) {
    showNotice({ tone: "error", text: ctx.t("loadProblem", { detail: loaded.problem }) });
  } else if (posted > 0) {
    showNotice({ tone: "info", text: ctx.t("posted", { count: ctx.count(posted) }) });
  }

  return {
    offerReload() {
      showNotice({
        tone: "info",
        sticky: true,
        text: ctx.t("updateReady"),
        action: { label: ctx.t("reload"), run: () => location.reload() },
      });
    },
  };
}
