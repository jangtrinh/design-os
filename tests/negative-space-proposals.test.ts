/**
 * Negative-space proposals: a harvest writes proposals only. The binding `## Never` and
 * `_adherence.rules.json` are never written; the harvester owns exactly one soul block and one rules file;
 * `--accept` moves a machine rule atomically. These tests use a soul with real content and compare bytes.
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { harvestNegativeSpace } from "../src/core/negative-space-harvester.js";
import { acceptProposal, planProposals, writeProposals } from "../src/core/negative-space-proposals.js";
import type { AcceptIO } from "../src/core/negative-space-proposals.js";
import { applyProposedNeverBlock, bindingNeverIds, checkSoul, PROPOSED_NEVER_HEADING } from "../src/core/ds-soul.js";
import { loadAdherenceRules } from "../src/core/adherence-rules.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "oi-browser", "source", "native");

const REAL_SOUL = `---
status: ratified
owner: jang
---

# Design Soul — Ổi Browser

_Declared stance. Short beats long._

## Never

- Purple gradients on any surface (see the brand deck).
- Decorative drop shadows — elevation comes from tokens.

## Always

- Oversized display type.

## Voice

- Plain-spoken, Vietnamese-first, zero filler.

<!-- owner note: revisit voice after the Q4 research -->
`;
const RULES = `{
  "rules": [
    { "id": "no-purple", "kind": "token-ban", "severity": "error", "message": "no purple", "source": "owner ruling", "tokens": ["purple"] }
  ]
}
`;

interface Project { root: string; design: string; src: string }
function project(opts: { soul?: string | null; rules?: string; files?: Record<string, string> } = {}): Project {
  const root = mkdtempSync(join(tmpdir(), "ns-prop-"));
  const design = join(root, "design");
  const src = join(root, "src");
  mkdirSync(join(design, "rules"), { recursive: true });
  mkdirSync(src);
  const soul = opts.soul === undefined ? REAL_SOUL : opts.soul;
  if (soul !== null) writeFileSync(join(design, "soul.md"), soul);
  if (opts.rules !== undefined) writeFileSync(join(design, "rules", "_adherence.rules.json"), opts.rules);
  for (const [rel, text] of Object.entries(opts.files ?? { "app.html": `<h1>Hi</h1>` })) writeFileSync(join(src, rel), text);
  return { root, design, src };
}
const read = (p: string): string => readFileSync(p, "utf8");
const soulOf = (p: Project): string => read(join(p.design, "soul.md"));
const proposedPath = (p: Project): string => join(p.design, "rules", "_adherence.proposed.json");
const rulesPath = (p: Project): string => join(p.design, "rules", "_adherence.rules.json");
function harvestWrite(p: Project, label = "src/") {
  const report = harvestNegativeSpace({ sourceDir: p.src, designDir: p.design });
  return { report, ...writeProposals(p.design, report, label) };
}
/** The soul with the harvester's block cut out: must equal the soul before the harvest. */
function withoutBlock(text: string): string {
  const start = text.indexOf(PROPOSED_NEVER_HEADING);
  const next = text.indexOf("\n## ", start + 1);
  return text.slice(0, start) + text.slice(next + 1);
}

