import { afterEach, describe, expect, it } from "vitest";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "ds-guidelines");
const NOW = "2026-10-15T00:00:00Z";

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

const scratch: string[] = [];
afterEach(() => { for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** Sealed DS + the synthetic rulings fixture, in a private temp project. */
function project(withRulings = true): { dir: string; pack: string } {
  const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-rulings-"));
  scratch.push(dir);
  cpSync(join(FIXTURES, "basic"), dir, { recursive: true });
  if (withRulings) cpSync(join(FIXTURES, "rulings"), dir, { recursive: true });
  return { dir, pack: join(dir, "design", "guidelines") };
}

const build = (dir: string, extra: string[] = []) => capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, ...extra]);
const rulingsPath = (dir: string): string => join(dir, "design", "knowledge", "rulings.json");
const read = (...p: string[]): string => readFileSync(join(...p), "utf8");
const listFiles = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split("\\").join("/")).sort();

interface Finding { code: string; file: string; line: number; message: string }
const check = (dir: string, extra: string[] = []): { code: number; findings: Finding[] } => {
  const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json", ...extra]);
  return { code: r.code, findings: (JSON.parse(r.out) as { data: { findings: Finding[] } }).data.findings };
};
const manifestOf = (pack: string): Record<string, unknown> => JSON.parse(read(pack, "guidelines.manifest.json")) as Record<string, unknown>;

