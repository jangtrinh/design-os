/**
 * JSX/TSX → DesignFacts, at `literal` confidence.
 *
 * Reads three things and refuses the fourth:
 *  - `className="…"` string literals, through the Tailwind resolver;
 *  - `style={{ … }}` object literals;
 *  - element tags, for a `heuristic`-tier structure signal;
 *  - `className={cn(base, isActive && "border-l-4")}` — UNRESOLVABLE. A guess
 *    here is a finding about a component that never renders that way.
 *
 * `structure` is supplied at `heuristic` confidence only: JSX nesting is real
 * but a line scanner reads it by brace counting, which is wrong the moment a
 * component is extracted into another file. Rules needing exact nesting get a
 * heuristic answer and the coverage matrix says so.
 */
import { FactCollector } from "../../design-facts/fact-collector.js";
import { extractorById } from "../../design-facts/extractor-registry.js";
import type { Provenance, SpacingProp, Side } from "../../design-facts/index.js";
import { stripNoise, lineIndex, scan, num, UNRESOLVABLE } from "../scanner/line-scanner.js";
import { resolveClass, looksLikeUtility } from "./tailwind-resolver.js";
import { parseColor, parseLengthPx } from "../html/css-values.js";

const EXTRACTOR_ID = "jsx-tailwind";

export interface JsxExtraction {
  collector: FactCollector;
  undercount: true;
}

export function extractJsx(source: string, file: string): JsxExtraction {
  const profile = extractorById(EXTRACTOR_ID);
  if (profile === undefined) throw new Error(`extractor "${EXTRACTOR_ID}" is not registered`);
  const c = new FactCollector(EXTRACTOR_ID, profile.supplies);

  const toLine = lineIndex(source);
  const code = stripNoise(source);
  const at = (line: number): Provenance => ({ file, line, extractor: EXTRACTOR_ID, confidence: "literal" });

  // ── className string literals ──
  // Read from RAW source: stripNoise blanks string bodies, and the class list IS
  // the string body.
  for (const h of scan(source, /class(?:Name)?\s*=\s*"([^"]*)"|class(?:Name)?\s*=\s*'([^']*)'/g, toLine)) {
    const classes = (h.value[1] ?? h.value[2] ?? "").split(/\s+/).filter(Boolean);
    emitClasses(c, classes, at(h.line));
  }

  // A className that is an EXPRESSION cannot be read. Count it; guess nothing.
  for (let i = 0; i < scan(code, /class(?:Name)?\s*=\s*\{/g, toLine).length; i++) {
    c.noteUnresolved(UNRESOLVABLE.computed);
  }

  // ── style={{ ... }} object literals ──
  for (const h of scan(source, /style\s*=\s*\{\{([^}]*)\}\}/g, toLine)) {
    for (const pair of (h.value[1] ?? "").split(",")) {
      const kv = /([A-Za-z]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|([\d.]+))/.exec(pair);
      if (kv === null) continue;
      const prop = kebab(kv[1] as string);
      const value = kv[2] ?? kv[3] ?? kv[4];
      if (value === undefined) continue;
      emitStyleProp(c, prop, value, at(h.line));
    }
  }

  // ── styled-components / template CSS ──
  for (const h of scan(source, /styled\.[a-z]+`([\s\S]*?)`/g, toLine)) {
    const body = h.value[1] ?? "";
    if (/\$\{/.test(body)) c.noteUnresolved(UNRESOLVABLE.interpolation);
    for (const decl of body.split(";")) {
      const kv = /([a-z-]+)\s*:\s*([^;]+)/.exec(decl);
      if (kv === null) continue;
      emitStyleProp(c, (kv[1] as string).trim(), (kv[2] as string).trim(), at(h.line));
    }
  }

  // ── structure, at heuristic confidence ──
  let depth = 0;
  for (const h of scan(code, /<([A-Za-z][\w.]*)(\s|\/|>)|<\/([A-Za-z][\w.]*)>/g, toLine)) {
    const open = h.value[1];
    const close = h.value[3];
    if (close !== undefined) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (open === undefined) continue;
    c.add({
      kind: "structure",
      node: open,
      depth,
      ref: `${open}@${h.line}`,
      at: { ...at(h.line), confidence: "heuristic" },
    });
    if (h.value[2] !== "/") depth++;
  }

  // ── text content between tags ──
  for (const h of scan(source, />([^<>{}\n]{4,})</g, toLine)) {
    const content = (h.value[1] ?? "").trim();
    if (content === "" || /^[\s|,.]+$/.test(content)) continue;
    c.add({ kind: "text", content, role: "unknown", at: at(h.line) });
  }

  return { collector: c, undercount: true };
}

