import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../../vite.config";
import { manifestFile } from "./i18n";

interface Icon {
  src: string;
  sizes: string;
  type: string;
  purpose: string;
}

interface Manifest {
  id: string;
  name: string;
  short_name: string;
  description: string;
  lang: string;
  dir: string;
  start_url: string;
  scope: string;
  display: string;
  icons: Icon[];
}

const root = process.cwd();
const read = (file: string): Manifest =>
  JSON.parse(readFileSync(join(root, "public", file), "utf8")) as Manifest;

const en = read(manifestFile("en"));
const ar = read(manifestFile("ar"));
const base = config.base ?? "";
const siteUrl = `https://example.github.io${base}`;
const manifestUrl = `${siteUrl}manifest.webmanifest`;

/** Width and height from a PNG's header. */
function pngSize(file: string): string {
  const data = readFileSync(file);
  expect(data.subarray(1, 4).toString()).toBe("PNG");
  return `${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`;
}

describe.each([
  ["English", en],
  ["Arabic", ar],
])("%s manifest", (_name, manifest) => {
  it("opens and stays inside the site's base path", () => {
    expect(new URL(manifest.start_url, manifestUrl).href).toBe(siteUrl);
    expect(new URL(manifest.scope, manifestUrl).href).toBe(siteUrl);
    expect(manifest.id).toBe(base);
  });

  it("runs as an installed app", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).not.toBe("");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("has the icons an install needs, each the size it claims", () => {
    for (const icon of manifest.icons) {
      const file = join(root, "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      expect(pngSize(file), icon.src).toBe(icon.sizes);
      expect(icon.type).toBe("image/png");
    }
    const sizes = (purpose: string) =>
      manifest.icons.filter((icon) => icon.purpose === purpose).map((icon) => icon.sizes);
    expect(sizes("any")).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(sizes("maskable")).toEqual(["512x512"]);
  });
});

describe("language versions", () => {
  it("are the same app, so changing language cannot create a second install", () => {
    const shared = ({ id, start_url, scope, display, icons }: Manifest) => ({
      id,
      start_url,
      scope,
      display,
      icons,
    });
    expect(shared(ar)).toEqual(shared(en));
  });

  it("are written in their own language and direction", () => {
    expect([en.lang, en.dir]).toEqual(["en", "ltr"]);
    expect([ar.lang, ar.dir]).toEqual(["ar", "rtl"]);
    expect(ar.name).toMatch(/[؀-ۿ]/);
    expect(ar.description).toMatch(/[؀-ۿ]/);
  });
});

describe("index.html", () => {
  const html = readFileSync(join(root, "index.html"), "utf8");

  it("links the manifest and icons from the public folder", () => {
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    for (const [, path] of html.matchAll(/href="(\/icons\/[^"]+)"/g)) {
      expect(existsSync(join(root, "public", path ?? "")), path).toBe(true);
    }
  });
});
