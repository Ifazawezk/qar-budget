import type { CsvField, CsvIssue } from "../lib/csv";
import type { MessageKey } from "../lib/i18n";
import type { UiContext } from "./context";
import { h, icon } from "./dom";

export interface ImportReport {
  fileName: string;
  issues: CsvIssue[];
}

export interface DataPanelOptions {
  ctx: UiContext;
  report: ImportReport | null;
  onExport: (format: "json" | "csv") => void;
  onImport: (file: File) => void;
}

const FIELD_NAMES: Record<CsvField, MessageKey> = {
  date: "fieldDate",
  type: "fieldType",
  category: "fieldCategory",
  amount: "fieldAmount",
};

const SHOWN_ISSUES = 5;

function issueList(report: ImportReport, ctx: UiContext): HTMLElement {
  const { t } = ctx;
  // A missing column fails the whole import, so only row problems end up here.
  const rows = report.issues.flatMap((issue) =>
    issue.field === "columns" ? [] : [{ line: issue.line, field: issue.field }],
  );
  const shown = rows.slice(0, SHOWN_ISSUES);
  const hidden = rows.length - shown.length;
  return h(
    "div",
    { class: "import-issues" },
    h("p", {}, icon("warning"), h("span", {}, t("importIssues"))),
    h(
      "ul",
      {},
      shown.map((issue) =>
        h("li", {}, t("importIssue", { line: ctx.count(issue.line), field: t(FIELD_NAMES[issue.field]) })),
      ),
      hidden > 0 && h("li", {}, t("moreIssues", { count: ctx.count(hidden) })),
    ),
  );
}

export function dataPanel({ ctx, report, onExport, onImport }: DataPanelOptions): HTMLElement {
  const { t } = ctx;
  const fileInput = h("input", {
    type: "file",
    accept: ".json,.csv,application/json,text/csv",
    class: "sr-only",
    tabindex: -1,
    "aria-hidden": "true",
    onchange: (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      // Reset so choosing the same file again still fires a change.
      input.value = "";
      if (file) onImport(file);
    },
  });

  return h(
    "div",
    { class: "data" },
    h("p", { class: "hint" }, t("filesHelp")),
    h(
      "div",
      { class: "data-actions" },
      h("button", { type: "button", class: "btn", onclick: () => onExport("json") }, icon("download"), t("exportJson")),
      h("button", { type: "button", class: "btn", onclick: () => onExport("csv") }, icon("download"), t("exportCsv")),
      h("button", { type: "button", class: "btn", onclick: () => fileInput.click() }, icon("upload"), t("importFile")),
      fileInput,
    ),
    report && report.issues.length > 0 && issueList(report, ctx),
  );
}

export function download(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h("a", { href: url, download: fileName, hidden: true });
  document.body.append(link);
  link.click();
  link.remove();
  // Some browsers start the download asynchronously; give them a moment before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
