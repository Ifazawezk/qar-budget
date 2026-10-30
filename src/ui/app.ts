import { currentMonth, monthOf, shiftMonth, today } from "../lib/dates";
import { formatMonth } from "../lib/format";
import { type Lang, localeFor, translator } from "../lib/i18n";
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
import type { AppData } from "../lib/types";
import { spendingChart } from "./chart";
import { h, icon } from "./dom";
import { type EntryInput, entryForm } from "./form";
import { entryList } from "./list";
import { monthNav, summaryCards } from "./overview";

interface Notice {
  tone: "info" | "error";
  text: string;
  action?: { label: string; run: () => void };
}

function panel(title: string, body: Node, className: string): HTMLElement {
  return h("section", { class: `panel ${className}` }, h("h2", { class: "panel-title" }, title), body);
}

export function startApp(root: HTMLElement, store: KeyValueStore): void {
  const loaded = load(store);
  let data: AppData = loaded.data;
  let settings: Settings = loadSettings(store);
  let editingId: string | null = null;
  let month = currentMonth();
  const lang: Lang = "en";
  const t = translator(lang);

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
    if (next?.tone === "info") {
      toastTimer = window.setTimeout(() => showNotice(null), next.action ? 8000 : 4000);
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
              { type: "button", class: "icon-btn", "aria-label": t("dismiss"), onclick: () => showNotice(null) },
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
      showNotice({ tone: "error", text: t("saveFailed") });
      return false;
    }
  }

  function focusAmount(): void {
    const input = root.querySelector<HTMLInputElement>('input[name="amount"]');
    input?.scrollIntoView({ block: "nearest" });
    input?.focus({ preventScroll: true });
  }

  function submitEntry(entry: EntryInput): void {
    const wasEditing = editingId !== null;
    const tx = { id: editingId ?? newId(), ...entry };
    editingId = null;
    // Show the month the entry landed in, so it never seems to disappear.
    month = monthOf(tx.date);
    const saved = commit({ ...data, transactions: upsert(data.transactions, tx) });
    render();
    if (saved) showNotice({ tone: "info", text: t(wasEditing ? "updated" : "added") });
    focusAmount();
  }

  function startEdit(id: string): void {
    editingId = id;
    render();
    focusAmount();
  }

  function cancelEdit(): void {
    editingId = null;
    render();
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
      text: t("deleted"),
      action: {
        label: t("undo"),
        run: () => {
          if (commit({ ...data, transactions: restore(data.transactions, tx, index) })) showNotice(null);
          render();
        },
      },
    });
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

  function updateSettings(next: Settings): void {
    settings = next;
    try {
      saveSettings(store, settings);
    } catch {
      // Preferences are a convenience; the page still works without saving them.
    }
    render();
  }

  function render(): void {
    const html = document.documentElement;
    if (settings.theme === "auto") html.removeAttribute("data-theme");
    else html.dataset.theme = settings.theme;

    const locale = localeFor(lang);
    const editing = data.transactions.find((tx) => tx.id === editingId) ?? null;
    const themeLabel = isDark() ? t("themeToLight") : t("themeToDark");
    const summary = summarize(data.transactions, month);
    const previous = summarize(data.transactions, shiftMonth(month, -1));
    const monthName = formatMonth(month, locale);

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
          t,
          locale,
          month,
          isCurrentMonth: month === currentMonth(),
          onShift: (delta) => showMonth(shiftMonth(month, delta)),
          onCurrent: () => showMonth(currentMonth()),
        }),
        summaryCards({ t, locale, summary, previous }),
        h(
          "div",
          { class: "columns" },
          h(
            "div",
            { class: "column" },
            panel(
              editing ? t("editEntry") : t("addEntry"),
              entryForm({
                t,
                editing,
                defaultDate: defaultDate(),
                onSubmit: submitEntry,
                onCancel: cancelEdit,
              }),
              "panel-form",
            ),
            panel(
              t("entries"),
              entryList({
                t,
                locale,
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
                    spending: summary.spending,
                    locale,
                    rtl: false,
                    caption: `${t("spending")}, ${monthName}`,
                    headers: [t("category"), t("amount"), t("share")],
                  })
                : h("p", { class: "empty" }, t("noSpending", { month: monthName })),
              "panel-chart",
            ),
          ),
        ),
      ),
      h("footer", { class: "footer" }, t("privacy")),
    );
  }

  render();
  if (loaded.problem) {
    showNotice({ tone: "error", text: t("loadProblem", { detail: loaded.problem }) });
  }
}