function kebab(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function emitClasses(c: FactCollector, classes: readonly string[], at: Provenance): void {
  const sides: Side[] = [];
  let borderWidth: number | undefined;

  for (const token of classes) {
    const resolved = resolveClass(token);
    if (resolved.length === 0) {
      // A token that LOOKS like a utility but resolved to nothing is a scale or
      // palette entry this resolver does not carry. Counting it keeps the report
      // honest about what it could not read.
      if (looksLikeUtility(token)) c.noteUnresolved(`unmapped utility "${token}"`);
      continue;
    }
    for (const r of resolved) {
      switch (r.kind) {
        case "spacing":
          if (r.value !== undefined && r.prop !== undefined) {
            c.add({ kind: "spacing", prop: r.prop as SpacingProp, px: r.value, at });
          }
          break;
        case "radius":
          if (r.value !== undefined) c.add({ kind: "radius", px: r.value, at });
          break;
        case "fontSize":
          if (r.value !== undefined) c.add({ kind: "typography", sizePx: r.value, at });
          break;
        case "weight":
          if (r.value !== undefined) c.add({ kind: "typography", weight: r.value, at });
          break;
        case "tracking":
          if (r.value !== undefined) c.add({ kind: "typography", letterSpacingEm: r.value, at });
          break;
        case "leading":
          if (r.value !== undefined) c.add({ kind: "typography", lineHeight: r.value, at });
          break;
        case "align":
          if (r.text !== undefined) c.add({ kind: "typography", align: r.text as never, at });
          break;
        case "italic":
          c.add({ kind: "typography", italic: true, at });
          break;
        case "color":
          if (r.hex !== undefined && r.role !== undefined) c.add({ kind: "color", hex: r.hex, role: r.role, at });
          break;
        case "borderWidth":
          if (r.value !== undefined && r.sides !== undefined) {
            borderWidth = r.value;
            for (const s of r.sides) if (!sides.includes(s)) sides.push(s);
          }
          break;
      }
    }
  }

  // One border fact per element, carrying every side the classes named — this is
  // what makes `border-l-4 rounded-2xl` readable as a side-tab.
  if (sides.length > 0 && borderWidth !== undefined) {
    c.add({ kind: "border", sides, widthPx: borderWidth, at });
  }
}

const SPACING_PROPS = new Set<string>([
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "gap",
]);

function emitStyleProp(c: FactCollector, prop: string, raw: string, at: Provenance): void {
  const value = raw.replace(/^["']|["']$/g, "").trim();

  if (prop === "color" || prop === "background-color" || prop === "background") {
    const col = parseColor(value);
    if (col !== undefined) {
      c.add({ kind: "color", hex: col.hex, alpha: col.alpha, role: prop === "color" ? "fg" : "bg", at });
    }
    return;
  }
  if (prop === "font-family") {
    c.add({ kind: "typography", family: value.split(",")[0]?.replace(/^['"]|['"]$/g, "").trim(), at });
    return;
  }
  if (prop === "font-size") {
    const px = parseLengthPx(value) ?? num(value);
    if (px !== undefined) c.add({ kind: "typography", sizePx: px, at });
    return;
  }
  if (prop === "text-align") {
    if (value === "justify" || value === "center") c.add({ kind: "typography", align: value, at });
    return;
  }
  if (prop === "border-radius") {
    const px = parseLengthPx(value) ?? num(value);
    if (px !== undefined) c.add({ kind: "radius", px, at });
    return;
  }
  if (SPACING_PROPS.has(prop)) {
    const px = parseLengthPx(value) ?? num(value);
    if (px !== undefined) c.add({ kind: "spacing", prop: prop as SpacingProp, px, at });
    return;
  }
  const side = /^border-(top|right|bottom|left)(?:-width)?$/.exec(prop);
  if (side !== null) {
    const px = parseLengthPx(value.split(/\s+/)[0] ?? value) ?? num(value);
    if (px !== undefined && px > 0) c.add({ kind: "border", sides: [side[1] as Side], widthPx: px, at });
  }
}
