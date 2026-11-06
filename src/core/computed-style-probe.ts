/**
 * Computed-style probe — one parsed DOM + resolved cascade per document, shared
 * by the string linters that used to guess an element's size from its class list
 * or from stylesheet text.
 *
 * Why it exists: on a real compiled page (Tailwind v4 + a component kit) three
 * floors fired on every view for reasons that were never about the element —
 * `[&_svg]:size-4` (a CHILD svg's size) read as the button's height, `file:text-sm`
 * (the file-button part) read as the input's font, and an unused `.overflow-auto`
 * rule read as two scroll containers. The cascade engine the fact extractor uses
 * already answers "which declaration wins for THIS element"; this module lends it
 * to those floors so they judge the element, not a string that mentions it.
 *
 * Limits, stated rather than approximated: only the default cascade (no `@media`,
 * no `:hover`, no pseudo-elements) — which is the mobile/base state these floors
 * judge; `calc()` is evaluated only for +, -, *, / over px/rem/em/numbers; any
 * other function (min/max/clamp/env) is "unknown", and an unknown value falls back
 * to the caller's class evidence, never to a guess.
 */
import type { Element } from "domhandler";
import { parseHtml, elements, lineIndexFor, nodeRef } from "./extractors/html/html-dom.js";
import { buildCascade } from "./extractors/html/css-cascade.js";
import type { ComputedStyle } from "./extractors/html/css-cascade.js";
import { resolveVars } from "./extractors/html/css-custom-properties.js";

const ROOT_PX = 16;

export interface ComputedStyleProbe {
  /** Every element, document order. */
  elements: Element[];
  /** The winning declaration's value for `prop`, with var() expanded; undefined when no rule sets it or it cannot resolve. */
  value(el: Element, prop: string): string | undefined;
  /** `value()` as px (calc evaluated); undefined when unset or not a plain length. */
  px(el: Element, prop: string): number | undefined;
  /** 1-based source line of the element's opening tag. */
  line(el: Element): number;
  /** Stable locator (html-dom's nodeRef). */
  ref(el: Element): string;
}

let cacheKey: string | undefined;
let cacheVal: ComputedStyleProbe | undefined;

/** Build (or reuse, for the same document string) the probe. Undefined when the document will not parse. */
export function computedStyleProbe(html: string): ComputedStyleProbe | undefined {
  if (cacheKey === html) return cacheVal;
  const parsed = parseHtml(html);
  let probe: ComputedStyleProbe | undefined;
  if (!parsed.degraded) {
    const cascade = buildCascade(parsed.doc, parsed.sheets, parsed.source);
    const els = elements(parsed.doc);
    const rootEl = els.find((e) => e.tagName === "html");
    const rootStyle: ComputedStyle | undefined = rootEl !== undefined ? cascade.byElement.get(rootEl) : undefined;
    const lineAt = lineIndexFor(parsed.source);
    const value = (el: Element, prop: string): string | undefined => {
      const raw = cascade.byElement.get(el)?.get(prop)?.value;
      if (raw === undefined) return undefined;
      return resolveVars(raw, el, cascade.byElement, rootStyle).value;
    };
    probe = {
      elements: els,
      value,
      px: (el, prop) => {
        const v = value(el, prop);
        return v === undefined ? undefined : evalLengthPx(v);
      },
      line: (el) => lineAt(el.startIndex ?? 0),
      ref: (el) => nodeRef(el),
    };
  }
  cacheKey = html;
  cacheVal = probe;
  return probe;
}

/**
 * The element's BASE utility classes: tokens with no variant prefix. A variant
 * (`md:`, `hover:`, `[&_svg]:`, `file:`, `data-[x]:`) applies under a condition or
 * to another node, so it is never evidence of the element's own default style.
 * A `:` inside an arbitrary-value bracket (`bg-[url(a:b)]`) is not a variant.
 */
export function baseClasses(el: Element): string[] {
  return (el.attribs["class"] ?? "").split(/\s+/).filter((t) => t !== "" && !hasVariantPrefix(t));
}

function hasVariantPrefix(token: string): boolean {
  let depth = 0;
  for (const ch of token) {
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") depth--;
    else if (ch === ":" && depth === 0) return true;
  }
  return false;
}

// ─── calc() evaluation ─────────────────────────────────────────────────────────

/** A dimensioned (px) or plain number during calc evaluation. */
type CalcVal = { px: number } | { n: number };

/** Evaluate a length value to px: `44px`, `2.75rem`, `calc(0.25rem * 11)`. Undefined when unknown. */
export function evalLengthPx(raw: string): number | undefined {
  const v = raw.trim().toLowerCase();
  if (v === "0") return 0;
  const tokens = tokenize(v);
  if (tokens === undefined) return undefined;
  let pos = 0;
  const peek = (): string | undefined => tokens[pos];
  const expr = (): CalcVal | undefined => {
    let left = term();
    while (left !== undefined && (peek() === "+" || peek() === "-")) {
      const op = tokens[pos++];
      const right = term();
      if (right === undefined || !("px" in left) || !("px" in right)) return undefined;
      left = { px: op === "+" ? left.px + right.px : left.px - right.px };
    }
    return left;
  };
  const term = (): CalcVal | undefined => {
    let left = factor();
    while (left !== undefined && (peek() === "*" || peek() === "/")) {
      const op = tokens[pos++];
      const right = factor();
      if (right === undefined) return undefined;
      if (op === "*") {
        if ("px" in left && "n" in right) left = { px: left.px * right.n };
        else if ("n" in left && "px" in right) left = { px: left.n * right.px };
        else if ("n" in left && "n" in right) left = { n: left.n * right.n };
        else return undefined;
      } else {
        if (!("n" in right) || right.n === 0) return undefined;
        left = "px" in left ? { px: left.px / right.n } : { n: left.n / right.n };
      }
    }
    return left;
  };
  const factor = (): CalcVal | undefined => {
    const t = tokens[pos++];
    if (t === undefined) return undefined;
    if (t === "calc(" || t === "(") {
      const inner = expr();
      if (tokens[pos++] !== ")") return undefined;
      return inner;
    }
    if (t === "-") {
      const f = factor();
      if (f === undefined) return undefined;
      return "px" in f ? { px: -f.px } : { n: -f.n };
    }
    const m = /^(\d*\.?\d+)(px|rem|em)?$/.exec(t);
    if (m === null) return undefined;
    const n = Number.parseFloat(m[1] as string);
    if (m[2] === undefined) return { n };
    return { px: m[2] === "px" ? n : n * ROOT_PX };
  };
  const out = expr();
  if (out === undefined || pos !== tokens.length || !("px" in out)) return undefined;
  return Math.round(out.px * 100) / 100;
}

/** Split a value into calc tokens; undefined on any function other than calc(). */
function tokenize(v: string): string[] | undefined {
  const out: string[] = [];
  const re = /\s*(calc\(|[a-z-]+\(|\(|\)|[+*/]|-(?=\s|\(|\d|\.)|\d*\.?\d+[a-z%]*)/gy;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(v)) !== null) {
    const t = m[1] as string;
    if (/^[a-z-]+\($/.test(t) && t !== "calc(") return undefined;
    out.push(t);
    last = re.lastIndex;
  }
  if (v.slice(last).trim() !== "") return undefined;
  return out;
}
