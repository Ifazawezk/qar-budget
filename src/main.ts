import "./style.css";
import type { KeyValueStore } from "./lib/storage";
import { startApp } from "./ui/app";

function browserStore(): KeyValueStore {
  try {
    // Reading localStorage throws in some privacy modes; fall back to memory for the session.
    const storage = window.localStorage;
    storage.getItem("qar-budget:probe");
    return storage;
  } catch {
    const items = new Map<string, string>();
    return {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => void items.set(key, value),
    };
  }
}

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app element");
startApp(root, browserStore());