describe("soul block ownership", () => {
  it("leaves every byte outside the proposed block untouched and places it right after the binding Never", () => {
    const p = project();
    harvestWrite(p);
    const after = soulOf(p);
    expect(withoutBlock(after)).toBe(REAL_SOUL);
    const at = (s: string): number => after.indexOf(s);
    expect(at("## Never\n")).toBeLessThan(at(PROPOSED_NEVER_HEADING));
    expect(at(PROPOSED_NEVER_HEADING)).toBeLessThan(at("## Always"));
    expect(after).toContain("- NS-01 monospace on UI controls or tables — 0 of 1 scanned files under src/");
  });
  it("replaces the block on re-run instead of appending, and the second run changes nothing", () => {
    const p = project();
    harvestWrite(p);
    const first = soulOf(p);
    const second = harvestWrite(p);
    expect(soulOf(p)).toBe(first);
    expect(second.soul.changed).toBe(false);
    expect(second.proposedRules.changed).toBe(false);
    expect(first.split(PROPOSED_NEVER_HEADING)).toHaveLength(2);
  });
  it("drops a proposal when its probe starts finding the cliche (replace, not append)", () => {
    const p = project();
    harvestWrite(p);
    expect(soulOf(p)).toContain("- NS-01 ");
    writeFileSync(join(p.src, "app.html"), `<p class="font-mono">x</p>`);
    harvestWrite(p);
    expect(soulOf(p)).not.toContain("- NS-01 ");
    expect(withoutBlock(soulOf(p))).toBe(REAL_SOUL);
    expect(loadAdherenceRules(p.design).proposed.map((r) => r.rule.id)).not.toContain("NS-01");
  });
  it("keeps owner text placed after the block and a soul with trailing comments intact", () => {
    const p = project();
    harvestWrite(p);
    const withNote = soulOf(p).replace("\n## Always", "\n- my own note about proposals\n\n## Always");
    writeFileSync(join(p.design, "soul.md"), withNote);
    harvestWrite(p);
    expect(soulOf(p)).toContain("- my own note about proposals");
    expect(soulOf(p)).toContain("<!-- owner note: revisit voice after the Q4 research -->");
  });
  it("creates the soul from the scaffold when absent, and never overwrites a present one", () => {
    const p = project({ soul: null });
    harvestWrite(p);
    expect(soulOf(p)).toContain("## Never\n");
    expect(soulOf(p)).toContain(PROPOSED_NEVER_HEADING);
    expect(withoutBlock(soulOf(p))).toContain("# Design Soul");
  });
  it("writes no soul at all when there is nothing to propose and none exists", () => {
    const p = project({ soul: null, files: { "app.html": `<p class="font-mono uppercase">x</p>` } });
    const r = harvestWrite(p);
    expect(r.plan.filter((x) => x.status === "propose").length).toBeGreaterThan(0); // other probes still zero
    const q = project({ soul: null, files: {} });
    const none = harvestWrite(q);
    expect(none.plan.every((x) => x.status !== "propose")).toBe(true);
    expect(existsSync(join(q.design, "soul.md"))).toBe(false);
    expect(existsSync(proposedPath(q))).toBe(false);
  });
  it("applyProposedNeverBlock keeps CRLF files CRLF", () => {
    const crlf = REAL_SOUL.replace(/\n/g, "\r\n");
    const out = applyProposedNeverBlock(crlf, ["- NS-01 x — 0 of 1 scanned files under src/"]);
    expect(out.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });
});

describe("binding files are never written by a harvest", () => {
  it("the binding Never section and _adherence.rules.json stay byte-identical", () => {
    const p = project({ rules: RULES });
    const before = { rules: read(rulesPath(p)), never: bindingNever(REAL_SOUL) };
    harvestWrite(p);
    expect(read(rulesPath(p))).toBe(before.rules);
    expect(bindingNever(soulOf(p))).toBe(before.never);
  });
  it("does not create _adherence.rules.json", () => {
    const p = project();
    harvestWrite(p);
    expect(existsSync(rulesPath(p))).toBe(false);
  });
  it("a comment-only binding Never still fails soul check next to a filled proposed block", () => {
    const comment = REAL_SOUL.replace(/## Never\n[\s\S]*?\n## Always/, "## Never\n\n- <!-- what this system NEVER does -->\n\n## Always");
    const p = project({ soul: comment });
    harvestWrite(p);
    expect(soulOf(p)).toContain("- NS-01 ");
    const result = checkSoul(soulOf(p));
    expect(result.findings.some((f) => f.checkId === "soul-empty-section" && f.message.includes("## Never") && f.severity === "error")).toBe(true);
    expect(result.errorCount).toBeGreaterThan(0);
  });
  it("skips an id already promoted in the binding Never or in _adherence.rules.json", () => {
    const soul = REAL_SOUL.replace("- Decorative drop shadows", "- NS-10 no gradients — owner ruling.\n- Decorative drop shadows");
    const rules = JSON.stringify({ rules: [{ id: "NS-01", kind: "token-ban", severity: "error", message: "m", source: "s", tokens: ["monospace"] }] });
    const p = project({ soul, rules });
    const { plan } = harvestWrite(p);
    expect(plan.find((x) => x.id === "NS-10")).toMatchObject({ status: "skip-promoted" });
    expect(plan.find((x) => x.id === "NS-01")).toMatchObject({ status: "skip-promoted" });
    expect(soulOf(p)).not.toContain("- NS-10 monospace");
    expect(bindingNeverIds(soul)).toEqual(["NS-10"]);
  });
});

describe("proposals follow the evidence", () => {
  it("proposes only probes with zero hits over at least one scanned file", () => {
    const p = project({ files: { "app.html": `<p class="font-mono">x</p><a class="bg-gradient-to-r">y</a>` } });
    const { plan } = harvestWrite(p);
    expect(plan.find((x) => x.id === "NS-01")).toMatchObject({ status: "skip-nonzero" });
    expect(plan.find((x) => x.id === "NS-10")).toMatchObject({ status: "skip-nonzero" });
    expect(plan.find((x) => x.id === "NS-05")).toMatchObject({ status: "propose" });
  });
  it("proposes nothing when no UI source file was read", () => {
    const p = project({ files: { "notes.md": "x" } });
    const { plan } = harvestWrite(p);
    expect(plan.every((x) => x.status === "skip-no-files")).toBe(true);
  });
  it("writes machine rules only for probes a rule kind can express, and the file validates with the loader", () => {
    const p = project();
    harvestWrite(p);
    const loaded = loadAdherenceRules(p.design);
    expect(loaded.binding).toEqual([]);
    const ids = loaded.proposed.map((r) => r.rule.id);
    expect(ids).toEqual(["NS-01", "NS-10", "NS-11"]);
    const ns01 = loaded.proposed[0]?.rule;
    expect(ns01).toMatchObject({ kind: "token-ban", severity: "error", excludeElements: ["code", "pre"] });
    expect(ns01?.source).toContain("ui ds harvest-bans");
    expect(soulOf(p).match(/^- NS-\d\d /gm)).toHaveLength(12);
  });
  it("preserves a rule the owner added to the proposed file and replaces only the ones it manages", () => {
    const p = project();
    harvestWrite(p);
    const doc = JSON.parse(read(proposedPath(p))) as { rules: unknown[] };
    doc.rules.push({ id: "owner-idea", kind: "token-ban", severity: "warning", message: "m", source: "owner", tokens: ["blink"] });
    writeFileSync(proposedPath(p), JSON.stringify(doc, null, 2) + "\n");
    harvestWrite(p);
    expect(loadAdherenceRules(p.design).proposed.map((r) => r.rule.id)).toEqual(["owner-idea", "NS-01", "NS-10", "NS-11"]);
  });
  it("planProposals words the evidence with the denominator and the excluded count", () => {
    const p = project({ files: { "app.html": `<p>Receipt <code class="font-mono">id</code></p>` } });
    const report = harvestNegativeSpace({ sourceDir: p.src });
    const bullet = planProposals(report, { bindingRuleIds: new Set(), boundNeverIds: new Set() }, "src/").find((x) => x.id === "NS-01")?.bullet;
    expect(bullet).toBe("- NS-01 monospace on UI controls or tables — 0 of 1 scanned files under src/ (1 excluded: inside <code>)");
  });
});

describe("--accept moves a machine rule atomically", () => {
  function accepted(): Project {
    const p = project({ rules: RULES });
    harvestWrite(p);
    return p;
  }
  it("appends to the binding rules, removes it from proposed, and leaves soul.md alone", () => {
    const p = accepted();
    const soulBefore = soulOf(p);
    const r = acceptProposal(p.design, "NS-10");
    expect(r.id).toBe("NS-10");
    const loaded = loadAdherenceRules(p.design);
    expect(loaded.binding.map((x) => x.rule.id)).toEqual(["no-purple", "NS-10"]);
    expect(loaded.proposed.map((x) => x.rule.id)).toEqual(["NS-01", "NS-11"]);
    expect(soulOf(p)).toBe(soulBefore);
  });
  it("creates the binding file when none exists", () => {
    const p = project();
    harvestWrite(p);
    acceptProposal(p.design, "NS-01");
    expect(loadAdherenceRules(p.design).binding.map((x) => x.rule.id)).toEqual(["NS-01"]);
  });
  it("a harvest after an accept does not propose the promoted id again", () => {
    const p = accepted();
    acceptProposal(p.design, "NS-10");
    harvestWrite(p);
    expect(loadAdherenceRules(p.design).proposed.map((x) => x.rule.id)).toEqual(["NS-01", "NS-11"]);
    expect(loadAdherenceRules(p.design).binding.map((x) => x.rule.id)).toEqual(["no-purple", "NS-10"]);
  });
  it("refuses a bullet-only probe with BAD_ARG, saying its rule comes with its rule kind and the bullet can be moved by hand", () => {
    const p = accepted();
    expect(() => acceptProposal(p.design, "NS-04")).toThrowError(/rule kind/);
    try { acceptProposal(p.design, "NS-04"); } catch (e) {
      expect((e as { code: string }).code).toBe("BAD_ARG");
      expect((e as Error).message).toMatch(/move the bullet into '## Never' by hand/);
    }
  });
  it("refuses an unknown id and a known id that is not in the proposed file", () => {
    const p = accepted();
    for (const id of ["NS-99", "banana"]) {
      try { acceptProposal(p.design, id); throw new Error("did not throw"); } catch (e) { expect((e as { code: string }).code).toBe("BAD_ARG"); }
    }
    writeFileSync(proposedPath(p), JSON.stringify({ rules: [] }));
    expect(() => acceptProposal(p.design, "NS-01")).toThrowError(/not in/);
  });
  it("refuses when either file is invalid, naming the loader's code, and changes nothing", () => {
    const p = accepted();
    writeFileSync(rulesPath(p), "{ not json");
    const before = [read(rulesPath(p)), read(proposedPath(p))];
    try { acceptProposal(p.design, "NS-10"); throw new Error("did not throw"); } catch (e) { expect((e as { code: string }).code).toBe("ADHERENCE_BAD_JSON"); }
    expect([read(rulesPath(p)), read(proposedPath(p))]).toEqual(before);
  });
  const failingOn = (target: string): AcceptIO => ({
    write: (path, text) => { if (path === target) throw new Error("disk full"); writeFileSync(path, text); },
  });
  it("a failed write to the proposed file leaves both files byte-identical", () => {
    const p = accepted();
    const before = [read(rulesPath(p)), read(proposedPath(p))];
    expect(() => acceptProposal(p.design, "NS-10", failingOn(proposedPath(p)))).toThrowError(/disk full/);
    expect([read(rulesPath(p)), read(proposedPath(p))]).toEqual(before);
  });
  it("a failed write to the binding file leaves both files byte-identical (the proposal is never lost)", () => {
    const p = accepted();
    const before = [read(rulesPath(p)), read(proposedPath(p))];
    expect(() => acceptProposal(p.design, "NS-10", failingOn(rulesPath(p)))).toThrowError(/disk full/);
    expect([read(rulesPath(p)), read(proposedPath(p))]).toEqual(before);
  });
  it("a failed write that created the binding file removes it again", () => {
    const p = project();
    harvestWrite(p);
    const before = read(proposedPath(p));
    expect(() => acceptProposal(p.design, "NS-01", failingOn(proposedPath(p)))).toThrowError(/disk full/);
    expect(existsSync(rulesPath(p))).toBe(false);
    expect(read(proposedPath(p))).toBe(before);
  });
});

describe("AC-1 on the real native source", () => {
  it("proposes at least six bullets, validates the proposed file, and leaves the binding files byte-identical", () => {
    const root = mkdtempSync(join(tmpdir(), "ns-ac1-"));
    const design = join(root, "design");
    mkdirSync(join(design, "rules"), { recursive: true });
    writeFileSync(join(design, "soul.md"), REAL_SOUL);
    writeFileSync(join(design, "rules", "_adherence.rules.json"), RULES);
    const report = harvestNegativeSpace({ sourceDir: FIXTURE, designDir: design });
    const written = writeProposals(design, report, "native/");
    const bullets = soulOf({ root, design, src: FIXTURE }).match(/^- NS-\d\d .*$/gm) ?? [];
    expect(bullets.length).toBeGreaterThanOrEqual(6);
    for (const id of ["NS-01", "NS-02", "NS-04", "NS-05"]) expect(bullets.some((b) => b.startsWith(`- ${id} `)), id).toBe(true);
    expect(bullets.find((b) => b.startsWith("- NS-01 "))).toContain("(1 excluded: inside <code>)");
    expect(written.plan.filter((x) => x.status === "propose").length).toBe(bullets.length);
    expect(loadAdherenceRules(design).proposed.length).toBeGreaterThan(0);
    expect(read(join(design, "rules", "_adherence.rules.json"))).toBe(RULES);
    expect(withoutBlock(read(join(design, "soul.md")))).toBe(REAL_SOUL);
  });
});

function bindingNever(text: string): string {
  const start = text.indexOf("## Never\n");
  return text.slice(start, text.indexOf("\n## ", start + 1));
}