describe("ds guidelines build — rulings tiers", () => {
  it("G-RULINGS-TIERS: tier A -> rulings.md, tier B -> apps/<app>.md, process and superseded absent", () => {
    const { dir, pack } = project();
    expect(build(dir).code).toBe(0);
    expect(listFiles(pack)).toEqual([
      "apps/alpha.md", "apps/beta.md", "components.md", "grammar.md", "guidelines.manifest.json", "overview.md", "rulings.md", "vocabulary.md",
    ]);

    const a = read(pack, "rulings.md");
    expect(a).toMatch(/^- \*\*r-001\*\* — Reuse the shared card before building a new container\. \(since 2026-01-10; source: notes\/layout-review\.md\)$/m);
    // Whitespace inside a ruling collapses to one line; a missing since/source drops its half.
    expect(a).toMatch(/^- \*\*r-002\*\* — Tables scroll horizontally; never wrap column headers onto two lines\. \(since 2026-02-02; source: notes\/tables\.md\)$/m);
    expect(a).toMatch(/^- \*\*r-003\*\* — Status labels use one fixed vocabulary across every screen\.$/m);
    expect(a.match(/^- \*\*r-\d+\*\*/gm)).toEqual(["- **r-001**", "- **r-003**", "- **r-002**", "- **r-013**"]);
    // D12: a global ruling outside the design categories is kept, under its own heading, after the design ones.
    const other = a.indexOf("## Other library-wide rulings");
    expect(other).toBeGreaterThan(a.indexOf("**r-002**"));
    expect(a.indexOf("**r-013**")).toBeGreaterThan(other);
    expect(a).toMatch(/^- \*\*r-013\*\* — Release notes are written in plain language\. \(since 2026-05-04; source: notes\/release-notes\.md\)$/m);

    const alpha = read(pack, "apps", "alpha.md");
    expect(alpha).toMatch(/^# Rulings — alpha$/m);
    expect(alpha.match(/^- \*\*(r-\d+)\*\*/gm)).toEqual(["- **r-004**", "- **r-006**"]);
    const beta = read(pack, "apps", "beta.md");
    expect(beta.match(/^- \*\*(r-\d+)\*\*/gm)).toEqual(["- **r-006**", "- **r-005**"]);

    // Tier C (r-007..r-009) and superseded (r-010, r-011) are in no pack file at all.
    for (const f of listFiles(pack).filter((p) => p.endsWith(".md"))) {
      expect(read(pack, f), f).not.toMatch(/\br-(007|008|009|010|011)\b/);
    }
  });

  it("manifest counts every tier, every category and points at the excluded source", () => {
    const { dir, pack } = project();
    build(dir);
    expect(manifestOf(pack)["rulings"]).toEqual({
      total: 12, tierA: 3, tierAOther: 1, tierB: 3, tierC: 3, superseded: 2,
      byCategory: {
        "app-specific": 1, "component-reuse": 2, "delivery-gates": 2, "figma-scripting": 1, "forms-inputs": 1, "product-decision": 1,
        "screen-composition": 1, tables: 1, "status-vocabulary": 1, "workflow-process": 1,
      },
      excludedSource: "design/knowledge/rulings.json",
    });
  });

  it("every ruling rule resolves to a ruling id in the source file and a non-excluded tier", () => {
    const { dir, pack } = project();
    build(dir);
    const ids = new Set((JSON.parse(read(rulingsPath(dir))) as { rulings: { id: string }[] }).rulings.map((r) => r.id));
    const rules = (manifestOf(pack)["rules"] as { id: string; sources: { path: string; ruling?: string }[] }[])
      .filter((r) => r.sources.some((s) => s.ruling !== undefined));
    expect(rules).toHaveLength(8); // 3 tier A + 1 other library-wide + alpha (r-004, r-006) + beta (r-005, r-006)
    for (const r of rules) {
      for (const s of r.sources) {
        expect(existsSync(join(dir, s.path))).toBe(true);
        expect(ids.has(s.ruling ?? "")).toBe(true);
        expect(["r-007", "r-008", "r-009", "r-010", "r-011"]).not.toContain(s.ruling);
      }
    }
  });

  it("is byte-identical across builds, apps files included", () => {
    const { dir } = project();
    build(dir, ["--out", join(dir, "a")]);
    build(dir, ["--out", join(dir, "b")]);
    expect(listFiles(join(dir, "a"))).toEqual(listFiles(join(dir, "b")));
    for (const f of listFiles(join(dir, "a"))) expect(read(dir, "a", f) === read(dir, "b", f), f).toBe(true);
  });

  it("an absent rulings file is skipped with a reason, never an error", () => {
    const { dir, pack } = project(false);
    expect(build(dir).code).toBe(0);
    expect(listFiles(pack)).not.toContain("rulings.md");
    const m = manifestOf(pack);
    expect(m["rulings"]).toBeUndefined();
    expect(m["skippedSources"]).toContainEqual({ path: "design/knowledge/rulings.json", reason: expect.stringMatching(/not found/) });
  });

  it("--rulings points at another file; a missing one is skipped under its own path", () => {
    const { dir, pack } = project(false);
    cpSync(join(FIXTURES, "rulings", "design", "knowledge", "rulings.json"), join(dir, "elsewhere.json"));
    expect(build(dir, ["--rulings", join(dir, "elsewhere.json")]).code).toBe(0);
    expect((manifestOf(pack)["rulings"] as { total: number }).total).toBe(12);
    expect(build(dir, ["--rulings", join(dir, "nope.json")]).code).toBe(0);
    expect(manifestOf(pack)["skippedSources"]).toContainEqual({ path: "nope.json", reason: expect.stringMatching(/not found/) });
  });

  it("a malformed rulings file is BAD_RULINGS naming the path, and nothing is written", () => {
    for (const body of ["{ not json", "[]", '{ "rulings": [ { "id": "x", "category": "c", "text": "t", "scope": "everywhere" } ] }', '{ "rulings": [ { "id": "", "category": "c", "text": "t", "scope": "global" } ] }']) {
      const { dir, pack } = project();
      writeFileSync(rulingsPath(dir), body);
      const r = capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW, "--json"]);
      expect(r.code, body).toBe(1);
      const error = (JSON.parse(r.out) as { error: { code: string; message: string } }).error;
      expect(error.code).toBe("BAD_RULINGS");
      expect(error.message).toContain("design/knowledge/rulings.json");
      expect(existsSync(pack)).toBe(false);
    }
  });
});

