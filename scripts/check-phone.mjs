// Uses the app the way a phone does, in real headless Edge: npm run check:phone
//
// The page gets a touch screen at phone widths, real touch events and real text input,
// so a tap lands on whatever is really on top at that point. A headless browser has no
// on-screen keyboard, so the check for that is whether focus stays out of the amount field.
//
// Needs Node 22 or newer and Edge. Set EDGE_PATH if Edge is not in the usual place.

import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { build, preview } from "vite";
import { launchEdge } from "./edge.mjs";

const WORK = resolve("node_modules/.cache/qar-budget-phone");
const WIDTHS = [390, 360, 320];
const SMALLEST_TARGET = 44;
const LONG_NOTE = "Weekly shop at the corner store near the flat, with the bread for the neighbours";

const failures = [];

function check(name, passed, detail = "") {
  console.log(`${passed ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!passed) failures.push(name);
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/** Twenty entries on one day of this month, so the list runs far below the form. */
function seed() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const transactions = Array.from({ length: 20 }, (_, i) => ({
    id: `seed-${i}`,
    kind: "expense",
    amount: 1000 + i * 100,
    category: "transport",
    date: `${now.getFullYear()}-${month}-01`,
    note: i === 0 ? LONG_NOTE : "",
  }));
  return JSON.stringify({ version: 3, transactions, budgets: {}, recurring: [] });
}

async function setWidth(tab, width) {
  await tab.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await pause(150);
}

/** Bring something to the middle of the screen and tap it with real touch events. */
async function tap(tab, selector) {
  const point = await tab.eval(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "center" });
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  })()`);
  if (!point) throw new Error(`Nothing to tap: ${selector}`);
  await tab.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await tab.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await pause(120);
}

/** Tap a field and replace whatever is in it, as typing over a selection does. */
async function typeInto(tab, selector, text) {
  await tap(tab, selector);
  await tab.eval(`document.querySelector(${JSON.stringify(selector)}).select(); 1`);
  await tab.send("Input.insertText", { text });
}

function onScreen(tab, selector) {
  return tab.eval(`(() => {
    const box = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    return Boolean(box) && box.top >= 0 && box.bottom <= innerHeight;
  })()`);
}

/** The newest entry that was not part of the seed data, in dirhams as saved. */
const SAVED_AMOUNT = `JSON.parse(localStorage.getItem("qar-budget:data")).transactions
  .filter((entry) => !entry.id.startsWith("seed-")).at(-1)?.amount`;
const SAVED_COUNT = `JSON.parse(localStorage.getItem("qar-budget:data")).transactions.length`;
const FOCUSED_FIELD = `document.activeElement?.getAttribute("name")`;
const CATEGORY = `document.querySelector(".panel-form select[name=category]").value`;

const SIDEWAYS_SCROLL = `document.documentElement.scrollWidth > document.documentElement.clientWidth`;
const SMALL_TARGETS = `[...document.querySelectorAll("button, select, input, label.segment")]
  .filter((element) => !element.closest(".segment") || element.tagName === "LABEL")
  .filter((element) => element.type !== "file")
  .map((element) => ({ element, box: element.getBoundingClientRect() }))
  .filter(({ box }) => box.width > 0 && Math.min(box.width, box.height) < ${SMALLEST_TARGET} - 0.5)
  .map(({ element, box }) => element.className + " " + Math.round(box.width) + "x" + Math.round(box.height))`;

async function checkMoney(tab) {
  console.log("\nTyping amounts");
  for (const [typed, dirhams] of [
    ["45,50", 4550],
    ["125,5", 12550],
    ["1,250", 125000],
    ["١٢٥٫٥", 12550],
    ["١٢٥،٥", 12550],
  ]) {
    const count = await tab.eval(SAVED_COUNT);
    await typeInto(tab, ".panel-form input[name=amount]", typed);
    await tap(tab, ".panel-form button[type=submit]");
    const added = (await tab.eval(SAVED_COUNT)) === count + 1;
    const saved = added ? await tab.eval(SAVED_AMOUNT) : "nothing";
    check(`${typed} is saved as ${(dirhams / 100).toFixed(2)}`, saved === dirhams, `saved ${saved}`);
  }
  const count = await tab.eval(SAVED_COUNT);
  await typeInto(tab, ".panel-form input[name=amount]", "1,25.50");
  await tap(tab, ".panel-form button[type=submit]");
  check(
    "An amount that could be read two ways is refused",
    (await tab.eval(`document.querySelector("#entry-error").hidden`)) === false &&
      (await tab.eval(SAVED_COUNT)) === count,
  );
  await tab.reload();
}

