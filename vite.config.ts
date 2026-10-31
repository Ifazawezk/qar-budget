/// <reference types="node" />

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { precacheFiles, stampBuild } from "./src/lib/sw-rules.ts";

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).replaceAll("\\", "/"));
}

/**
 * Bundles src/sw.ts to sw.js at the root of the site, then writes in the build's file
 * list and a version made from every file's content. That runs after the files are on
 * disk, because the contents of public/ are not part of the bundle.
 */
function serviceWorker(): Plugin {
  let outDir = "";
  return {
    name: "qar-budget:service-worker",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    buildStart() {
      this.emitFile({ type: "chunk", id: resolve("src/sw.ts"), fileName: "sw.js" });
    },
    writeBundle() {
      const files = precacheFiles(listFiles(outDir));
      const hash = createHash("sha256");
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      const worker = join(outDir, "sw.js");
      const version = hash.digest("hex").slice(0, 12);
      writeFileSync(worker, stampBuild(readFileSync(worker, "utf8"), { version, files }));
    },
  };
}

export default defineConfig({
  // Served from https://<user>.github.io/qar-budget/ on GitHub Pages.
  base: "/qar-budget/",
  plugins: [serviceWorker()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
