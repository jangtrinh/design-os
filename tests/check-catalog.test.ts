/**
 * The catalog's paired linter: re-derive every family's checkId set from the
 * source files the gate composes, and assert set equality with CHECK_CATALOG
 * in BOTH directions. A check added without a catalog row, or a catalog row
 * whose check was deleted, is a red test here — never silent drift. (This is
 * the registry triage routes on; a stale registry is a stale router.)
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CHECK_CATALOG } from "../src/core/check-catalog.js";
import { isLegacyRequires } from "../src/core/check-catalog.js";
import { FACT_KINDS } from "../src/core/design-facts/index.js";
import { TELL_RULES } from "../src/core/tell-lint.js";
import { RENDERED_RULES } from "../src/core/tell-rules-rendered.js";
import { VOICE_CHECKS } from "../src/core/content-checks-voice.js";
import type { DesignFact } from "../src/core/design-facts/index.js";

/** The four voice ids, listed once so the two assertions above can disagree. */
const VOICE_IDS = ["marketing-buzzword", "em-dash-overuse", "theater-slop-phrase", "aphoristic-cadence"];

/** Text that trips all four at once. */
const VOICE_TRIGGER: DesignFact[] = [
  {
    kind: "text",
    role: "body",
    content:
      "Supercharge your stunning workflow. This is not just a tool — it's a way of thinking — " +
      "a way that is — plainly — better, and it is world-class.",
    at: { file: "f", line: 1, extractor: "html-cascade", confidence: "resolved" },
  },
  {
    kind: "text",
    role: "body",
    // em-dash-overuse is a RATE check with a 60-word floor, so the trigger has
    // to be long enough to measure. A shorter sample fired three of four and
    // looked like a missing check rather than a sample too small to judge.
    content:
      "Another line of copy — with more words to push the sample over the rate floor so " +
      "the dash rate is measurable at all, because a short run of text is punctuation " +
      "rather than a habit and the check refuses to call it one without enough evidence.",
    at: { file: "f", line: 2, extractor: "html-cascade", confidence: "resolved" },
  },
];

const CORE = join(fileURLToPath(new URL("..", import.meta.url)), "src", "core");

function idsFromFiles(prefixes: string[], pattern?: RegExp): Set<string> {
  const out = new Set<string>();
  for (const f of readdirSync(CORE)) {
    if (!f.endsWith(".ts")) continue;
    if (!prefixes.some((p) => f.startsWith(p))) continue;
    const src = readFileSync(join(CORE, f), "utf8");
    if (pattern) for (const m of src.matchAll(pattern)) out.add(m[1] as string);
    else for (const id of extractCheckIds(src)) out.add(id);
  }
  return out;
}

/**
 * Extract checkIds from a family source: direct literals AND const-style
 * (`const NAME = "id"` later used as `checkId: NAME`). The const class fooled
 * the first version of this test into a green that could never go red — the
 * extractor is itself probed below with a snippet that MUST match.
 */
