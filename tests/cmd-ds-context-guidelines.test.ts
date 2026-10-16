import { afterEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { answerAll, build, bulkRulings, capture, cleanScratch, project, read, writeJson } from "./helpers/guidelines-harness.js";

afterEach(cleanScratch);

const context = (dir: string, extra: string[] = []) => capture(["ds", "context", "--dir", dir, ...extra]);
const sectionOf = (out: string): string => out.slice(out.indexOf("## Guidelines pack"));
const bytes = (s: string): number => Buffer.byteLength(s, "utf8");

interface Structured {
  guidelines: null | {
    generatedAt: string; ruleCount: number; openQuestions: number; seal: string;
    files: { path: string; bytes: number }[];
    scenarios: { id: string; title: string; status: string }[];
    rulings: { id: string; text: string }[];
    dropped: { rulings: number; scenarios: number };
  };
}

describe("ds context --include guidelines", () => {
  it("emits the file index, the scenario titles with their status and the tier-A rulings", () => {
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    const r = context(p.dir, ["--include", "guidelines"]);
    expect(r.code).toBe(0);
    const s = sectionOf(r.out);
    expect(s).toMatch(/^## Guidelines pack \(design\/guidelines, built 2026-10-15, \d+ rule\(s\), \d+ open question\(s\)\)$/m);
    expect(s).toMatch(/^- anti-patterns\.md \([\d,]+ B\)$/m);
    expect(s).toMatch(/^- apps\/alpha\.md \(|^- vocabulary\.md \(/m);
    // Scenario titles come from anti-patterns.md, each with its slot id and status.
    expect(s).toMatch(/^### Scenarios$/m);
    expect(s).toMatch(/^- Ruling r-002 — tables \(ap-ruling-r-002\) — open$/m);
    expect(s).toMatch(/^- Convention \(Layout\): raw \/ absolute \(NONE-layout\) frames \(ap-conv-layout-[0-9a-f]{8}\) — open$/m);
    // Tier-A rulings: id and text, without the since/source tail; other-library-wide and app rulings are not tier A.
    expect(s).toMatch(/^### Library-wide rulings \(tier A\)$/m);
    expect(s).toMatch(/^- r-001 — Reuse the shared card before building a new container\.$/m);
    expect(s).toMatch(/^- r-003 — Status labels use one fixed vocabulary across every screen\.$/m);
    expect(s).not.toMatch(/r-013|r-004|r-006/);
    // Only the guidelines section was asked for.
    expect(r.out).not.toMatch(/^## Tokens|^## Registered components|^## Naming rules/m);
  });

  it("an answered scenario is shown as answered", () => {
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    answerAll(p.pack);
    const s = sectionOf(context(p.dir, ["--include", "guidelines"]).out);
    expect(s).toMatch(/^- Ruling r-002 — tables \(ap-ruling-r-002\) — answered$/m);
    expect(s).not.toMatch(/— open$/m);
  });

  it("is not part of the default include set, and combines with the others", () => {
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    expect(context(p.dir).out).not.toMatch(/Guidelines pack/);
    const both = context(p.dir, ["--include", "tokens,guidelines"]).out;
    expect(both).toMatch(/^## Guidelines pack/m);
    expect(both).toMatch(/^## Roles$/m);
    const bad = capture(["ds", "context", "--dir", p.dir, "--include", "nope", "--json"]);
    expect(bad.code).toBe(1);
    expect((JSON.parse(bad.out) as { error: { message: string } }).error.message).toMatch(/Valid sections: tokens, registry, naming, anti-patterns, soul, guidelines/);
  });

  it("an absent pack omits the section and is never an error", () => {
    const p = project(["rulings"]);
    const r = context(p.dir, ["--include", "guidelines"]);
    expect(r.code).toBe(0);
    expect(r.out).not.toMatch(/Guidelines pack/);
    const j = capture(["ds", "context", "--dir", p.dir, "--include", "guidelines", "--format", "json"]);
    expect(j.code).toBe(0);
    expect((JSON.parse(j.out) as Structured).guidelines).toBeNull();
  });

  it("a pack whose manifest cannot be read is reported in one line, not as an error", () => {
    const p = project(["rulings"]);
    build(p.dir);
    writeFileSync(join(p.pack, "guidelines.manifest.json"), "{ nope");
    const r = context(p.dir, ["--include", "guidelines"]);
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^## Guidelines pack \(design\/guidelines\)$/m);
    expect(r.out).toMatch(/^\(guidelines\.manifest\.json is unreadable — run 'ui ds guidelines check'\)$/m);
  });

  it("--max-bytes bounds the section: rulings are dropped first, and the drop is stated", () => {
    const p = project(["terminology"]);
    writeJson(join(p.dir, "design", "knowledge", "rulings.json"), bulkRulings({ global: 600, alpha: 0, beta: 0 }));
    build(p.dir);
    const r = context(p.dir, ["--include", "guidelines", "--max-bytes", "4096"]);
    const s = sectionOf(r.out);
    expect(bytes(s)).toBeLessThanOrEqual(4096);
    const shown = s.match(/^- g-\d+ — /gm)?.length ?? 0;
    const note = /^_dropped to fit --max-bytes 4096: (\d+) ruling\(s\)(?:, (\d+) scenario title\(s\))?_$/m.exec(s);
    expect(note).not.toBeNull();
    expect(shown + Number(note?.[1])).toBe(600);
    expect(shown).toBeGreaterThan(0);
    expect(s).toMatch(/^- g-0001 — /m); // the first rulings stay, the tail goes
    expect(s).toMatch(/^- anti-patterns\.md \(/m); // the file index is never dropped
    expect(s).toMatch(/^- Convention \(Layout\)/m); // scenario titles outlive the rulings
    const roomy = sectionOf(context(p.dir, ["--include", "guidelines", "--max-bytes", "400000"]).out);
    expect(roomy).not.toMatch(/_dropped/);
    expect(roomy.match(/^- g-\d+ — /gm)).toHaveLength(600);
  });

  it("scenario titles are dropped only after every ruling is gone", () => {
    const p = project(["terminology"]);
    writeJson(join(p.dir, "design", "knowledge", "rulings.json"), bulkRulings({ global: 40, alpha: 0, beta: 0 }));
    build(p.dir);
    const full = sectionOf(context(p.dir, ["--include", "guidelines", "--max-bytes", "400000"]).out);
    const tight = sectionOf(context(p.dir, ["--include", "guidelines", "--max-bytes", String(bytes(full) - 1)]).out);
    expect(bytes(tight)).toBeLessThan(bytes(full));
    expect(tight).toMatch(/^_dropped to fit --max-bytes \d+: \d+ ruling\(s\)_$/m); // rulings first; no scenario clause yet
    const tiny = sectionOf(context(p.dir, ["--include", "guidelines", "--max-bytes", "500"]).out);
    expect(tiny).toMatch(/^_dropped to fit --max-bytes 500: 40 ruling\(s\), \d+ scenario title\(s\)_$/m);
    expect(bytes(tiny)).toBeLessThanOrEqual(500);
  });

  it("--format json obeys --max-bytes too, and counts what it dropped", () => {
    const p = project(["terminology"]);
    writeJson(join(p.dir, "design", "knowledge", "rulings.json"), bulkRulings({ global: 600, alpha: 0, beta: 0 }));
    build(p.dir);
    const j = JSON.parse(capture(["ds", "context", "--dir", p.dir, "--include", "guidelines", "--format", "json", "--max-bytes", "4096"]).out) as Structured;
    expect(bytes(JSON.stringify(j.guidelines))).toBeLessThanOrEqual(4096);
    expect(j.guidelines?.dropped.rulings).toBeGreaterThan(0);
    expect((j.guidelines?.rulings.length ?? 0) + (j.guidelines?.dropped.rulings ?? 0)).toBe(600);
  });

  it("--format json carries the same data, with the same budget rule", () => {
    const p = project(["rulings", "terminology"]);
    build(p.dir);
    const j = JSON.parse(capture(["ds", "context", "--dir", p.dir, "--include", "guidelines", "--format", "json"]).out) as Structured;
    expect(j.guidelines).toMatchObject({ generatedAt: "2026-10-15T00:00:00Z", seal: "verified", dropped: { rulings: 0, scenarios: 0 } });
    expect(j.guidelines?.files.map((f) => f.path)).toContain("anti-patterns.md");
    expect(j.guidelines?.scenarios[0]).toEqual({ id: "ap-ruling-r-002", title: "Ruling r-002 — tables", status: "open" });
    expect(j.guidelines?.rulings.map((r) => r.id)).toEqual(["r-001", "r-003", "r-002"]);
    expect(read(p.pack, "guidelines.manifest.json")).toContain('"ruleCount"');
  });
});
