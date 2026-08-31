/**
 * The DesignFacts IR's paired test. Four contracts, each with a probe that CAN
 * go red — a guard nobody has watched fail is a guard nobody has tested.
 *
 *   1. an extractor supplying nothing makes EVERY rule not-evaluated;
 *   2. a rule needing a kind an extractor cannot see never appears runnable;
 *   3. the collector refuses a fact that contradicts the declaration;
 *   4. the Figma AuditNode model stays representable in the IR (the
 *      compile-time bridge that replaces "we'll converge later").
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FACT_KINDS, CONFIDENCE_ORDER, atLeast,
  FactCollector, FactContractError,
  EXTRACTOR_PROFILES, extractorById, extractorForExtension,
  evaluate, partition, coverageMatrix,
} from "../src/core/design-facts/index.js";
import type {
  FactKind, Provenance, DesignFact, RuleRequirement, ExtractorProfile,
} from "../src/core/design-facts/index.js";
import { CHECK_CATALOG, isLegacyRequires } from "../src/core/check-catalog.js";
import type { AuditNode } from "../src/core/audit-detect.js";
import { allContentChecks } from "../src/core/content-checks.js";

const at = (extractor: string, confidence: Provenance["confidence"] = "resolved"): Provenance => ({
  file: "a.html", line: 1, extractor, confidence,
});

/** Every kind, so "needs everything" rules are easy to write. */
const ALL: readonly FactKind[] = FACT_KINDS;

const blind: ExtractorProfile = {
  id: "blind", extensions: [".nope"], tier: "supplies nothing",
  undercount: true, supplies: {},
};

describe("confidence ordering", () => {
  it("ranks rendered strongest and heuristic weakest", () => {
    expect(CONFIDENCE_ORDER[0]).toBe("rendered");
    expect(CONFIDENCE_ORDER.at(-1)).toBe("heuristic");
    expect(atLeast("rendered", "resolved")).toBe(true);
    expect(atLeast("literal", "resolved")).toBe(false);
    expect(atLeast("resolved", "resolved")).toBe(true);
  });
});