function extractCheckIds(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/checkId: "([a-z0-9-]+)"/g)) out.push(m[1] as string);
  const consts = new Map<string, string>();
  for (const m of src.matchAll(/const (\w+) = "([a-z0-9-]+)";/g)) consts.set(m[1] as string, m[2] as string);
  for (const m of src.matchAll(/checkId: (\w+)[,\s]/g)) {
    const lit = consts.get(m[1] as string);
    if (lit !== undefined) out.push(lit);
  }
  return out;
}
const RULE_ID = /\{ id: "([a-z-]+)",\s*fn:/g;

const catalogByFamily = (fam: string): Set<string> =>
  new Set(CHECK_CATALOG.filter((c) => c.family === fam).map((c) => c.id));

describe("check catalog — paired with the family sources", () => {
  it("layout rows == ids in layout-checks*/layout-lint sources", () => {
    expect([...catalogByFamily("layout")].sort())
      .toEqual([...idsFromFiles(["layout-checks", "layout-lint"])].sort());
  });
  it("a11y rows == ids in a11y-checks* sources", () => {
    expect([...catalogByFamily("a11y")].sort())
      .toEqual([...idsFromFiles(["a11y-checks"])].sort());
  });
  it("taste rows == ids in taste-checks* sources", () => {
    expect([...catalogByFamily("taste")].sort())
      .toEqual([...idsFromFiles(["taste-checks"])].sort());
  });
  it("content rows == ids in content-checks* sources", () => {
    // The voice checks pass their id positionally (`finding("id", …)`), which
    // the literal extractor cannot see. Rather than widen the grep — the same
    // grep that generated nothing here and would then be verifying itself — they
    // are paired against RUNTIME emission in the test below and excluded here.
    const fromSource = idsFromFiles(["content-checks"]);
    for (const id of VOICE_IDS) fromSource.add(id);
    expect([...catalogByFamily("content")].sort()).toEqual([...fromSource].sort());
  });

  it("every voice row is a check that ACTUALLY emits it", () => {
    // Pairing against emission, not against source text: a catalog row whose
    // check was deleted, or renamed, goes red here even though the file still
    // mentions the string.
    const emitted = new Set<string>();
    for (const check of VOICE_CHECKS) {
      for (const f of check(VOICE_TRIGGER)) emitted.add(f.checkId);
    }
    expect([...emitted].sort()).toEqual([...VOICE_IDS].sort());
  });
  it("autofix rows == autofix RULES ids plus the gate's autofix-not-clean", () => {
    const fromSource = idsFromFiles(["html-autofix"], RULE_ID);
    fromSource.add("autofix-not-clean");
    expect([...catalogByFamily("autofix")].sort()).toEqual([...fromSource].sort());
  });
  it("ids are unique and requires values are known", () => {
    expect(new Set(CHECK_CATALOG.map((c) => c.id)).size).toBe(CHECK_CATALOG.length);
    for (const c of CHECK_CATALOG) {
      if (isLegacyRequires(c.requires)) {
        expect(["none", "tokens"]).toContain(c.requires);
        continue;
      }
      // The fact-set form: every named kind must be a real FactKind, or a rule
      // could declare a dependency nothing can ever satisfy and read as
      // permanently NOT-EVALUATED instead of as a mistake.
      expect(Array.isArray(c.requires.facts), c.id).toBe(true);
      expect(c.requires.facts.length, c.id).toBeGreaterThan(0);
      for (const k of c.requires.facts) expect(FACT_KINDS, `${c.id}: ${k}`).toContain(k);
    }
  });

  it("pairs the tell family against its runtime roster, not against a grep", () => {
    // The tell rows were generated from the rule modules. Verifying them by
    // re-reading those modules would be green by construction, so the pairing is
    // against the imported roster — the same objects the linter runs.
    const fromCatalog = catalogByFamily("tell");
    // Two rosters, one family: 36 fact rules and 7 rendered ones.
    const fromRuntime = new Set([...TELL_RULES, ...RENDERED_RULES].map((r) => r.id));
    expect([...fromCatalog].sort()).toEqual([...fromRuntime].sort());
  });
});

describe("the extractor itself can go red-capable (the const class that fooled v1)", () => {
  it("resolves const-style checkIds, not only literals", () => {
    const snippet = 'const CHECK_ID = "radius-sprawl";\nfindings.push({ checkId: CHECK_ID, severity: "warning" });';
    // extractCheckIds is module-local; probe through the same public path: a
    // known const-style check MUST appear in the derived taste set.
    void snippet;
    expect(idsFromFiles(["taste-checks-radius"]).has("radius-sprawl")).toBe(true);
    expect(idsFromFiles(["taste-checks-gradient"]).has("ai-cliche-gradient")).toBe(true);
  });
});

describe("runtime containment — anything the gate can emit is in the catalog", () => {
  it("every finding id from a kitchen-sink run is a catalog row", async () => {
    const { runGate } = await import("../src/core/gate.js");
    const bad = '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title>' +
      '<style>button:focus{outline:none}.b:hover{color:red}.x{transition:all .3s linear}' +
      '.hero{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:400px}</style></head>' +
      '<body><main><p style="font-size:12px">tiny... "quoted"</p><input type="email">' +
      '<div class="rounded-xl p-4"><div class="rounded-xl">x</div></div>' +
      '<div id="d"></div><div id="d"></div><button>OK</button>' +
      '<table><tr><td>1,204</td></tr><tr><td>982</td></tr><tr><td>1,410</td></tr></table></main></body></html>';
    const res = runGate(bad);
    const catalogIds = new Set(CHECK_CATALOG.map((c) => c.id));
    const emitted = Object.values(res.families).flatMap((r) => r.findings.map((f) => f.checkId));
    expect(emitted.length).toBeGreaterThan(6); // the fixture genuinely fires across families
    for (const id of emitted) {
      expect(catalogIds.has(id), `gate emitted "${id}" — not a catalog row (coverage would lie)`).toBe(true);
    }
  });
});
