/**
 * The reference-fidelity extractor: resolved cascade → DesignFacts.
 *
 * Every other extractor is measured against what this one can see. It is the
 * only one that emits at `resolved` confidence, and the only one that can
 * answer a question like "what colour is this text actually painted on".
 *
 * Degrade and say so: when the document will not parse, or when a stylesheet
 * exists but was deliberately not fetched, the result carries `degraded` and a
 * reason. Callers print `DEGRADED — findings are an undercount, not a clean
 * bill of health`, because a zero from a half-read document is a claim nobody
 * has earned.
 */
import type { Element } from "domhandler";
import { FactCollector } from "../../design-facts/fact-collector.js";
import { extractorById } from "../../design-facts/extractor-registry.js";
import type { Provenance, Side, SpacingProp } from "../../design-facts/index.js";
import { parseHtml, elements, lineIndexFor, lineOfElementIndexed, nodeRef, textOf } from "./html-dom.js";
import { buildCascade } from "./css-cascade.js";
import type { ComputedStyle } from "./css-cascade.js";
import { resolveVars } from "./css-custom-properties.js";
import { parseColor, parseLengthPx, parseGradient, parseShadow, splitTopLevel } from "./css-values.js";

const EXTRACTOR_ID = "html-cascade";

export interface HtmlExtraction {
  collector: FactCollector;
  degraded: boolean;
  degradeReason?: string;
  /** Stylesheets present but not fetched — the document was only partly seen. */
  unresolvedSheets: string[];
  /** Element → nodeRef, so rules can name what they found. */
  refs: Map<Element, string>;
}

/** Parse and walk an HTML document into DesignFacts. Never throws. */
export function extractHtml(html: string, file: string): HtmlExtraction {
  const profile = extractorById(EXTRACTOR_ID);
  if (profile === undefined) throw new Error(`extractor "${EXTRACTOR_ID}" is not registered`);
  const collector = new FactCollector(EXTRACTOR_ID, profile.supplies);

  const parsed = parseHtml(html, file);
  const refs = new Map<Element, string>();
  if (parsed.degraded) {
    return {
      collector,
      degraded: true,
      degradeReason: parsed.degradeReason,
      unresolvedSheets: parsed.unresolvedSheets,
      refs,
    };
  }

  const lineAt = lineIndexFor(parsed.source);
  const cascade = buildCascade(parsed.doc, parsed.sheets, parsed.source);
  const els = elements(parsed.doc);
  const rootEl = els.find((e) => e.tagName === "html");
  const rootStyle = rootEl !== undefined ? cascade.byElement.get(rootEl) : undefined;

  const at = (el: Element, line?: number): Provenance => ({
    file,
    line: line ?? lineOfElementIndexed(lineAt, el),
    extractor: EXTRACTOR_ID,
    confidence: "resolved",
    nodeRef: nodeRef(el),
  });

  const depthOf = new Map<Element, number>();
  for (const el of els) {
    const parent = el.parent as Element | null;
    depthOf.set(el, parent !== null && depthOf.has(parent) ? (depthOf.get(parent) as number) + 1 : 0);
  }

  for (const el of els) {
    const tag = el.tagName.toLowerCase();
    if (tag === "style" || tag === "script") continue;

    const ref = nodeRef(el);
    refs.set(el, ref);
    const style = cascade.byElement.get(el);

    emitStructure(collector, el, ref, depthOf.get(el) ?? 0, at(el));
    emitText(collector, el, tag, at(el));
    if (style !== undefined) {
      emitFromStyle(collector, el, style, cascade.byElement, rootStyle, at);
    }
  }

  // A page can carry its whole design in utility classes and no stylesheet at
  // all — `class="bg-[#F0F6FF] border-b text-[11px]"` with a Tailwind CDN script.
  // This extractor cannot see any of it. Saying nothing would turn "I could not
  // read this page" into "this page is clean", so the gap is counted and named.
  if (parsed.sheets.length === 0) {
    let utilityClasses = 0;
    for (const el of els) {
      const cls = el.attribs["class"];
      if (cls !== undefined && cls.trim() !== "") utilityClasses += cls.trim().split(/\s+/).length;
    }
    if (utilityClasses > 0) {
      for (let i = 0; i < utilityClasses; i++) {
        collector.noteUnresolved("class-based styling (no stylesheet; needs the utility-class extractor)");
      }
    }
  }

  return {
    collector,
    degraded: false,
    unresolvedSheets: parsed.unresolvedSheets,
    refs,
  };
}

function emitStructure(
  c: FactCollector,
  el: Element,
  ref: string,
  depth: number,
  at: Provenance,
): void {
  const classes = (el.attribs["class"] ?? "").split(/\s+/).filter(Boolean);
  const roles: string[] = [];
  // A name CLAIMS a role; role-synthesis decides. `card` is deliberately absent
  // here: the regex matched `card-title` and `card-desc`, so a card's own title
  // counted as a nested card. Card-ness is now proved from surface facts.
  
  if (classes.some((k) => /(^|-)(icon|glyph)($|-)/i.test(k))) roles.push("icon");
  if (el.tagName === "section" || classes.some((k) => /(^|-)section($|-)/i.test(k))) roles.push("section");
  const parent = el.parent as Element | null;
  c.add({
    kind: "structure",
    node: el.tagName,
    depth,
    ref,
    parentRef: parent !== null && parent.type === "tag" ? nodeRef(parent) : undefined,
    roles: roles.length > 0 ? roles : undefined,
    at,
  });
}

