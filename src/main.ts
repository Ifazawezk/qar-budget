import "./style.css";
import { preferredLang } from "./lib/i18n";
import type { KeyValueStore } from "./lib/storage";
import { startApp } from "./ui/app";
import { registerOffline } from "./ui/offline";

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
const app = startApp(root, browserStore(), preferredLang(navigator.languages ?? [navigator.language]));
registerOffline(app.offerReload);