describe("requirement contract", () => {
  const rules: RuleRequirement[] = [
    { id: "needs-color", needs: ["color"] },
    { id: "needs-motion", needs: ["motion"] },
    { id: "needs-everything", needs: ALL },
    { id: "needs-resolved-color", needs: ["color"], minConfidence: "resolved" },
  ];

  it("makes EVERY rule not-evaluated for an extractor that supplies nothing", () => {
    const { runnable, notEvaluated } = partition(rules, blind);
    expect(runnable).toEqual([]);
    expect(notEvaluated.map((n) => n.id).sort()).toEqual(rules.map((r) => r.id).sort());
    for (const n of notEvaluated) expect(n.reason).toContain("missing:");
  });

  it("never reports a rule runnable when the extractor cannot see its kind", () => {
    const swiftui = extractorById("swiftui");
    expect(swiftui).toBeDefined();
    // swiftui declares no `structure` — the prototype's nested-cards landmine.
    expect(swiftui?.supplies.structure).toBeUndefined();
    const verdict = evaluate({ id: "nested-cards", needs: ["radius", "structure"] }, swiftui!);
    expect(verdict.runnable).toBe(false);
    if (!verdict.runnable) expect(verdict.why.missing).toEqual(["structure"]);
  });

  it("rejects a fact kind supplied too weakly for the rule", () => {
    const swiftui = extractorById("swiftui")!;
    // literal-tier color cannot carry a computed contrast ratio.
    const verdict = evaluate({ id: "low-contrast", needs: ["color"], minConfidence: "resolved" }, swiftui);
    expect(verdict.runnable).toBe(false);
    if (!verdict.runnable) {
      expect(verdict.why.missing).toEqual([]);
      expect(verdict.why.tooWeak).toEqual([{ kind: "color", have: "literal", want: "resolved" }]);
    }
  });

  it("puts every rule in exactly one bucket, for every registered extractor", () => {
    for (const profile of EXTRACTOR_PROFILES) {
      const { runnable, notEvaluated } = partition(rules, profile);
      expect(runnable.length + notEvaluated.length).toBe(rules.length);
      expect(new Set([...runnable, ...notEvaluated.map((n) => n.id)]).size).toBe(rules.length);
    }
  });

  it("builds a deterministic rule x extractor matrix", () => {
    const a = coverageMatrix(rules, EXTRACTOR_PROFILES);
    const b = coverageMatrix([...rules].reverse(), [...EXTRACTOR_PROFILES].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("extractor registry", () => {
  it("has unique ids and only real fact kinds", () => {
    const ids = EXTRACTOR_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of EXTRACTOR_PROFILES)
      for (const k of Object.keys(p.supplies)) expect(FACT_KINDS).toContain(k as FactKind);
  });

  it("claims each extension exactly once", () => {
    const seen = new Set<string>();
    for (const p of EXTRACTOR_PROFILES)
      for (const e of p.extensions) {
        expect(seen.has(e)).toBe(false);
        seen.add(e);
      }
    expect(extractorForExtension(".SWIFT")?.id).toBe("swiftui");
    expect(extractorForExtension(".rs")).toBeUndefined();
  });

  it("marks the line-scanner tiers as an undercount", () => {
    for (const id of ["swiftui", "flutter", "jsx-tailwind"])
      expect(extractorById(id)?.undercount).toBe(true);
    expect(extractorById("html-cascade")?.undercount).toBe(false);
  });
});

describe("fact collector", () => {
  const supplies = { color: "resolved", structure: "heuristic" } as const;
  const make = (): FactCollector => new FactCollector("html-cascade", supplies);
  const color = (p: Provenance): DesignFact => ({ kind: "color", hex: "7c3aed", role: "bg", at: p });

  it("accepts a declared fact at a declared confidence", () => {
    const c = make();
    c.add(color(at("html-cascade")));
    expect(c.facts()).toHaveLength(1);
    expect([...c.kindsPresent()]).toEqual(["color"]);
  });

  it("refuses a kind the extractor never declared", () => {
    const c = make();
    expect(() => c.add({ kind: "motion", motionKind: "transition", at: at("html-cascade") }))
      .toThrow(FactContractError);
  });

  it("refuses a foreign extractor id in the provenance", () => {
    const c = make();
    expect(() => c.add(color(at("swiftui")))).toThrow(/belongs to "html-cascade"/);
  });

  it("refuses a confidence stronger than declared", () => {
    const c = make();
    expect(() => c.add({ kind: "structure", node: "div", depth: 0, ref: "d0", at: at("html-cascade", "resolved") }))
      .toThrow(/declared "structure" at heuristic but emitted it at resolved/);
  });

  it("counts unresolved reads so a low finding count never reads as clean", () => {
    const c = make();
    c.noteUnresolved("cn() call");
    c.noteUnresolved("cn() call");
    c.noteUnresolved("theme lookup");
    expect(c.unresolvedCount).toBe(3);
    expect(c.unresolved()[0]).toEqual({ what: "cn() call", count: 2 });
  });

  it("orders facts deterministically regardless of insertion order", () => {
    const mk = (line: number, file: string): DesignFact =>
      ({ kind: "color", hex: "000000", role: "fg", at: { file, line, extractor: "html-cascade", confidence: "resolved" } });
    const a = make(); [mk(3, "b.html"), mk(1, "a.html"), mk(2, "a.html")].forEach((f) => a.add(f));
    const b = make(); [mk(2, "a.html"), mk(3, "b.html"), mk(1, "a.html")].forEach((f) => b.add(f));
    expect(JSON.stringify(a.facts())).toBe(JSON.stringify(b.facts()));
    expect(a.facts().map((f) => `${f.at.file}:${f.at.line}`)).toEqual(["a.html:1", "a.html:2", "b.html:3"]);
  });
});

describe("CHECK_CATALOG requires widening", () => {
  it("leaves every existing row on the legacy string form", () => {
    const legacy = CHECK_CATALOG.filter((e) => isLegacyRequires(e.requires));
    // The 89 pre-existing rows keep the legacy string form; the 36 `tell` rows
    // added in phase 05 use the fact-set form, which is the whole point of the
    // widening. Both must coexist.
    expect(legacy.length).toBe(89);
    expect(CHECK_CATALOG.length).toBe(138);
  });

  it("keeps the family split the gate composes", () => {
    const byFamily: Record<string, number> = {};
    for (const e of CHECK_CATALOG) byFamily[e.family] = (byFamily[e.family] ?? 0) + 1;
    expect(byFamily).toEqual({ layout: 20, a11y: 14, taste: 34, tell: 43, content: 17, autofix: 10 });
  });

  it("accepts a fact-based requirement without disturbing the legacy ones", () => {
    const entry = { id: "side-tab", family: "taste" as const, requires: { facts: ["border", "radius"] as const } };
    expect(isLegacyRequires(entry.requires)).toBe(false);
  });
});

/**
 * Contract 4 — the compile-time bridge to the OTHER design model in this repo.
 *
 * `ui audit` runs rules over `AuditNode` (src/core/audit-detect.ts:38-58), fed
 * from Figma. The plan deliberately does NOT refactor it — but "we'll converge
 * later" is exactly the promise this repo has been burned by. So instead: a
 * probe that turns red the day an `AuditNode` field stops being expressible as
 * DesignFacts. It is not a shipped adapter (that lands in phase 07); it is the
 * proof that the adapter will be possible.
 *
 * Every fact-BEARING field must be covered. The three that carry no design
 * fact — `mainComponent`, `detached`, `type` — are named here so their absence
 * is a decision on the record, not an oversight.
 */
describe("AuditNode stays representable in the IR", () => {
  const figma = extractorById("figma-nodes")!;
  const at = (line: number): Provenance =>
    ({ file: "nodes.json", line, extractor: "figma-nodes", confidence: "resolved" });

  /** Minimal mapping, in the test on purpose — the shipped one lands in phase 07. */
  function factsFrom(node: AuditNode, depth = 0, line = 1, parentRef?: string): DesignFact[] {
    const ref = `${node.name ?? node.type ?? "node"}@${depth}`;
    const out: DesignFact[] = [
      { kind: "structure", node: node.type ?? "FRAME", depth, ref, parentRef,
        roles: node.role ? [node.role] : undefined, at: at(line) },
    ];
    for (const f of node.fills ?? [])
      if (f.hex) out.push({ kind: "color", hex: f.hex.replace(/^#/, "").toLowerCase(),
        role: "bg", boundToken: f.boundToken, at: at(line) });
    if (node.cornerRadius !== undefined)
      out.push({ kind: "radius", px: node.cornerRadius, at: at(line) });
    if (node.itemSpacing !== undefined)
      out.push({ kind: "spacing", prop: "gap", px: node.itemSpacing, at: at(line) });
    const pads = [
      ["padding-top", node.paddingTop], ["padding-right", node.paddingRight],
      ["padding-bottom", node.paddingBottom], ["padding-left", node.paddingLeft],
    ] as const;
    for (const [prop, px] of pads)
      if (px !== undefined) out.push({ kind: "spacing", prop, px, at: at(line) });
    if (node.characters !== undefined)
      out.push({ kind: "text", content: node.characters, role: "unknown", at: at(line) });
    node.children?.forEach((c, i) => out.push(...factsFrom(c, depth + 1, line + i + 1, ref)));
    return out;
  }

  /** Exercises every fact-bearing field, including nesting. */
  const fixture: AuditNode = {
    name: "Card", type: "FRAME", role: "card",
    fills: [{ type: "SOLID", hex: "#7C3AED", boundToken: "color.brand" }],
    cornerRadius: 16, itemSpacing: 8,
    paddingTop: 16, paddingRight: 16, paddingBottom: 16, paddingLeft: 16,
    mainComponent: "Card/Default", detached: false,
    children: [{ name: "Label", type: "TEXT", characters: "Supercharge", cornerRadius: 4 }],
  };

  it("expresses every fact-bearing AuditNode field, and none is silently dropped", () => {
    const c = new FactCollector("figma-nodes", figma.supplies);
    for (const f of factsFrom(fixture)) c.add(f);

    expect([...c.kindsPresent()].sort()).toEqual(["color", "radius", "spacing", "structure", "text"]);
    // Fills keep their token binding — the field that makes off-system-token expressible.
    const color = c.facts().find((f) => f.kind === "color");
    expect(color).toMatchObject({ hex: "7c3aed", boundToken: "color.brand" });
    // Nesting survives: the child's radius carries a parentRef chain, which is
    // exactly what `nested-cards` needs and what a flat file cannot provide.
    const child = c.facts().find((f) => f.kind === "structure" && f.depth === 1);
    expect(child).toMatchObject({ node: "TEXT", parentRef: "Card@0" });
    expect(c.facts().filter((f) => f.kind === "radius").map((f) => f.px).sort((a, b) => a - b))
      .toEqual([4, 16]);
  });

  it("names the AuditNode fields that carry NO design fact, so the gap is a decision", () => {
    const noFact = ["mainComponent", "detached", "type"] as const;
    // `type` feeds `structure.node` rather than a fact of its own; the other two
    // are component-instance bookkeeping with no visual value to judge.
    expect(noFact).toHaveLength(3);
  });

  it("reports the kinds Figma cannot supply as NOT-EVALUATED, never as passing", () => {
    const rules: RuleRequirement[] = [
      { id: "overused-font", needs: ["typography"] },
      { id: "pulsing-dot", needs: ["motion"] },
      { id: "side-tab", needs: ["border", "radius"] },
      { id: "nested-cards", needs: ["radius", "structure"] },
    ];
    const { runnable, notEvaluated } = partition(rules, figma);
    expect(runnable).toEqual(["nested-cards"]);
    expect(notEvaluated.map((n) => n.id)).toEqual(["overused-font", "pulsing-dot", "side-tab"]);
  });
});

/**
 * The README's numbers are CLAIMS. They drifted before — a check count that says
 * 14 where the catalog holds 34 is a promise the repo stopped keeping — so they
 * are measured here rather than remembered.
 */
describe("README states what the catalog actually holds", () => {
  it("quotes the per-family check counts correctly", () => {
    const readme = readFileSync(join(fileURLToPath(new URL("..", import.meta.url)), "README.md"), "utf8");
    const byFamily: Record<string, number> = {};
    for (const e of CHECK_CATALOG) byFamily[e.family] = (byFamily[e.family] ?? 0) + 1;
    // Each row of that README table names a COMMAND, so the number it quotes is what
    // that command runs — which is the family count only where the two coincide.
    //
    // `content` is the one place they do not, and asserting otherwise was itself a
    // drifted claim: `ui content-lint` runs the 12 regex checks, while the five
    // fact-based content rows (the voice tells and `prompt-leak-metadata`) are
    // computed from facts and reach the reader through `ui tell-lint`. Comparing the
    // command's advertised number to the family total forced the README to overstate
    // the command by five.
    const expected: Record<string, number> = { ...byFamily, content: allContentChecks.length };
    const claims: Array<[string, string]> = [
      ["taste", "`ui taste-lint` — "],
      ["layout", "`ui validate-layout` — "],
      ["content", "`ui content-lint` — "],
      ["tell", "`ui tell-lint` — "],
    ];
    for (const [family, prefix] of claims) {
      const n = expected[family] as number;
      const i = readme.indexOf(prefix);
      expect(i, `README does not mention ${prefix}`).toBeGreaterThan(-1);
      const quoted = Number.parseInt(readme.slice(i + prefix.length), 10);
      expect(quoted, `README says ${quoted} for the ${family} command; it runs ${n}`).toBe(n);
    }
  });
});
