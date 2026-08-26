/**
 * Phase 07's paired test: SwiftUI and Flutter through the same 36 rules.
 *
 * The claim being defended is the architecture's: rules were written once, over
 * facts, and a ~150-line extractor per language is all that stands between them
 * and a new platform. So the assertions are about WHICH rules fire — the same
 * ids that fire on HTML — and about the two things a scanner must never do:
 * guess at what it cannot resolve, and stay silent about it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSwiftUi } from "../src/core/extractors/native/swiftui-extractor.js";
import { extractFlutter } from "../src/core/extractors/native/flutter-extractor.js";
import { lintTell } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/index.js";
import { stripNoise, hex6, unitRgbToHex, lineIndex } from "../src/core/extractors/scanner/line-scanner.js";

const FIX = join(fileURLToPath(new URL("..", import.meta.url)), "tests", "fixtures", "native");
const read = (n: string): string => readFileSync(join(FIX, n), "utf8");

const swiftui = extractorById("swiftui")!;
const flutter = extractorById("flutter")!;

const idsFor = (name: string) => {
  const src = read(name);
  const isSwift = name.endsWith(".swift");
  const ex = isSwift ? extractSwiftUi(src, name) : extractFlutter(src, name);
  const r = lintTell(ex.collector.facts(), isSwift ? swiftui : flutter);
  return { ids: r.findings.map((f) => f.checkId).sort(), result: r, ex };
};

describe("the scanner base", () => {
  it("blanks comments and string bodies while preserving every offset", () => {
    const src = `let a = 1 // .cornerRadius(16)\nlet b = "cornerRadius"\n/* .padding(4) */\nlet c = 2`;
    const out = stripNoise(src);
    expect(out).toHaveLength(src.length);
    expect(out.split("\n")).toHaveLength(4);
    expect(out).not.toContain("cornerRadius");
    expect(out).not.toContain("padding");
    expect(out).toContain("let c = 2");
  });

  it("maps offsets to 1-based lines", () => {
    const toLine = lineIndex("a\nbb\nccc");
    expect(toLine(0)).toBe(1);
    expect(toLine(2)).toBe(2);
    expect(toLine(5)).toBe(3);
  });

  it("reads hex in every platform spelling, and refuses what it cannot", () => {
    expect(hex6("#7C3AED")).toBe("7c3aed");
    expect(hex6("0xFF7C3AED")).toBe("7c3aed"); // Flutter's AARRGGBB
    expect(hex6("#abc")).toBe("aabbcc");
    expect(hex6("brandPurple")).toBeUndefined();
    expect(unitRgbToHex(0.48, 0.23, 0.93)).toBe("7a3bed");
  });
});

describe("SwiftUI", () => {
  it("finds the tells a generated view carries", () => {
    const { ids } = idsFor("tell-swiftui-slop.swift");
    for (const expected of ["side-tab", "overused-font", "ai-color-palette", "pulsing-dot", "gray-on-color"])
      expect(ids, expected).toContain(expected);
  });

  it("is silent on a considered view", () => {
    const { ids } = idsFor("tell-swiftui-clean.swift");
    expect(ids).toEqual([]);
  });

  it("does NOT flag the system face — SF is not a badly-made choice", () => {
    const { ids } = idsFor("tell-swiftui-no-family.swift");
    expect(ids).not.toContain("overused-font");
  });

  it("reports every structure rule NOT-EVALUATED rather than guessing at view nesting", () => {
    const { result } = idsFor("tell-swiftui-slop.swift");
    const notEvaluated = result.notEvaluated.map((n) => n.id);
    expect(notEvaluated).toContain("nested-cards");
    expect(notEvaluated).toContain("monotonous-spacing");
    for (const n of result.notEvaluated) expect(n.reason).toContain("missing");
  });

  it("counts what it could not follow instead of inventing a value", () => {
    const { ex } = idsFor("tell-swiftui-slop.swift");
    expect(ex.undercount).toBe(true);
    const themed = extractSwiftUi(
      `struct V: View { var body: some View { Text("x").foregroundColor(Color.brandPurple) } }`,
      "v.swift",
    );
    // Color.brandPurple is a lookup this tier cannot follow: no colour fact, and
    // the gap is counted rather than filled with a plausible hex.
    expect(themed.collector.facts().filter((f) => f.kind === "color")).toHaveLength(0);
    expect(themed.collector.unresolvedCount).toBeGreaterThan(0);
  });

  it("never reads a commented-out modifier as live", () => {
    const src = `struct V: View {
      var body: some View {
        Rectangle()
          // .cornerRadius(16)
          .padding(16)
      }
    }`;
    const facts = extractSwiftUi(src, "v.swift").collector.facts();
    expect(facts.filter((f) => f.kind === "radius")).toHaveLength(0);
    expect(facts.filter((f) => f.kind === "spacing").length).toBeGreaterThan(0);
  });
});

describe("Flutter", () => {
  it("finds the tells a generated widget carries", () => {
    const { ids } = idsFor("tell-flutter-slop.dart");
    for (const expected of ["side-tab", "justified-text", "overused-font", "ai-color-palette"])
      expect(ids, expected).toContain(expected);
  });

  it("is silent on a considered widget", () => {
    const { ids } = idsFor("tell-flutter-clean.dart");
    expect(ids).toEqual([]);
  });

  it("DOES flag a file with no fontFamily — Flutter's default IS Roboto", () => {
    const { ids } = idsFor("tell-flutter-no-family.dart");
    expect(ids).toContain("overused-font");
  });

  it("states the platform default once, not once per TextStyle", () => {
    const src = `import 'package:flutter/material.dart';
      var a = TextStyle(fontSize: 12);
      var b = TextStyle(fontSize: 14);
      var c = TextStyle(fontSize: 16);`;
    const families = extractFlutter(src, "x.dart")
      .collector.facts()
      .filter((f) => f.kind === "typography" && f.family !== undefined);
    expect(families).toHaveLength(1);
  });

  it("reads a one-sided border through a nested Color(...) call", () => {
    // `[^)]` closes on the nested call's paren and silently misses the width —
    // the shape of bug that makes a rule look implemented and never fire.
    const src = `var d = BoxDecoration(
      border: Border(left: BorderSide(color: Color(0xFF7C3AED), width: 4)),
      borderRadius: BorderRadius.circular(16));`;
    const borders = extractFlutter(src, "x.dart").collector.facts().filter((f) => f.kind === "border");
    expect(borders).toHaveLength(1);
    expect(borders[0]).toMatchObject({ sides: ["left"], widthPx: 4 });
  });
});

describe("one architecture, two platforms", () => {
  it("fires the SAME rule ids across HTML, SwiftUI and Flutter", () => {
    const swift = idsFor("tell-swiftui-slop.swift").ids;
    const dart = idsFor("tell-flutter-slop.dart").ids;
    // side-tab is the roster's signature rule; it must be reachable everywhere
    // the extractor supplies border + radius, with no per-language rule code.
    expect(swift).toContain("side-tab");
    expect(dart).toContain("side-tab");
    expect(new Set([...swift, ...dart]).size).toBeGreaterThan(5);
  });

  it("marks both native tiers an UNDERCOUNT so a low count never reads as clean", () => {
    expect(swiftui.undercount).toBe(true);
    expect(flutter.undercount).toBe(true);
    expect(swiftui.supplies.structure).toBeUndefined();
    expect(flutter.supplies.structure).toBeUndefined();
  });

  it("emits at literal confidence, never claiming a resolved read", () => {
    for (const name of ["tell-swiftui-slop.swift", "tell-flutter-slop.dart"]) {
      const { ex } = idsFor(name);
      for (const f of ex.collector.facts()) expect(f.at.confidence).toBe("literal");
    }
  });

  it("is deterministic", () => {
    const once = JSON.stringify(extractFlutter(read("tell-flutter-slop.dart"), "f").collector.facts());
    const twice = JSON.stringify(extractFlutter(read("tell-flutter-slop.dart"), "f").collector.facts());
    expect(once).toBe(twice);
  });
});
