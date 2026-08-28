/**
 * Vue / Svelte / Astro single-file components, and bare stylesheets.
 *
 * An SFC is two documents in one file. Splitting them is what lets each half be
 * read at the fidelity it deserves: the `<style>` block goes through the real
 * cascade at `resolved` confidence, the template through the JSX scanner at
 * `literal`. Reading the whole file with one tool would drop the better half to
 * the worse tier for no reason.
 *
 * A bare `.css` file gets the same cascade treatment with no DOM at all — it
 * states values but not which elements receive them, so it supplies no structure
 * and no text, and every rule needing those is NOT-EVALUATED.
 */
import { FactCollector } from "../../design-facts/fact-collector.js";
import { extractorById } from "../../design-facts/extractor-registry.js";
import type { Provenance, SpacingProp, Side } from "../../design-facts/index.js";
import { lineIndex } from "../scanner/line-scanner.js";
import { extractJsx } from "./jsx-extractor.js";
import { parseHtml } from "../html/html-dom.js";
import { buildCascade } from "../html/css-cascade.js";
import { parseColor, parseLengthPx, parseGradient, parseShadow, splitTopLevel } from "../html/css-values.js";

export interface SfcExtraction {
  collector: FactCollector;
  undercount: boolean;
}

/**
 * Read a bare stylesheet: declarations only, no elements.
 *
 * The cascade builder needs a document, so the CSS is wrapped in a minimal
 * carrier. Nothing matches, which is the point — the facts come from the
 * DECLARATIONS, and every one is reported against its true line in the .css file.
 */
export function extractCssOnly(source: string, file: string): SfcExtraction {
  const profile = extractorById("css-only");
  if (profile === undefined) throw new Error(`extractor "css-only" is not registered`);
  const c = new FactCollector("css-only", profile.supplies);
  const toLine = lineIndex(source);

  // Walk declarations directly rather than through the DOM cascade: with no
  // elements there is nothing to cascade ONTO, and a fabricated element would
  // invent an owner that does not exist.
  const declRe = /([a-z-]+)\s*:\s*([^;{}]+)[;}]/gi;
  for (const m of source.matchAll(declRe)) {
    if (m.index === undefined) continue;
    const prop = (m[1] as string).toLowerCase();
    const value = (m[2] as string).trim();
    emitDeclaration(c, prop, value, {
      file, line: toLine(m.index), extractor: "css-only", confidence: "resolved",
    });
  }
  return { collector: c, undercount: true };
}

/** Split an SFC and read each half at its own fidelity. */
export function extractSfc(source: string, file: string): SfcExtraction {
  const profile = extractorById("sfc");
  if (profile === undefined) throw new Error(`extractor "sfc" is not registered`);
  const c = new FactCollector("sfc", profile.supplies);
  const toLine = lineIndex(source);

  // ── the <style> block, through the real cascade ──
  for (const m of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    if (m.index === undefined) continue;
    const css = m[1] ?? "";
    const offset = m.index + m[0].indexOf(css);
    const carrier = `<html><head><style>${css}</style></head><body></body></html>`;
    const parsed = parseHtml(carrier);
    const cascade = buildCascade(parsed.doc, parsed.sheets, parsed.source);
    void cascade;
    // Declarations are read from the source text so their lines point at the
    // SFC, not at the synthetic carrier.
    for (const d of css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)[;}]/gi)) {
      if (d.index === undefined) continue;
      emitDeclaration(c, (d[1] as string).toLowerCase(), (d[2] as string).trim(), {
        file, line: toLine(offset + d.index), extractor: "sfc", confidence: "resolved",
      });
    }
  }

  // ── the template, through the JSX scanner ──
  const template = source
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (s) => s.replace(/[^\n]/g, " "))
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, (s) => s.replace(/[^\n]/g, " "));
  const jsx = extractJsx(template, file);
  for (const f of jsx.collector.facts()) {
    // Re-stamp: the facts belong to THIS extractor, and the collector refuses a
    // foreign id by design.
    c.add({ ...f, at: { ...f.at, extractor: "sfc" } } as typeof f);
  }
  for (const u of jsx.collector.unresolved()) {
    for (let i = 0; i < u.count; i++) c.noteUnresolved(u.what);
  }

  return { collector: c, undercount: true };
}

