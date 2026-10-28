/**
 * What sits behind a tint: each element's own background layer, read from the
 * computed cascade (rules and inline style, `var()` resolved through the element's
 * ancestors) and from its Tailwind classes, then composited up the ancestor chain.
 *
 * Reads, never guesses: whatever the text cannot name becomes UNKNOWN_PAINT (an
 * opaque layer of any colour) and the judge only acts where the resulting luma
 * interval is decisive. See taste-checks-invisible-surface-paint.ts.
 */
import type { Document, Element } from "domhandler";
import * as du from "domutils";
import { isTag, parseHtml } from "./extractors/html/html-dom.js";
import type { Computed, ComputedStyle } from "./extractors/html/css-cascade.js";
import { splitTopLevel } from "./extractors/html/css-values.js";
import { resolveVars } from "./extractors/html/css-custom-properties.js";
import {
  NO_PAINT, UNKNOWN_PAINT, compositeStack, parsePaintColor, paintOfColor, samePaint,
} from "./taste-checks-invisible-surface-paint.js";
import type { Backdrop, Paint } from "./taste-checks-invisible-surface-paint.js";
import { classBackground } from "./taste-checks-invisible-surface-tailwind.js";
import { isImageLayer, withImages } from "./taste-checks-invisible-surface-background-images.js";

export const parentElement = (el: Element): Element | null => {
  const p = du.getParent(el);
  return p !== null && isTag(p as Element) ? (p as Element) : null;
};

export const classesOf = (el: Element): string[] => (el.attribs["class"] ?? "").split(/\s+/).filter(Boolean);

// ── Document spine ───────────────────────────────────────────────────────────

/**
 * Give the tree an `html` > `body` spine, as a browser would. A fragment (or a page
 * that omits `<body>`) otherwise has nothing for `html, body { … }` and `:root { … }`
 * to land on, and the page's own background would go unread. Real nodes keep their
 * source offsets; only the two wrappers are new, and they hold no candidates.
 */
export function ensureDocumentSpine(doc: Document): void {
  const tags = du.findAll((n): n is Element => isTag(n), doc.children);
  const html = tags.find((e) => e.tagName === "html");
  const body = tags.find((e) => e.tagName === "body");
  if (html !== undefined && body !== undefined) return;
  if (html === undefined && body !== undefined && !doc.children.includes(body)) return; // buried in other markup: leave it

  const shellHtml = parseHtml("<html><body></body></html>").doc.children[0] as Element;
  const shellBody = shellHtml.children[0] as Element;
  const moveInto = (nodes: Document["children"], parent: Element): void => {
    for (const n of nodes) n.parent = parent;
    parent.children = nodes;
  };
  if (html !== undefined) { // <html> without <body>: the body is everything inside it
    moveInto(html.children, shellBody);
    moveInto([shellBody], html);
    return;
  }
  if (body !== undefined) moveInto(doc.children, shellHtml);
  else { moveInto(doc.children, shellBody); }
  doc.children = [shellHtml];
  shellHtml.parent = doc;
}

// ── One element's own background ─────────────────────────────────────────────

/** A `background-color` value. */
function colourPaint(v: string): Paint {
  const t = v.trim().toLowerCase();
  if (t === "" || t === "none" || t === "initial" || t === "unset" || t === "transparent") return NO_PAINT;
  const c = parsePaintColor(t);
  return c === undefined ? UNKNOWN_PAINT : paintOfColor(c);
}

/** The base colour of a `background` shorthand's final layer; undefined when it names none. */
function shorthandColour(value: string): Paint | undefined {
  const finalLayer = splitTopLevel(value, ",").pop() ?? "";
  for (const token of splitTopLevel(finalLayer, " ")) {
    const c = parsePaintColor(token);
    if (c !== undefined) return paintOfColor(c);
  }
  return undefined;
}

/** Which of two declarations wins; undefined when the cascade data cannot say. */
function winner(a: Computed, b: Computed): Computed | undefined {
  if (a.important !== b.important) return a.important ? a : b;
  if (a.specificity !== b.specificity) return a.specificity > b.specificity ? a : b;
  return a.line === b.line ? undefined : a.line > b.line ? a : b;
}

// ── The surface context ──────────────────────────────────────────────────────

export interface SurfaceContext {
  /** What `el` lays down behind its own content; undefined when it sets no background. */
  layerOf(el: Element): Paint | undefined;
  /** The luma interval a tint on `el` lands on: its ancestors' layers (and `el`'s own when `includeSelf`) over the canvas. */
  backdropOf(el: Element, includeSelf: boolean): Backdrop;
  /** Page canvas: white, or black under a `dark` class on html/body. */
  canvas: Backdrop;
  resolve(value: string, el: Element): string | undefined;
}