async function checkAdding(tab) {
  console.log("\nAdding entries");
  await tab.eval(`document.querySelector(".panel-form select[name=category]").value = "groceries"; 1`);
  await typeInto(tab, ".panel-form input[name=amount]", "10");
  await tap(tab, ".panel-form button[type=submit]");
  check("Adding does not bring the keyboard back", (await tab.eval(FOCUSED_FIELD)) !== "amount");
  check("The confirmation shows", (await tab.eval(`document.querySelector(".toast-text")?.textContent`)) === "Entry added.");
  check("The form stays on the category just used", (await tab.eval(CATEGORY)) === "groceries");
  await tab.reload();
  check("The category is still there after reopening", (await tab.eval(CATEGORY)) === "groceries");
}

async function checkLayout(tab) {
  console.log("\nLayout, showing an earlier month so every button is on screen");
  await tap(tab, ".month-nav .icon-btn");
  check("The earlier month is showing", await tab.eval(`document.querySelector(".month-nav .btn-small") !== null`));
  for (const lang of ["English", "Arabic"]) {
    for (const width of WIDTHS) {
      await setWidth(tab, width);
      check(`${lang} at ${width}px does not scroll sideways`, !(await tab.eval(SIDEWAYS_SCROLL)));
      const small = await tab.eval(SMALL_TARGETS);
      check(`${lang} at ${width}px has only finger sized targets`, small.length === 0, small.slice(0, 4).join(", "));
    }
    await setWidth(tab, 390);
    await tap(tab, ".lang-btn");
  }
  await tap(tab, ".month-nav .btn-small");
  const noteLines = await tab.eval(`(() => {
    const note = document.querySelector('[data-id="seed-0"] .entry-note');
    return Math.round(note.getBoundingClientRect().height / parseFloat(getComputedStyle(note).lineHeight));
  })()`);
  check("A long note gets two lines", noteLines === 2, `${noteLines} lines`);
}

async function checkForms(tab) {
  console.log("\nEditing a row far down the list");
  const row = '[data-id="seed-5"]';
  const edit = `${row} .icon-btn:not(.danger)`;
  await tap(tab, edit);
  check("The form opens with its heading on screen", await onScreen(tab, ".panel-form .panel-title"));
  check("The heading says it is an edit", (await tab.eval(`document.querySelector(".panel-form .panel-title").textContent`)) === "Edit entry");
  check("The amount field has the cursor", (await tab.eval(FOCUSED_FIELD)) === "amount");
  await tap(tab, ".panel-form .form-actions .btn:not(.btn-primary)");
  check("Cancel goes back to the row", await onScreen(tab, row));

  await tap(tab, edit);
  await tap(tab, ".panel-form button[type=submit]");
  check("Saving goes back to the row", await onScreen(tab, row));
  check("Saving says so", (await tab.eval(`document.querySelector(".toast-text")?.textContent`)) === "Changes saved.");

  console.log("\nThe other forms");
  await tap(tab, ".panel-budgets .btn");
  check("The budget form opens with its heading on screen", await onScreen(tab, ".panel-budgets .panel-title"));
  await tap(tab, ".budget-form .form-actions .btn:not(.btn-primary)");
  check("Closing it keeps the budgets heading on screen", await onScreen(tab, ".panel-budgets .panel-title"));

  await tap(tab, ".panel-recurring .btn");
  check("The recurring form opens with its heading on screen", await onScreen(tab, ".panel-recurring .panel-title"));
  check("Its amount field has the cursor", (await tab.eval(FOCUSED_FIELD)) === "amount");
  await tap(tab, ".rule-form .form-actions .btn:not(.btn-primary)");
  check("Closing it keeps the recurring heading on screen", await onScreen(tab, ".panel-recurring .panel-title"));
}

async function run(edge, url) {
  const tab = await edge.newTab();
  await setWidth(tab, 390);
  await tab.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await tab.goto(url);
  await tab.eval(`localStorage.setItem("qar-budget:settings", '{"theme":"light","lang":"en"}'); 1`);
  await tab.eval(`localStorage.setItem("qar-budget:data", ${JSON.stringify(seed())}); 1`);
  await tab.reload();
  await tab.waitUntil(`document.querySelector(".entry-form") !== null`);
  check("The page sees a touch screen", await tab.eval(`matchMedia("(pointer: coarse)").matches`));

  await checkMoney(tab);
  await checkAdding(tab);
  await checkLayout(tab);
  await checkForms(tab);
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
const outDir = join(WORK, "site");
await build({ logLevel: "warn", build: { outDir, emptyOutDir: true } });
const server = await preview({
  logLevel: "warn",
  build: { outDir },
  preview: { host: "127.0.0.1" },
});

const profile = join(WORK, "profile");
mkdirSync(profile, { recursive: true });
const edge = await launchEdge(profile);
try {
  await run(edge, server.resolvedUrls.local[0]);
} catch (error) {
  check("The checks ran to the end", false, error.message);
} finally {
  await edge.close();
  await server.close();
}

console.log(failures.length === 0 ? "\nAll phone checks passed." : `\n${failures.length} failed.`);
process.exit(failures.length === 0 ? 0 : 1);