const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const LABELISH = new Set(["label", "button", "th", "figcaption", "legend", "summary"]);

function emitText(c: FactCollector, el: Element, tag: string, at: Provenance): void {
  // Own text only: a wrapper must not claim its children's copy as its own.
  const own = el.children
    .filter((n) => n.type === "text")
    .map((n) => (n as unknown as { data: string }).data)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (own === "") return;
  const role = HEADINGS.has(tag) ? "heading" : LABELISH.has(tag) ? "label" : "body";
  c.add({
    kind: "text",
    content: own === textOf(el) ? own : own,
    role,
    level: HEADINGS.has(tag) ? Number(tag.slice(1)) : undefined,
    at,
  });
}

const SIDE_PROPS: Array<[string, Side]> = [
  ["border-top", "top"],
  ["border-right", "right"],
  ["border-bottom", "bottom"],
  ["border-left", "left"],
];

const SPACING_PROPS: SpacingProp[] = [
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "gap",
];

/** Read one declaration with `var()` resolved, or note it unresolved. */
function readProp(
  c: FactCollector,
  style: ComputedStyle,
  prop: string,
  el: Element,
  byElement: Map<Element, ComputedStyle>,
  rootStyle: ComputedStyle | undefined,
): { value: string; line: number } | undefined {
  const decl = style.get(prop);
  if (decl === undefined) return undefined;
  const res = resolveVars(decl.value, el, byElement, rootStyle);
  if (res.value === undefined) {
    for (const name of res.unresolved) c.noteUnresolved(`unresolved ${name}`);
    return undefined;
  }
  return { value: res.value, line: decl.line };
}