export function createSurfaceContext(
  doc: Document,
  byElement: Map<Element, ComputedStyle>,
  /** Utilities applied to an element by a rule (`@apply`), on top of its `class` attribute. */
  appliedClasses: ReadonlyMap<Element, readonly string[]> = new Map(),
): SurfaceContext {
  const tags = du.findAll((n): n is Element => isTag(n), doc.children);
  const htmlEl = tags.find((e) => e.tagName === "html");
  const bodyEl = tags.find((e) => e.tagName === "body");
  const rootStyle = htmlEl === undefined ? undefined : byElement.get(htmlEl);
  const dark = [htmlEl, bodyEl].some((e) => e !== undefined && classesOf(e).includes("dark"));
  const canvas: Backdrop = dark ? { lo: 0, hi: 0, chromatic: false } : { lo: 1, hi: 1, chromatic: false };
  const resolve = (value: string, el: Element): string | undefined => resolveVars(value, el, byElement, rootStyle).value;

  /** A theme token such as `bg-card`: the document's own `--card` when it defines one, else the canvas's polarity. */
  const theme = (name: string, el: Element): Paint | undefined => {
    const defined = resolve(`var(--${name})`, el);
    if (defined === undefined) return dark ? { lo: 0, hi: 0.16, alpha: 1, chromatic: false } : { lo: 0.93, hi: 1, alpha: 1, chromatic: false };
    const hslParts = /^\s*[\d.]+(?:deg)?\s+[\d.]+%\s+[\d.]+%(?:\s*\/\s*[\d.]+%?)?\s*$/.test(defined) ? `hsl(${defined.trim()})` : defined;
    const c = parsePaintColor(hslParts.trim());
    return c === undefined ? undefined : paintOfColor(c);
  };

  /** Background declared by rules / inline style. */
  const cssLayer = (el: Element): Paint | undefined => {
    const style = byElement.get(el);
    const short = style?.get("background");
    const colour = style?.get("background-color");
    const image = style?.get("background-image");
    if (short === undefined && colour === undefined && image === undefined) return undefined;
    const read = (c: Computed | undefined): string | undefined | null => (c === undefined ? undefined : (resolve(c.value, el) ?? null));
    const shortV = read(short);
    const colourV = read(colour);
    const imageV = read(image);
    if (shortV === null || colourV === null || imageV === null) return UNKNOWN_PAINT; // an unresolved var()

    let base: Paint | undefined;
    if (short !== undefined && colour !== undefined) {
      const w = winner(short, colour);
      if (w === undefined) return UNKNOWN_PAINT;
      base = w === short ? (shorthandColour(shortV ?? "") ?? NO_PAINT) : colourPaint(colourV ?? "");
    } else if (short !== undefined) base = shorthandColour(shortV ?? "") ?? NO_PAINT;
    else if (colour !== undefined) base = colourPaint(colourV ?? "");

    const images = [
      ...(shortV === undefined ? [] : splitTopLevel(shortV, ",").filter(isImageLayer)),
      ...(imageV === undefined || /^\s*none\s*$/i.test(imageV) ? [] : splitTopLevel(imageV, ",")),
    ];
    return images.length > 0 ? withImages(images, base) : base;
  };

  const memo = new Map<Element, Paint | undefined>();
  const layerOf = (el: Element): Paint | undefined => {
    if (memo.has(el)) return memo.get(el);
    const css = cssLayer(el);
    const tw = classBackground([...classesOf(el), ...(appliedClasses.get(el) ?? [])], (name) => theme(name, el));
    // Rules and utilities both set it and the scan cannot order them: unreadable unless they agree.
    const out = css !== undefined && tw !== undefined ? (samePaint(css, tw) ? css : UNKNOWN_PAINT) : (css ?? tw);
    memo.set(el, out);
    return out;
  };

  const backdropOf = (el: Element, includeSelf: boolean): Backdrop => {
    const layers: Paint[] = [];
    for (let a: Element | null = includeSelf ? el : parentElement(el); a !== null; a = parentElement(a)) {
      const p = layerOf(a);
      if (p === undefined || p.alpha <= 0) continue;
      layers.push(p);
      if (p.alpha >= 0.995) break;
    }
    return compositeStack(layers, canvas);
  };

  return { layerOf, backdropOf, canvas, resolve };
}
