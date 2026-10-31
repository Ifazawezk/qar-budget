import { describe, expect, it } from "vitest";
import {
  applyRuleEdit,
  CATCH_UP_LIMIT,
  createRule,
  earliestStart,
  followingDate,
  isAllowedStart,
  mergeRules,
  nextOnOrAfter,
  occurrenceId,
  postDue,
  resumeRule,
  type RuleInput,
  sortRules,
  upcomingDate,
} from "./recurring";
import { remove } from "./transactions";
import type { RecurringRule } from "./types";

const input: RuleInput = {
  kind: "expense",
  amount: 420000,
  category: "housing",
  note: "Rent",
  frequency: "monthly",
  date: "2026-01-31",
};

function rule(overrides: Partial<RuleInput> = {}): RecurringRule {
  return createRule("r1", { ...input, ...overrides });
}

function dates(start: string, today: string, frequency: RuleInput["frequency"] = "monthly"): string[] {
  const { transactions } = postDue([], [rule({ date: start, frequency })], today);
  return transactions.map((tx) => tx.date);
}

describe("month-end dates", () => {
  it("returns to the 31st after shorter months", () => {
    expect(dates("2026-01-31", "2026-08-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
      "2026-07-31",
      "2026-08-31",
    ]);
  });

  it("uses 29 February in a leap year and 28 in the next", () => {
    expect(dates("2028-01-31", "2028-03-31")).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
    expect(dates("2029-01-31", "2029-03-31")).toEqual(["2029-01-31", "2029-02-28", "2029-03-31"]);
  });

  it("does the same for the 29th and the 30th", () => {
    expect(dates("2026-01-29", "2026-03-29")).toEqual(["2026-01-29", "2026-02-28", "2026-03-29"]);
    expect(dates("2026-01-30", "2026-03-30")).toEqual(["2026-01-30", "2026-02-28", "2026-03-30"]);
    expect(dates("2028-01-29", "2028-03-29")).toEqual(["2028-01-29", "2028-02-29", "2028-03-29"]);
  });

  it("does not move a day that every month has", () => {
    expect(dates("2026-01-28", "2026-03-28")).toEqual(["2026-01-28", "2026-02-28", "2026-03-28"]);
  });

  it("does not drift when a rule starts in a short month", () => {
    expect(dates("2026-04-30", "2026-07-30")).toEqual([
      "2026-04-30",
      "2026-05-30",
      "2026-06-30",
      "2026-07-30",
    ]);
  });

  it("crosses the end of the year", () => {
    expect(dates("2026-12-31", "2027-02-28")).toEqual(["2026-12-31", "2027-01-31", "2027-02-28"]);
  });

  it("works one step at a time, the way a rule moves between opens", () => {
    const schedule = rule({ date: "2026-01-31" });
    expect(followingDate(schedule, "2026-01-31")).toBe("2026-02-28");
    expect(followingDate(schedule, "2026-02-28")).toBe("2026-03-31");
  });

  it("gets the same dates opened every month as opened once after a long gap", () => {
    let transactions = postDue([], [rule()], "2026-01-31");
    for (const today of ["2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]) {
      transactions = postDue(transactions.transactions, transactions.recurring, today);
    }
    expect(transactions.transactions.map((tx) => tx.date)).toEqual(dates("2026-01-31", "2026-05-31"));
  });
});

describe("weekly rules", () => {
  it("repeats every seven days across a month and a year", () => {
    expect(dates("2026-12-20", "2027-01-10", "weekly")).toEqual([
      "2026-12-20",
      "2026-12-27",
      "2027-01-03",
      "2027-01-10",
    ]);
  });

  it("does not stop at the 31st", () => {
    expect(dates("2026-01-31", "2026-02-14", "weekly")).toEqual([
      "2026-01-31",
      "2026-02-07",
      "2026-02-14",
    ]);
  });
});

describe("postDue", () => {
  it("adds nothing before the date and reports no change", () => {
    const rules = [rule({ date: "2026-11-01" })];
    const result = postDue([], rules, "2026-10-31");
    expect(result).toEqual({ transactions: [], recurring: rules, posted: 0, changed: false });
  });

  it("adds a normal entry on the due date itself", () => {
    const result = postDue([], [rule({ date: "2026-11-01" })], "2026-11-01");
    expect(result.transactions).toEqual([
      {
        id: occurrenceId("r1", "2026-11-01"),
        kind: "expense",
        amount: 420000,
        category: "housing",
        note: "Rent",
        date: "2026-11-01",
      },
    ]);
    expect(result.recurring[0]?.nextDue).toBe("2026-12-01");
    expect(result.changed).toBe(true);
  });

  it("catches up on every date missed while the app was closed", () => {
    const result = postDue([], [rule({ date: "2026-08-01" })], "2026-10-15");
    expect(result.posted).toBe(3);
    expect(result.recurring[0]?.nextDue).toBe("2026-11-01");
  });

  it("does nothing when run twice on the same day", () => {
    const first = postDue([], [rule({ date: "2026-08-01" })], "2026-10-15");
    const second = postDue(first.transactions, first.recurring, "2026-10-15");
    expect(second.transactions).toEqual(first.transactions);
    expect(second.posted).toBe(0);
    expect(second.changed).toBe(false);
  });

  it("does not bring back an entry the user deleted", () => {
    const first = postDue([], [rule({ date: "2026-10-01" })], "2026-10-15");
    const id = occurrenceId("r1", "2026-10-01");
    const second = postDue(remove(first.transactions, id), first.recurring, "2026-10-20");
    expect(second.transactions).toEqual([]);
  });

  it("leaves an edited entry alone when the rule later changes", () => {
    const first = postDue([], [rule({ date: "2026-10-01" })], "2026-10-15");
    const edited = first.transactions.map((tx) => ({ ...tx, amount: 1 }));
    const changed = first.recurring.map((r) => ({ ...r, amount: 999 }));
    const second = postDue(edited, changed, "2026-11-01");
    expect(second.transactions.map((tx) => tx.amount)).toEqual([1, 999]);
  });

  it("never doubles a date when a stale copy of the rule runs again", () => {
    const stale = [rule({ date: "2026-10-01" })];
    const first = postDue([], stale, "2026-10-15");
    const edited = first.transactions.map((tx) => ({ ...tx, note: "Paid late" }));
    const second = postDue(edited, stale, "2026-10-15");
    expect(second.transactions).toEqual(edited);
    expect(second.posted).toBe(0);
    expect(second.recurring[0]?.nextDue).toBe("2026-11-01");
  });

  it("skips paused rules", () => {
    const paused = { ...rule({ date: "2026-08-01" }), paused: true };
    const result = postDue([], [paused], "2026-10-15");
    expect(result.transactions).toEqual([]);
    expect(result.recurring).toEqual([paused]);
  });

  it("adds entries from several rules in date order", () => {
    const salary = createRule("salary", { ...input, kind: "income", date: "2026-10-02" });
    const rent = rule({ date: "2026-10-01" });
    const result = postDue([], [salary, rent], "2026-10-03");
    expect(result.transactions.map((tx) => tx.date)).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("keeps entries already saved", () => {
    const saved = { ...input, id: "x", date: "2026-09-09" };
    const result = postDue([saved], [rule({ date: "2026-10-01" })], "2026-10-01");
    expect(result.transactions.map((tx) => tx.id)).toEqual(["x", "r1@2026-10-01"]);
  });

  it("caps one run and finishes the rest on the next, with nothing lost or doubled", () => {
    const first = postDue([], [rule({ date: "2020-01-01", frequency: "weekly" })], "2026-10-31");
    expect(first.posted).toBe(CATCH_UP_LIMIT);
    const second = postDue(first.transactions, first.recurring, "2026-10-31");
    const third = postDue(second.transactions, second.recurring, "2026-10-31");
    const fourth = postDue(third.transactions, third.recurring, "2026-10-31");
    const ids = fourth.transactions.map((tx) => tx.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fourth.transactions).toHaveLength(357);
    expect(fourth.recurring[0]?.nextDue).toBe("2026-11-04");
    expect(postDue(fourth.transactions, fourth.recurring, "2026-10-31").changed).toBe(false);
  });
});

describe("pause and resume", () => {
  const paused = { ...rule({ date: "2026-03-31" }), paused: true };

  it("skips what was missed while paused", () => {
    const resumed = resumeRule(paused, "2026-07-10");
    expect(resumed.paused).toBe(false);
    expect(resumed.nextDue).toBe("2026-07-31");
    expect(postDue([], [resumed], "2026-07-10").posted).toBe(0);
  });

  it("still adds a date that falls on the day of resuming", () => {
    const resumed = resumeRule(paused, "2026-06-30");
    expect(resumed.nextDue).toBe("2026-06-30");
    expect(postDue([], [resumed], "2026-06-30").posted).toBe(1);
  });

  it("keeps a future date", () => {
    expect(resumeRule(paused, "2026-02-01").nextDue).toBe("2026-03-31");
  });

  it("shows a paused rule's next real date, not the old saved one", () => {
    expect(upcomingDate(paused, "2026-07-10")).toBe("2026-07-31");
    expect(upcomingDate({ ...paused, paused: false }, "2026-07-10")).toBe("2026-03-31");
  });

  it("finds the next date from any starting point", () => {
    expect(nextOnOrAfter(paused, "2026-04-30")).toBe("2026-04-30");
    expect(nextOnOrAfter(paused, "2026-05-01")).toBe("2026-05-31");
  });
});

describe("editing a rule", () => {
  // A rule for the 31st that is waiting on a short month.
  const waiting: RecurringRule = { ...rule(), nextDue: "2026-02-28" };
  const form: RuleInput = { ...input, date: "2026-02-28" };

  it("keeps the 31st when only the amount changes", () => {
    const edited = applyRuleEdit(waiting, { ...form, amount: 500000 }, "2026-02-01");
    expect(edited.amount).toBe(500000);
    expect(edited.startDate).toBe("2026-01-31");
    expect(followingDate(edited, edited.nextDue)).toBe("2026-03-31");
  });

  it("restarts the schedule from a new date", () => {
    const edited = applyRuleEdit(waiting, { ...form, date: "2026-03-05" }, "2026-02-01");
    expect(edited.startDate).toBe("2026-03-05");
    expect(edited.nextDue).toBe("2026-03-05");
  });

  it("restarts the schedule when the frequency changes", () => {
    const weekly = { ...rule({ date: "2026-10-01", frequency: "weekly" }), nextDue: "2026-11-05" };
    const edited = applyRuleEdit(weekly, { ...form, date: "2026-11-05" }, "2026-11-01");
    expect(edited.frequency).toBe("monthly");
    expect(followingDate(edited, edited.nextDue)).toBe("2026-12-05");
  });

  it("keeps a paused rule paused and its schedule when the date is left alone", () => {
    const paused = { ...waiting, paused: true };
    const edited = applyRuleEdit(paused, { ...form, note: "New", date: "2026-07-31" }, "2026-07-10");
    expect(edited.paused).toBe(true);
    expect(edited.note).toBe("New");
    expect(edited.nextDue).toBe("2026-02-28");
  });

  it("cannot double a date that was already added when moved back onto it", () => {
    const first = postDue([], [rule({ date: "2026-10-01" })], "2026-10-15");
    const saved = first.recurring[0];
    if (!saved) throw new Error("missing rule");
    const moved = applyRuleEdit(saved, { ...input, date: "2026-10-01" }, "2026-10-15");
    const second = postDue(first.transactions, [moved], "2026-10-15");
    expect(second.posted).toBe(0);
    expect(second.transactions).toHaveLength(1);
  });
});

describe("start date limit", () => {
  it("allows up to twelve months back", () => {
    expect(earliestStart("2026-10-31")).toBe("2025-10-31");
    expect(isAllowedStart("2025-10-31", "2026-10-31")).toBe(true);
    expect(isAllowedStart("2025-10-30", "2026-10-31")).toBe(false);
    expect(isAllowedStart("2027-05-01", "2026-10-31")).toBe(true);
  });

  it("handles 29 February", () => {
    expect(earliestStart("2028-02-29")).toBe("2027-02-28");
  });

  it("catches a mistyped year", () => {
    expect(isAllowedStart("0202-10-01", "2026-10-31")).toBe(false);
  });
});

describe("mergeRules", () => {
  const saved: RecurringRule = { ...rule({ date: "2026-10-01" }), nextDue: "2026-12-01" };

  it("adds rules that are not saved yet", () => {
    const other = createRule("r2", input);
    expect(mergeRules([saved], [other])).toEqual([saved, other]);
  });

  it("takes the imported fields", () => {
    const incoming = { ...saved, amount: 1, nextDue: "2027-01-01" };
    expect(mergeRules([saved], [incoming])).toEqual([incoming]);
  });

  it("does not move the next date backwards when an old backup is restored", () => {
    const old = { ...saved, amount: 1, nextDue: "2026-10-01" };
    expect(mergeRules([saved], [old])).toEqual([{ ...old, nextDue: "2026-12-01" }]);
  });

  it("does not repeat a rule that appears twice in a file", () => {
    expect(mergeRules([], [saved, saved])).toEqual([saved]);
  });
});

describe("sortRules", () => {
  it("lists the soonest first and paused rules last", () => {
    const soon = createRule("soon", { ...input, date: "2026-11-01" });
    const later = createRule("later", { ...input, date: "2026-12-01" });
    const paused = { ...createRule("paused", { ...input, date: "2026-01-01" }), paused: true };
    expect(sortRules([paused, later, soon]).map((r) => r.id)).toEqual(["soon", "later", "paused"]);
  });
});
