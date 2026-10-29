import { afterEach, describe, expect, it } from "vitest";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "ds-guidelines");
const NOW = "2026-10-15T00:00:00Z";

/** Lines copied from the pre-fix CX ontology glossary that made the whole file skip with no explanation. */
const CX_LINE_48 = '    avoid: ["required by EU261 at Gia Bình", "law" for programme terms]';
const CX_LINE_71 = '    def: "NN·eNN" — module number and atom id of a quote-anchored evidence atom in the knowledge pack.';
const REFUSED_AT_4 = `terms:\n  - term: Rule (benchmark)\n    def: A rule.\n${CX_LINE_48}\n`;
const REFUSED_REASON = "line 4: `avoid` list item: quoted value is followed by more text";

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

function project(glossary: string): { dir: string; pack: string } {
  const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-refusal-"));
  scratch.push(dir);
  cpSync(join(FIXTURES, "basic"), dir, { recursive: true });
  cpSync(join(FIXTURES, "terminology"), dir, { recursive: true });
  mkdirSync(dirname(join(dir, "ontology", "glossary.yaml")), { recursive: true });
  writeFileSync(join(dir, "ontology", "glossary.yaml"), glossary);
  return { dir, pack: join(dir, "design", "guidelines") };
}
const build = (dir: string) => capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]);
const manifestOf = (pack: string): { skippedSources: { path: string; reason: string }[] } =>
  JSON.parse(readFileSync(join(pack, "guidelines.manifest.json"), "utf8")) as { skippedSources: { path: string; reason: string }[] };

describe("pack build records the line and cause but keeps building", () => {
  it("CX line 48 shape: exit 0, skip reason names the line and cause, CONTEXT.md terms still land", () => {
    const { dir, pack } = project(REFUSED_AT_4);
    expect(build(dir).code).toBe(0);
    expect(manifestOf(pack).skippedSources).toContainEqual({
      path: "ontology/glossary.yaml", reason: `${REFUSED_REASON} — glossary skipped`,
    });
    expect(readFileSync(join(pack, "terminology.md"), "utf8")).toMatch(/^- `term:Panel`/m);
  });

  it("CX line 71 shape: the skip reason names line 4 and the quoted-scalar cause", () => {
    const { dir, pack } = project(`terms:\n  - term: Evidence id\n    vi: Mã bằng chứng\n${CX_LINE_71}\n`);
    expect(build(dir).code).toBe(0);
    expect(manifestOf(pack).skippedSources).toContainEqual({
      path: "ontology/glossary.yaml", reason: "line 4: `def`: quoted value is followed by more text — glossary skipped",
    });
  });

  it("valid YAML in an unsupported shape (nested mapping): line + cause, no claim of invalid YAML", () => {
    const { dir, pack } = project("terms:\n  - term: Invoice\n    def: A request.\n    meta:\n      owner: finance\n");
    expect(build(dir).code).toBe(0);
    const reason = manifestOf(pack).skippedSources.find((s) => s.path === "ontology/glossary.yaml")?.reason ?? "";
    expect(reason).toBe("line 4: unknown field `meta` (supported: term, vi, def, avoid) — glossary skipped");
    expect(reason).not.toMatch(/invalid|malformed|syntax/i);
  });

  it("a whole-file refusal carries no line number", () => {
    const { dir, pack } = project("version: '1'\n");
    expect(build(dir).code).toBe(0);
    expect(manifestOf(pack).skippedSources).toContainEqual({
      path: "ontology/glossary.yaml", reason: "no `terms:` list found — glossary skipped",
    });
  });
});

describe("check names the skipped glossary instead of claiming there is none", () => {
  interface CheckJson { data: { termSpansUnchecked: number; glossarySkipped?: { path: string; reason: string } } }

  /** A good pack, then the glossary replaced by a refused one (and optionally CONTEXT.md removed) before checking. */
  function refusedAtCheckTime(opts: { dropContext: boolean; withSpan: boolean }): string {
    const { dir, pack } = project("terms:\n  - term: Invoice\n    def: A request.\n");
    expect(build(dir).code).toBe(0);
    writeFileSync(join(dir, "ontology", "glossary.yaml"), REFUSED_AT_4);
    if (opts.dropContext) unlinkSync(join(dir, "CONTEXT.md"));
    if (opts.withSpan) appendFileSync(join(pack, "components.md"), "\nSee `term:Anything`.\n");
    return dir;
  }

  it("text: the unchecked-span note carries the refusal, never 'no glossary terms'", () => {
    const dir = refusedAtCheckTime({ dropContext: true, withSpan: true });
    const out = capture(["ds", "guidelines", "check", "--dir", dir]).out;
    // The built terminology.md also holds term: spans that can no longer be judged, so the count is more than the one added.
    expect(out).toMatch(new RegExp(`^ {2}note: \\d+ term: span\\(s\\) not checked — ontology/glossary\\.yaml skipped: ${REFUSED_REASON.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
    expect(out).not.toContain("no glossary terms");
  });

  it("text: the skip is reported even when no span went unchecked (CONTEXT.md still supplies terms)", () => {
    const dir = refusedAtCheckTime({ dropContext: false, withSpan: false });
    const out = capture(["ds", "guidelines", "check", "--dir", dir]).out;
    expect(out).toContain(`  note: ontology/glossary.yaml skipped: ${REFUSED_REASON}\n`);
    expect(out).not.toContain("no glossary terms");
  });

  it("json: the envelope carries the same path and reason", () => {
    const dir = refusedAtCheckTime({ dropContext: true, withSpan: true });
    const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
    const data = (JSON.parse(r.out) as CheckJson).data;
    expect(data.glossarySkipped).toEqual({ path: "ontology/glossary.yaml", reason: REFUSED_REASON });
    expect(data.termSpansUnchecked).toBeGreaterThan(0);
  });

  it("a whole-file refusal is reported without a line", () => {
    const { dir } = project("terms:\n  - term: Invoice\n    def: A request.\n");
    expect(build(dir).code).toBe(0);
    writeFileSync(join(dir, "ontology", "glossary.yaml"), "version: '1'\n");
    const r = capture(["ds", "guidelines", "check", "--dir", dir, "--json"]);
    expect((JSON.parse(r.out) as CheckJson).data.glossarySkipped).toEqual({ path: "ontology/glossary.yaml", reason: "no `terms:` list found" });
  });

  it("no glossary file at all keeps the 'no glossary terms' note and no glossarySkipped key", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-guidelines-noglossary-"));
    scratch.push(dir);
    cpSync(join(FIXTURES, "basic"), dir, { recursive: true });
    expect(build(dir).code).toBe(0);
    appendFileSync(join(dir, "design", "guidelines", "components.md"), "\nSee `term:Anything`.\n");
    const text = capture(["ds", "guidelines", "check", "--dir", dir]).out;
    expect(text).toContain("  note: 1 term: span(s) not checked — this project has no glossary terms\n");
    const json = (JSON.parse(capture(["ds", "guidelines", "check", "--dir", dir, "--json"]).out) as CheckJson).data;
    expect("glossarySkipped" in json).toBe(false);
  });
});