function emitFromStyle(
  c: FactCollector,
  el: Element,
  style: ComputedStyle,
  byElement: Map<Element, ComputedStyle>,
  rootStyle: ComputedStyle | undefined,
  at: (el: Element, line?: number) => Provenance,
): void {
  const read = (p: string): { value: string; line: number } | undefined =>
    readProp(c, style, p, el, byElement, rootStyle);
  let emittedBg = false;

  // ── colours ──
  // `background: #7c3aed` is how stylesheets are actually written; reading only
  // `background-color` misses it, and with it the whole contrast pair.
  for (const [prop, role] of [
    ["color", "fg"], ["background-color", "bg"], ["background", "bg"], ["border-color", "border"],
  ] as const) {
    const d = read(prop);
    if (d === undefined) continue;
    // The shorthand may carry an image/gradient too; take the first component
    // that parses as a colour, never the whole string blindly.
    const col = parseColor(d.value) ?? splitTopLevel(d.value, " ").map((p) => parseColor(p)).find((x) => x !== undefined);
    if (col === undefined) continue;
    // Don't emit the same role twice for one element (shorthand + longhand).
    if (role === "bg" && emittedBg) continue;
    if (role === "bg") emittedBg = true;
    c.add({ kind: "color", hex: col.hex, alpha: col.alpha, role, at: at(el, d.line) });
  }

  // ── gradients (background / background-image) ──
  for (const prop of ["background-image", "background"]) {
    const d = read(prop);
    if (d === undefined) continue;
    const g = parseGradient(d.value);
    if (g !== undefined) {
      c.add({ kind: "gradient", gradientKind: g.kind, stops: g.stops, angleDeg: g.angleDeg, at: at(el, d.line) });
      break;
    }
  }

  // ── typography ──
  const family = read("font-family");
  const size = read("font-size");
  const weight = read("font-weight");
  const lh = read("line-height");
  const ls = read("letter-spacing");
  const transform = read("text-transform");
  const align = read("text-align");
  const fontStyle = read("font-style");
  if (
    family !== undefined || size !== undefined || weight !== undefined ||
    lh !== undefined || ls !== undefined || transform !== undefined ||
    align !== undefined || fontStyle !== undefined
  ) {
    const sizePx = size !== undefined ? parseLengthPx(size.value) : undefined;
    const lhRaw = lh !== undefined ? lh.value.trim() : undefined;
    const lhNum =
      lhRaw === undefined ? undefined
        : /^[\d.]+$/.test(lhRaw) ? Number(lhRaw)
          : sizePx !== undefined ? (parseLengthPx(lhRaw) ?? NaN) / sizePx
            : undefined;
    const lsPx = ls !== undefined ? parseLengthPx(ls.value) : undefined;
    c.add({
      kind: "typography",
      family: family !== undefined ? splitTopLevel(family.value, ",")[0]?.replace(/^['"]|['"]$/g, "").trim() : undefined,
      sizePx,
      weight: weight !== undefined ? weightNumber(weight.value) : undefined,
      lineHeight: lhNum !== undefined && Number.isFinite(lhNum) ? lhNum : undefined,
      letterSpacingEm:
        lsPx !== undefined && sizePx !== undefined && sizePx > 0 ? lsPx / sizePx
          : ls !== undefined && /em$/.test(ls.value.trim()) ? Number.parseFloat(ls.value) : undefined,
      transform: transform !== undefined ? (transform.value.trim() as never) : undefined,
      align: align !== undefined ? alignValue(align.value) : undefined,
      italic: fontStyle !== undefined ? /italic|oblique/i.test(fontStyle.value) : undefined,
      at: at(el, (size ?? family ?? weight ?? lh ?? ls ?? transform ?? align ?? fontStyle)?.line),
    });
  }

  // ── spacing ──
  for (const prop of SPACING_PROPS) {
    const d = read(prop);
    if (d === undefined) continue;
    const px = parseLengthPx(d.value);
    if (px !== undefined) c.add({ kind: "spacing", prop, px, at: at(el, d.line) });
  }

  // ── radius ──
  const radius = read("border-radius");
  if (radius !== undefined) {
    const px = parseLengthPx(splitTopLevel(radius.value, " ")[0] ?? radius.value);
    if (px !== undefined) c.add({ kind: "radius", px, at: at(el, radius.line) });
  }

  // ── borders, per side (the fact that makes `side-tab` expressible) ──
  const sides: Side[] = [];
  let widthPx: number | undefined;
  let borderHex: string | undefined;
  let borderLine: number | undefined;
  for (const [prop, side] of SIDE_PROPS) {
    const d = read(prop) ?? read(`${prop}-width`);
    if (d === undefined) continue;
    const parts = splitTopLevel(d.value, " ");
    const w = parts.map((p) => parseLengthPx(p)).find((n) => n !== undefined);
    if (w === undefined || w <= 0) continue;
    sides.push(side);
    widthPx = w;
    borderLine = d.line;
    borderHex ??= parts.map((p) => parseColor(p)?.hex).find((h) => h !== undefined);
  }
  if (sides.length === 0) {
    const all = read("border") ?? read("border-width");
    if (all !== undefined) {
      const parts = splitTopLevel(all.value, " ");
      const w = parts.map((p) => parseLengthPx(p)).find((n) => n !== undefined);
      if (w !== undefined && w > 0) {
        sides.push("top", "right", "bottom", "left");
        widthPx = w;
        borderLine = all.line;
        borderHex = parts.map((p) => parseColor(p)?.hex).find((h) => h !== undefined);
      }
    }
  }
  if (sides.length > 0 && widthPx !== undefined) {
    c.add({ kind: "border", sides, widthPx, hex: borderHex, at: at(el, borderLine) });
  }

  // ── shadow ──
  const shadow = read("box-shadow");
  if (shadow !== undefined) {
    const s = parseShadow(shadow.value);
    if (s !== undefined) c.add({ kind: "shadow", ...s, at: at(el, shadow.line) });
  }

  // ── motion ──
  const transition = read("transition") ?? read("transition-property");
  if (transition !== undefined) {
    const parts = splitTopLevel(transition.value, " ");
    c.add({
      kind: "motion",
      motionKind: "transition",
      props: [parts[0] ?? "all"],
      durationMs: parts.map((p) => durationMs(p)).find((n) => n !== undefined),
      easing: parts.find((p) => /^(linear|ease|ease-in|ease-out|ease-in-out|steps|cubic-bezier)/i.test(p)),
      at: at(el, transition.line),
    });
  }
  const animation = read("animation") ?? read("animation-name");
  if (animation !== undefined) {
    c.add({
      kind: "motion",
      motionKind: "animation",
      durationMs: splitTopLevel(animation.value, " ").map((p) => durationMs(p)).find((n) => n !== undefined),
      easing: splitTopLevel(animation.value, " ").find((p) => /^(linear|ease|steps|cubic-bezier)/i.test(p)),
      repeatsForever: /\binfinite\b/i.test(animation.value),
      at: at(el, animation.line),
    });
  }
}

const NAMED_WEIGHTS: Record<string, number> = { normal: 400, bold: 700, lighter: 300, bolder: 700 };
function weightNumber(raw: string): number | undefined {
  const t = raw.trim().toLowerCase();
  if (NAMED_WEIGHTS[t] !== undefined) return NAMED_WEIGHTS[t];
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : undefined;
}

function alignValue(raw: string): "start" | "center" | "end" | "justify" | undefined {
  const t = raw.trim().toLowerCase();
  if (t === "justify") return "justify";
  if (t === "center") return "center";
  if (t === "left" || t === "start") return "start";
  if (t === "right" || t === "end") return "end";
  return undefined;
}

function durationMs(token: string): number | undefined {
  const m = /^([\d.]+)(ms|s)$/i.exec(token.trim());
  if (m === null) return undefined;
  const n = Number.parseFloat(m[1] as string);
  return m[2]?.toLowerCase() === "s" ? n * 1000 : n;
}
