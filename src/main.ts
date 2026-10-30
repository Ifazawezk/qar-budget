import { load } from "./lib/storage";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app element");

const { data, problem } = load(localStorage);

const title = document.createElement("h1");
title.textContent = "QAR Budget";
const status = document.createElement("p");
status.textContent = problem
  ? `Saved data could not be read (${problem}). A backup copy was kept.`
  : `${data.transactions.length} entries saved on this device.`;
root.append(title, status);