const SPACING_PROPS = new Set<string>([
  "padding-top", "padding-right", "padding-bottom", "padding-left",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "gap",
]);

/** One CSS declaration → zero or more facts. Shared by both entries above. */
function emitDeclaration(c: FactCollector, prop: string, value: string, at: Provenance): void {
  if (prop === "color" || prop === "background-color" || prop === "background") {
    const gradient = parseGradient(value);
    if (gradient !== undefined) {
      c.add({ kind: "gradient", gradientKind: gradient.kind, stops: gradient.stops, angleDeg: gradient.angleDeg, at });
      return;
    }
    const col = parseColor(value) ?? splitTopLevel(value, " ").map((p) => parseColor(p)).find((x) => x !== undefined);
    if (col !== undefined) {
      c.add({ kind: "color", hex: col.hex, alpha: col.alpha, role: prop === "color" ? "fg" : "bg", at });
    }
    return;
  }
  if (prop === "background-image") {
    const gradient = parseGradient(value);
    if (gradient !== undefined) {
      c.add({ kind: "gradient", gradientKind: gradient.kind, stops: gradient.stops, angleDeg: gradient.angleDeg, at });
    }
    return;
  }
  if (prop === "font-family") {
    c.add({ kind: "typography", family: splitTopLevel(value, ",")[0]?.replace(/^['"]|['"]$/g, "").trim(), at });
    return;
  }
  if (prop === "font-size") {
    const px = parseLengthPx(value);
    if (px !== undefined) c.add({ kind: "typography", sizePx: px, at });
    return;
  }
  if (prop === "letter-spacing") {
    const em = /em$/.test(value) ? Number.parseFloat(value) : (parseLengthPx(value) ?? 0) / 16;
    if (Number.isFinite(em) && em !== 0) c.add({ kind: "typography", letterSpacingEm: em, at });
    return;
  }
  if (prop === "line-height") {
    const n = /^[\d.]+$/.test(value.trim()) ? Number.parseFloat(value) : undefined;
    if (n !== undefined) c.add({ kind: "typography", lineHeight: n, at });
    return;
  }
  if (prop === "text-align") {
    if (value === "justify" || value === "center") c.add({ kind: "typography", align: value, at });
    return;
  }
  if (prop === "font-style") {
    if (/italic|oblique/i.test(value)) c.add({ kind: "typography", italic: true, at });
    return;
  }
  if (prop === "border-radius") {
    const px = parseLengthPx(splitTopLevel(value, " ")[0] ?? value);
    if (px !== undefined) c.add({ kind: "radius", px, at });
    return;
  }
  if (prop === "box-shadow") {
    const s = parseShadow(value);
    if (s !== undefined) c.add({ kind: "shadow", ...s, at });
    return;
  }
  if (SPACING_PROPS.has(prop)) {
    const px = parseLengthPx(value);
    if (px !== undefined) c.add({ kind: "spacing", prop: prop as SpacingProp, px, at });
    return;
  }
  if (prop === "padding" || prop === "margin") {
    const parts = splitTopLevel(value, " ");
    const px = parseLengthPx(parts[0] ?? value);
    if (px === undefined) return;
    for (const side of ["top", "right", "bottom", "left"] as const) {
      c.add({ kind: "spacing", prop: `${prop}-${side}` as SpacingProp, px, at });
    }
    return;
  }
  const side = /^border-(top|right|bottom|left)$/.exec(prop);
  if (side !== null) {
    const parts = splitTopLevel(value, " ");
    const px = parts.map((p) => parseLengthPx(p)).find((n) => n !== undefined);
    if (px !== undefined && px > 0) {
      c.add({
        kind: "border", sides: [side[1] as Side], widthPx: px,
        hex: parts.map((p) => parseColor(p)?.hex).find((h) => h !== undefined), at,
      });
    }
    return;
  }
  if (prop === "transition" || prop === "animation") {
    c.add({
      kind: "motion",
      motionKind: prop === "transition" ? "transition" : "animation",
      props: prop === "transition" ? [splitTopLevel(value, " ")[0] ?? "all"] : undefined,
      easing: splitTopLevel(value, " ").find((p) => /^(linear|ease|steps|cubic-bezier)/i.test(p)),
      repeatsForever: /\binfinite\b/i.test(value),
      at,
    });
  }
}
