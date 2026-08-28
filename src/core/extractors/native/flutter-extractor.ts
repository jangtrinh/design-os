/**
 * Flutter/Dart → DesignFacts, at `literal` confidence.
 *
 * Platform default: **Roboto**. A Flutter app that declares no `fontFamily` is
 * shipping Roboto, so this extractor emits it once per file when a `TextStyle`
 * appears without one — and `overused-font` fires, correctly. That is the
 * asymmetry with SwiftUI, whose default SF is a system face and not a tell. The
 * asymmetry lives here, in the extractor that knows the platform, not in the
 * rule.
 *
 * Output is an acknowledged UNDERCOUNT, and no `structure` is supplied: widget
 * nesting is real in the source but not readable from a line scan, so nesting
 * and rhythm rules are NOT-EVALUATED rather than guessed.
 */
import { FactCollector } from "../../design-facts/fact-collector.js";
import { extractorById } from "../../design-facts/extractor-registry.js";
import type { Provenance, Side } from "../../design-facts/index.js";
import { stripNoise, lineIndex, scan, num, hex6, UNRESOLVABLE } from "../scanner/line-scanner.js";
import type { ScanExtraction } from "./swiftui-extractor.js";

const EXTRACTOR_ID = "flutter";

/** Material's named colours that carry a concrete hex. */
const NAMED: Record<string, string> = {
  white: "ffffff", black: "000000",
  deeppurple: "673ab7", purple: "9c27b0", indigo: "3f51b5", blue: "2196f3",
  teal: "009688", green: "4caf50", red: "f44336", orange: "ff9800",
  grey: "9e9e9e", gray: "9e9e9e", amber: "ffc107", cyan: "00bcd4",
};

/** Flutter renders Roboto when nothing else is asked for. */
const PLATFORM_DEFAULT_FONT = "Roboto";

