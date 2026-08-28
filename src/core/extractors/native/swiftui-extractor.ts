/**
 * SwiftUI → DesignFacts, at `literal` confidence.
 *
 * SwiftUI states its design in modifiers whose arguments are usually literals:
 * `.font(.system(size: 13))`, `.cornerRadius(16)`, `.padding(16)`. A scanner
 * reads those exactly. It cannot follow `Color.brand` into a theme file or a
 * `let` binding, and it says so rather than guessing.
 *
 * Platform default: SF. A SwiftUI view that declares no font is using a SYSTEM
 * face, which is not a choice made badly — so this extractor emits no typography
 * family when none is declared, and `overused-font` correctly stays silent. The
 * Flutter extractor does the opposite, because Flutter's default IS Roboto.
 *
 * Output is an acknowledged UNDERCOUNT. Structure is not supplied at all: view
 * nesting is expressible in Swift but not readable from a line scan, so every
 * nesting and rhythm rule is NOT-EVALUATED rather than guessed.
 */
import { FactCollector } from "../../design-facts/fact-collector.js";
import { extractorById } from "../../design-facts/extractor-registry.js";
import type { Provenance, Side } from "../../design-facts/index.js";
import { stripNoise, lineIndex, scan, num, hex6, unitRgbToHex, UNRESOLVABLE } from "../scanner/line-scanner.js";

const EXTRACTOR_ID = "swiftui";

export interface ScanExtraction {
  collector: FactCollector;
  undercount: true;
}

/** Named SwiftUI colours that map to a concrete hex. */
const NAMED: Record<string, string> = {
  purple: "af52de", indigo: "5856d6", blue: "007aff", teal: "30b0c7",
  green: "34c759", red: "ff3b30", orange: "ff9500", pink: "ff2d55",
  black: "000000", white: "ffffff", gray: "8e8e93", grey: "8e8e93",
};

