type Child = Node | string | number | null | undefined | false;
type Children = Child | Child[];
type Listener = (event: Event) => void;
export type Attrs = Record<string, string | number | boolean | Listener | null | undefined>;

// Strings always become text nodes, never HTML, so notes and imported files
// cannot inject markup.
function build<E extends Element>(el: E, attrs: Attrs, children: Children[]): E {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === "function") {
      el.addEventListener(key.replace(/^on/, ""), value);
    } else {
      el.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Children[]
): HTMLElementTagNameMap[K] {
  return build(document.createElement(tag), attrs, children);
}

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Children[]
): SVGElementTagNameMap[K] {
  return build(document.createElementNS("http://www.w3.org/2000/svg", tag), attrs, children);
}

const ICONS = {
  edit: "M4 20h4L19.5 8.5a2.12 2.12 0 0 0-3-3L5 17v3z",
  trash: "M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z",
  close: "M6 6l12 12M18 6L6 18",
  // Drawn for left-to-right; the stylesheet mirrors them in Arabic.
  back: "M15 6l-6 6 6 6",
  forward: "M9 6l6 6-6 6",
};

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): SVGSVGElement {
  return s(
    "svg",
    {
      class: `icon icon-${name}`,
      viewBox: "0 0 24 24",
      width: 20,
      height: 20,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    },
    s("path", { d: ICONS[name] }),
  );
}