export function extractFlutter(source: string, file: string): ScanExtraction {
  const profile = extractorById(EXTRACTOR_ID);
  if (profile === undefined) throw new Error(`extractor "${EXTRACTOR_ID}" is not registered`);
  const c = new FactCollector(EXTRACTOR_ID, profile.supplies);

  const toLine = lineIndex(source);
  const code = stripNoise(source);
  const at = (line: number): Provenance => ({ file, line, extractor: EXTRACTOR_ID, confidence: "literal" });

  // ── typography ──
  const families = scan(source, /fontFamily:\s*'([^']+)'|fontFamily:\s*"([^"]+)"/g, toLine);
  for (const h of families) {
    c.add({ kind: "typography", family: (h.value[1] ?? h.value[2]) as string, at: at(h.line) });
  }
  for (const h of scan(code, /fontSize:\s*([\d.]+)/g, toLine)) {
    c.add({ kind: "typography", sizePx: num(h.value[1]), at: at(h.line) });
  }
  for (const h of scan(code, /letterSpacing:\s*(-?[\d.]+)/g, toLine)) {
    const px = num(h.value[1]);
    if (px !== undefined) c.add({ kind: "typography", letterSpacingEm: px / 16, at: at(h.line) });
  }
  for (const h of scan(code, /height:\s*([\d.]+)\s*[,)]/g, toLine)) {
    // Dart's TextStyle.height IS the line-height multiple.
    const n = num(h.value[1]);
    if (n !== undefined && n > 0.5 && n < 4) c.add({ kind: "typography", lineHeight: n, at: at(h.line) });
  }
  for (const h of scan(code, /TextAlign\.(\w+)/g, toLine)) {
    const a = h.value[1];
    if (a === "justify") c.add({ kind: "typography", align: "justify", at: at(h.line) });
    else if (a === "center") c.add({ kind: "typography", align: "center", at: at(h.line) });
    else if (a === "left" || a === "start") c.add({ kind: "typography", align: "start", at: at(h.line) });
    else if (a === "right" || a === "end") c.add({ kind: "typography", align: "end", at: at(h.line) });
  }
  for (const h of scan(code, /FontStyle\.italic/g, toLine)) {
    c.add({ kind: "typography", italic: true, at: at(h.line) });
  }

  // The platform default, stated once, only when the file styles text at all
  // and never declares a family. Emitting it per TextStyle would multiply one
  // fact into a wall of identical findings.
  const styleSites = scan(code, /TextStyle\(/g, toLine);
  if (families.length === 0 && styleSites.length > 0) {
    c.add({
      kind: "typography",
      family: PLATFORM_DEFAULT_FONT,
      at: at(styleSites[0]?.line ?? 1),
    });
  }

  // ── colour ──
  for (const h of scan(code, /Color\(\s*(0x[0-9A-Fa-f]{6,8})\s*\)/g, toLine)) {
    const hex = hex6(h.value[1] as string);
    if (hex !== undefined) c.add({ kind: "color", hex, role: "bg", at: at(h.line) });
  }
  for (const h of scan(code, /Colors\.(\w+)/g, toLine)) {
    const hex = NAMED[(h.value[1] ?? "").toLowerCase()];
    if (hex !== undefined) c.add({ kind: "color", hex, role: "bg", at: at(h.line) });
    else c.noteUnresolved(UNRESOLVABLE.themeLookup);
  }
  // `color:` inside a TextStyle is foreground; the same literal elsewhere is a surface.
  for (const h of scan(code, /TextStyle\((?:[\s\S]{0,200}?)color:\s*Color\(\s*(0x[0-9A-Fa-f]{6,8})/g, toLine)) {
    const hex = hex6(h.value[1] as string);
    if (hex !== undefined) c.add({ kind: "color", hex, role: "fg", at: at(h.line) });
  }

  // ── gradient ──
  for (const h of scan(source, /(Linear|Radial|Sweep)Gradient\((?:[\s\S]{0,240}?)colors:\s*\[([^\]]*)\]/g, toLine)) {
    const stops: Array<{ hex: string }> = [];
    for (const tok of (h.value[2] ?? "").split(",")) {
      const literal = /(0x[0-9A-Fa-f]{6,8})/.exec(tok);
      const named = /Colors\.(\w+)/.exec(tok);
      const hex = literal !== null ? hex6(literal[1] as string) : NAMED[(named?.[1] ?? "").toLowerCase()];
      if (hex !== undefined) stops.push({ hex });
    }
    if (stops.length > 0) {
      const kind = h.value[1] === "Radial" ? "radial" : h.value[1] === "Sweep" ? "conic" : "linear";
      c.add({ kind: "gradient", gradientKind: kind, stops, at: at(h.line) });
    }
  }

  // ── radius ──
  for (const h of scan(code, /BorderRadius\.circular\(\s*([\d.]+)/g, toLine)) {
    const px = num(h.value[1]);
    if (px !== undefined) c.add({ kind: "radius", px, at: at(h.line) });
  }
  for (const h of scan(code, /\bshape:\s*(?:const\s+)?(?:BoxShape\.circle|CircleBorder\(\))/g, toLine)) {
    c.add({ kind: "radius", px: 999, at: at(h.line) });
  }

  // ── spacing ──
  for (const h of scan(code, /EdgeInsets\.all\(\s*([\d.]+)/g, toLine)) {
    const px = num(h.value[1]);
    if (px === undefined) continue;
    for (const prop of ["padding-top", "padding-right", "padding-bottom", "padding-left"] as const) {
      c.add({ kind: "spacing", prop, px, at: at(h.line) });
    }
  }
  for (const h of scan(code, /EdgeInsets\.symmetric\(\s*(?:horizontal:\s*([\d.]+))?\s*,?\s*(?:vertical:\s*([\d.]+))?/g, toLine)) {
    const hz = num(h.value[1]);
    const vt = num(h.value[2]);
    if (hz !== undefined) {
      c.add({ kind: "spacing", prop: "padding-left", px: hz, at: at(h.line) });
      c.add({ kind: "spacing", prop: "padding-right", px: hz, at: at(h.line) });
    }
    if (vt !== undefined) {
      c.add({ kind: "spacing", prop: "padding-top", px: vt, at: at(h.line) });
      c.add({ kind: "spacing", prop: "padding-bottom", px: vt, at: at(h.line) });
    }
  }

  // ── border: `Border(left: BorderSide(width: N))` is Flutter's side-tab ──
  for (const h of scan(code, /Border\(\s*(left|right|top|bottom):\s*(?:const\s+)?BorderSide\((?:[\s\S]{0,120}?)width:\s*([\d.]+)/g, toLine)) {
    const side = sideOf(h.value[1]);
    const widthPx = num(h.value[2]);
    if (side !== undefined && widthPx !== undefined) {
      c.add({ kind: "border", sides: [side], widthPx, at: at(h.line) });
    }
  }
  for (const h of scan(code, /Border\.all\((?:[\s\S]{0,120}?)width:\s*([\d.]+)/g, toLine)) {
    const widthPx = num(h.value[1]);
    if (widthPx !== undefined) {
      c.add({ kind: "border", sides: ["top", "right", "bottom", "left"], widthPx, at: at(h.line) });
    }
  }

  // ── shadow ──
  for (const h of scan(code, /BoxShadow\((?:[\s\S]{0,200}?)blurRadius:\s*([\d.]+)/g, toLine)) {
    const blurPx = num(h.value[1]);
    if (blurPx !== undefined) c.add({ kind: "shadow", offsetXPx: 0, offsetYPx: 0, blurPx, at: at(h.line) });
  }

  // ── motion ──
  for (const h of scan(code, /Curves\.(\w+)/g, toLine)) {
    c.add({ kind: "motion", motionKind: "animation", easing: `Curves.${h.value[1]}`, at: at(h.line) });
  }
  for (const h of scan(code, /Duration\(\s*milliseconds:\s*(\d+)/g, toLine)) {
    c.add({ kind: "motion", motionKind: "animation", durationMs: num(h.value[1]), at: at(h.line) });
  }
  for (const h of scan(code, /\brepeat\(\s*\)|\.repeat\(reverse:/g, toLine)) {
    c.add({ kind: "motion", motionKind: "animation", repeatsForever: true, at: at(h.line) });
  }

  // ── text ──
  for (const h of scan(source, /Text\(\s*'([^']+)'|Text\(\s*"([^"]+)"/g, toLine)) {
    c.add({ kind: "text", content: (h.value[1] ?? h.value[2]) as string, role: "unknown", at: at(h.line) });
  }

  // ── what could not be followed ──
  for (let i = 0; i < scan(code, /Theme\.of\(\s*context\s*\)/g, toLine).length; i++) c.noteUnresolved(UNRESOLVABLE.themeLookup);
  for (let i = 0; i < scan(code, /\?\s*[^:;]+\s*:/g, toLine).length; i++) c.noteUnresolved(UNRESOLVABLE.conditional);
  for (let i = 0; i < scan(source, /\$\{[^}]+\}/g, toLine).length; i++) c.noteUnresolved(UNRESOLVABLE.interpolation);

  return { collector: c, undercount: true };
}

function sideOf(raw: string | undefined): Side | undefined {
  return raw === "left" || raw === "right" || raw === "top" || raw === "bottom" ? raw : undefined;
}