export function extractSwiftUi(source: string, file: string): ScanExtraction {
  const profile = extractorById(EXTRACTOR_ID);
  if (profile === undefined) throw new Error(`extractor "${EXTRACTOR_ID}" is not registered`);
  const c = new FactCollector(EXTRACTOR_ID, profile.supplies);

  const toLine = lineIndex(source);
  // Strings keep their quotes but lose their bodies, so a font name has to be
  // read from the RAW source; everything else reads from the stripped copy so a
  // commented-out modifier never counts.
  const code = stripNoise(source);
  const at = (line: number): Provenance => ({ file, line, extractor: EXTRACTOR_ID, confidence: "literal" });

  // ── typography ──
  for (const h of scan(source, /\.custom\(\s*"([^"]+)"\s*,\s*size:\s*([\d.]+)/g, toLine)) {
    c.add({ kind: "typography", family: h.value[1], sizePx: num(h.value[2]), at: at(h.line) });
  }
  for (const h of scan(code, /\.font\(\s*\.system\(\s*size:\s*([\d.]+)(?:\s*,\s*weight:\s*\.(\w+))?/g, toLine)) {
    // No family: SF is the system face, and a system face is not an overused choice.
    c.add({ kind: "typography", sizePx: num(h.value[1]), weight: weightOf(h.value[2]), at: at(h.line) });
  }
  for (const h of scan(code, /\.(?:tracking|kerning)\(\s*(-?[\d.]+)/g, toLine)) {
    const px = num(h.value[1]);
    // SwiftUI tracking is points, not em; without a size on the same line it is
    // not convertible, so report nothing rather than a wrong ratio.
    if (px !== undefined) c.add({ kind: "typography", letterSpacingEm: px / 16, at: at(h.line) });
  }
  for (const h of scan(code, /\.multilineTextAlignment\(\s*\.(\w+)/g, toLine)) {
    const a = h.value[1];
    if (a === "center") c.add({ kind: "typography", align: "center", at: at(h.line) });
    else if (a === "leading") c.add({ kind: "typography", align: "start", at: at(h.line) });
    else if (a === "trailing") c.add({ kind: "typography", align: "end", at: at(h.line) });
  }
  for (const h of scan(code, /\.italic\(\)/g, toLine)) {
    c.add({ kind: "typography", italic: true, at: at(h.line) });
  }

  // ── colour ──
  for (const h of scan(source, /Color\(\s*hex:\s*"(#?[0-9A-Fa-f]{3,8})"/g, toLine)) {
    const hex = hex6(h.value[1] as string);
    if (hex !== undefined) c.add({ kind: "color", hex, role: "bg", at: at(h.line) });
  }
  for (const h of scan(code, /Color\(\s*red:\s*([\d.]+)\s*,\s*green:\s*([\d.]+)\s*,\s*blue:\s*([\d.]+)/g, toLine)) {
    const [r, g, b] = [num(h.value[1]), num(h.value[2]), num(h.value[3])];
    if (r !== undefined && g !== undefined && b !== undefined) {
      c.add({ kind: "color", hex: unitRgbToHex(r, g, b), role: "bg", at: at(h.line) });
    }
  }
  for (const h of scan(code, /\.foregroundColor\(\s*\.?(\w+)/g, toLine)) {
    const hex = NAMED[(h.value[1] ?? "").toLowerCase()];
    if (hex !== undefined) c.add({ kind: "color", hex, role: "fg", at: at(h.line) });
    else c.noteUnresolved(UNRESOLVABLE.variable);
  }
  for (const h of scan(code, /Color\(\s*white:\s*([\d.]+)/g, toLine)) {
    const w = num(h.value[1]);
    if (w !== undefined) c.add({ kind: "color", hex: unitRgbToHex(w, w, w), role: "fg", at: at(h.line) });
  }

  // ── gradient ──
  for (const h of scan(source, /(Linear|Radial|Angular)Gradient\((?:[\s\S]{0,200}?)colors:\s*\[([^\]]*)\]/g, toLine)) {
    const stops: Array<{ hex: string }> = [];
    for (const tok of (h.value[2] ?? "").split(",")) {
      const named = /\.(\w+)/.exec(tok);
      const literal = /"(#?[0-9A-Fa-f]{3,8})"/.exec(tok);
      const hex = literal !== null ? hex6(literal[1] as string) : NAMED[(named?.[1] ?? "").toLowerCase()];
      if (hex !== undefined) stops.push({ hex });
    }
    if (stops.length > 0) {
      const kind = h.value[1] === "Radial" ? "radial" : h.value[1] === "Angular" ? "conic" : "linear";
      c.add({ kind: "gradient", gradientKind: kind, stops, at: at(h.line) });
    }
  }

  // ── radius ──
  for (const h of scan(code, /\.cornerRadius\(\s*([\d.]+)|RoundedRectangle\(\s*cornerRadius:\s*([\d.]+)/g, toLine)) {
    const px = num(h.value[1] ?? h.value[2]);
    if (px !== undefined) c.add({ kind: "radius", px, at: at(h.line) });
  }
  for (const h of scan(code, /Circle\(\)/g, toLine)) {
    c.add({ kind: "radius", px: 999, at: at(h.line) });
  }

  // ── spacing ──
  for (const h of scan(code, /\.padding\(\s*([\d.]+)\s*\)/g, toLine)) {
    const px = num(h.value[1]);
    if (px === undefined) continue;
    for (const prop of ["padding-top", "padding-right", "padding-bottom", "padding-left"] as const) {
      c.add({ kind: "spacing", prop, px, at: at(h.line) });
    }
  }
  for (const h of scan(code, /\b(?:VStack|HStack|LazyVStack|LazyHStack)\(\s*(?:alignment:\s*\.\w+\s*,\s*)?spacing:\s*([\d.]+)/g, toLine)) {
    const px = num(h.value[1]);
    if (px !== undefined) c.add({ kind: "spacing", prop: "gap", px, at: at(h.line) });
  }

  // ── border: an overlay strip pinned to one edge is SwiftUI's side-tab ──
  for (const h of scan(
    code,
    /\.overlay\((?:[\s\S]{0,160}?)frame\(\s*width:\s*([\d.]+)(?:[\s\S]{0,160}?)alignment:\s*\.(leading|trailing|top|bottom)/g,
    toLine,
  )) {
    const widthPx = num(h.value[1]);
    const side = sideOf(h.value[2]);
    if (widthPx !== undefined && side !== undefined) {
      c.add({ kind: "border", sides: [side], widthPx, at: at(h.line) });
    }
  }
  for (const h of scan(code, /\.border\(\s*[^,)]+,\s*width:\s*([\d.]+)/g, toLine)) {
    const widthPx = num(h.value[1]);
    if (widthPx !== undefined) {
      c.add({ kind: "border", sides: ["top", "right", "bottom", "left"], widthPx, at: at(h.line) });
    }
  }

  // ── shadow ──
  for (const h of scan(code, /\.shadow\((?:color:\s*[^,]*,\s*)?radius:\s*([\d.]+)(?:\s*,\s*x:\s*(-?[\d.]+))?(?:\s*,\s*y:\s*(-?[\d.]+))?/g, toLine)) {
    const blurPx = num(h.value[1]);
    if (blurPx !== undefined) {
      c.add({
        kind: "shadow",
        offsetXPx: num(h.value[2]) ?? 0,
        offsetYPx: num(h.value[3]) ?? 0,
        blurPx,
        at: at(h.line),
      });
    }
  }

  // ── motion ──
  for (const h of scan(code, /\.animation\(([^)]*(?:\([^)]*\))?[^)]*)\)/g, toLine)) {
    const body = h.value[1] ?? "";
    c.add({
      kind: "motion",
      motionKind: "animation",
      easing: /spring|bouncy|interpolatingSpring/.test(body) ? "spring" : /easeInOut|easeIn|easeOut|linear/.exec(body)?.[0],
      repeatsForever: /repeatForever/.test(body),
      durationMs: (num(/duration:\s*([\d.]+)/.exec(body)?.[1]) ?? 0) * 1000 || undefined,
      at: at(h.line),
    });
  }

  // ── text ──
  for (const h of scan(source, /Text\(\s*"([^"]+)"/g, toLine)) {
    c.add({ kind: "text", content: h.value[1] as string, role: "unknown", at: at(h.line) });
  }

  // ── what could not be followed ──
  for (let i = 0; i < scan(code, /\b(?:Color|Font)\.\s*[A-Z]\w+/g, toLine).length; i++) c.noteUnresolved(UNRESOLVABLE.themeLookup);
  for (let i = 0; i < scan(code, /\?\s*[^:]+\s*:/g, toLine).length; i++) c.noteUnresolved(UNRESOLVABLE.conditional);

  return { collector: c, undercount: true };
}

function sideOf(raw: string | undefined): Side | undefined {
  switch (raw) {
    case "leading": return "left";
    case "trailing": return "right";
    case "top": return "top";
    case "bottom": return "bottom";
    default: return undefined;
  }
}

const WEIGHTS: Record<string, number> = {
  ultraLight: 100, thin: 200, light: 300, regular: 400,
  medium: 500, semibold: 600, bold: 700, heavy: 800, black: 900,
};
function weightOf(raw: string | undefined): number | undefined {
  return raw === undefined ? undefined : WEIGHTS[raw];
}