describe("ds guidelines check — rulings", () => {
  it("a fresh pack with rulings is clean, and a multi-app ruling in two app files is not a duplicate", () => {
    const { dir, pack } = project();
    build(dir);
    expect(read(pack, "apps", "alpha.md")).toMatch(/\*\*r-006\*\*/);
    expect(read(pack, "apps", "beta.md")).toMatch(/\*\*r-006\*\*/);
    expect(check(dir)).toEqual({ code: 0, findings: [] });
  });

  it("G-CHECK-DUP: the same rule in two files is DUPLICATE_RULE at the later file:line", () => {
    const { dir, pack } = project();
    build(dir);
    const first = read(pack, "rulings.md").split("\n").findIndex((l) => l.startsWith("- **r-001**")) + 1;
    writeFileSync(join(pack, "anti-patterns.md"), "# Anti-patterns\n\n- REUSE the shared card, before building a new container!\n");
    const text = capture(["ds", "guidelines", "check", "--dir", dir]);
    expect(text.code).toBe(1);
    expect(text.out).toMatch(new RegExp(`^ {2}✗ \\[DUPLICATE_RULE\\] anti-patterns\\.md:3: same rule as rulings\\.md:${first} `, "m"));
    expect(check(dir).findings).toHaveLength(1);
  });

  it("G-CHECK-DUP: short list items and repeats inside one file are not duplicates", () => {
    const { dir, pack } = project();
    build(dir);
    writeFileSync(join(pack, "anti-patterns.md"), "- none yet\n- none yet\n- Reuse the shared card before building a new container.\n- Reuse the shared card before building a new container.\n");
    writeFileSync(join(pack, "scenarios.md"), "- none yet\n");
    // Both copies repeat the ruling that rulings.md owns, so each is reported.
    expect(check(dir).findings.map((f) => `${f.code}:${f.file}:${f.line}`)).toEqual([
      "DUPLICATE_RULE:anti-patterns.md:3", "DUPLICATE_RULE:anti-patterns.md:4",
    ]);
  });

  it("G-RULINGS-SUPERSEDED: host-written text citing a superseded id is SUPERSEDED_CITED", () => {
    const { dir, pack } = project();
    build(dir);
    const file = join(pack, "components.md");
    const before = readFileSync(file, "utf8");
    writeFileSync(file, `${before}\nPer r-010 every screen gets its own container; r-001 says otherwise.\nr-0101 and xr-010 are other things.\n`);
    const line = before.split("\n").length + 1;
    const f = check(dir);
    expect(f.code).toBe(1);
    expect(f.findings).toHaveLength(1);
    expect(f.findings[0]).toMatchObject({ code: "SUPERSEDED_CITED", file: "components.md", line });
    expect(f.findings[0]?.message).toContain("r-010");
  });

  it("an active ruling that mentions a superseded id in its own text keeps the fresh pack clean (generated text is the owner's)", () => {
    const { dir } = project();
    const data = JSON.parse(read(rulingsPath(dir))) as { rulings: Record<string, unknown>[] };
    data.rulings.push({ id: "r-012", category: "tables", text: "Keep headers on one line, as r-010 never allowed.", scope: "global", source: [] });
    writeFileSync(rulingsPath(dir), JSON.stringify(data));
    expect(build(dir).code).toBe(0);
    expect(check(dir)).toEqual({ code: 0, findings: [] });
  });

  it("without a rulings file there are no superseded ids to enforce", () => {
    const { dir, pack } = project();
    build(dir);
    unlinkSync(rulingsPath(dir));
    writeFileSync(join(pack, "components.md"), `${read(pack, "components.md")}\nPer r-010 every screen differs.\n`);
    expect(check(dir).code).toBe(0);
  });

  it("PACK_INCOMPLETE: a manifest-listed file that is gone", () => {
    const { dir, pack } = project();
    build(dir);
    unlinkSync(join(pack, "apps", "beta.md"));
    const text = capture(["ds", "guidelines", "check", "--dir", dir]);
    expect(text.code).toBe(1);
    expect(text.out).toMatch(/^ {2}✗ \[PACK_INCOMPLETE\] apps\/beta\.md:1: listed in the manifest but missing from the pack$/m);
  });

  it("PACK_INCOMPLETE: a generated block recorded in the manifest but deleted from its file", () => {
    const { dir, pack } = project();
    build(dir);
    const lines = read(pack, "rulings.md").split("\n");
    const open = lines.findIndex((l) => /^<!-- ds-guidelines:generated id=rulings\.tables /.test(l));
    const close = lines.findIndex((l, i) => i > open && l === "<!-- /ds-guidelines:generated -->");
    lines.splice(open, close - open + 1);
    writeFileSync(join(pack, "rulings.md"), lines.join("\n"));
    const f = check(dir).findings;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ code: "PACK_INCOMPLETE", file: "rulings.md", line: 1 });
    expect(f[0]?.message).toContain("rulings.tables");
  });

  it("PACK_INCOMPLETE: a missing or unreadable manifest, but unlisted extra files are fine", () => {
    const { dir, pack } = project();
    build(dir);
    writeFileSync(join(pack, "scratch-notes.md"), "# Notes\n");
    expect(check(dir).code).toBe(0);
    writeFileSync(join(pack, "guidelines.manifest.json"), "{ nope");
    expect(check(dir).findings[0]).toMatchObject({ code: "PACK_INCOMPLETE", file: "guidelines.manifest.json" });
    unlinkSync(join(pack, "guidelines.manifest.json"));
    expect(check(dir).findings[0]).toMatchObject({ code: "PACK_INCOMPLETE", file: "guidelines.manifest.json" });
  });

  it("check reads --rulings too, and a malformed one is BAD_RULINGS", () => {
    const { dir } = project();
    build(dir);
    writeFileSync(rulingsPath(dir), "{ nope");
    const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_RULINGS");
  });
});
