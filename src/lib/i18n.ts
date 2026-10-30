const en = {
  appTitle: "QAR Budget",
  themeToDark: "Switch to dark mode",
  themeToLight: "Switch to light mode",
  addEntry: "Add entry",
  editEntry: "Edit entry",
  kind: "Type",
  expense: "Expense",
  income: "Income",
  amount: "Amount (QAR)",
  category: "Category",
  date: "Date",
  note: "Note",
  notePlaceholder: "Optional, for example weekly shop",
  add: "Add",
  saveChanges: "Save changes",
  cancel: "Cancel",
  amountInvalid: "Enter an amount above zero, with at most two decimals.",
  dateInvalid: "Pick a valid date.",
  entries: "Entries",
  noEntries: "Nothing recorded yet. Add your first income or expense above.",
  edit: "Edit",
  delete: "Delete",
  editLabel: "Edit {name}",
  deleteLabel: "Delete {name}",
  added: "Entry added.",
  updated: "Changes saved.",
  deleted: "Entry deleted.",
  undo: "Undo",
  dismiss: "Dismiss",
  saveFailed: "Could not save in this browser. Export your data to keep a copy.",
  loadProblem: "Saved data could not be read ({detail}). A backup copy was kept in this browser.",
  privacy: "Your data stays in this browser. Nothing is uploaded.",
};

export type MessageKey = keyof typeof en;
export type Lang = "en";
export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

const messages: Record<Lang, Record<MessageKey, string>> = { en };

export function translator(lang: Lang): Translate {
  const table = messages[lang];
  return (key, vars) =>
    table[key].replace(/\{(\w+)\}/g, (match, name: string) =>
      vars && name in vars ? String(vars[name]) : match,
    );
}

export function localeFor(lang: Lang): string {
  return lang === "en" ? "en-QA" : lang;
}
