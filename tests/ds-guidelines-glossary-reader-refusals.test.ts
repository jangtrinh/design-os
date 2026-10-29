import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { formatGlossaryRefusal, parseGlossaryYaml } from "../src/core/ds-guidelines-glossary-yaml-reader.js";

const FIXTURES = join(import.meta.dirname, "fixtures", "ds-guidelines");
const NOW = "2026-10-15T00:00:00Z";

/** Lines copied from the pre-fix CX ontology glossary that made the whole file skip with no explanation. */
const CX_LINE_48 = '    avoid: ["required by EU261 at Gia Bình", "law" for programme terms]';
const CX_LINE_71 = '    def: "NN·eNN" — module number and atom id of a quote-anchored evidence atom in the knowledge pack.';

function refusalOf(text: string): { line: number; reason: string } {
  const r = parseGlossaryYaml(text, "ontology/glossary.yaml");
  if (r.ok) throw new Error(`expected a refusal, parsed ${r.terms.length} terms`);
  return { line: r.line, reason: r.reason };
}

describe("glossary reader refusals — one reason per refusal site", () => {
  // [label, text, expected line (0 = whole file), expected reason]
  const cases: [string, string, number, string][] = [
    // ── scalar()
    ["CX line 48: quoted list item followed by bare words",
      `terms:\n  - term: Rule (benchmark)\n    def: A rule.\n${CX_LINE_48}\n`,
      4, "`avoid` list item: quoted value is followed by more text"],
    ["CX line 71: quoted scalar followed by text",
      `terms:\n  - term: Evidence id\n    vi: Mã bằng chứng\n${CX_LINE_71}\n`,
      4, "`def`: quoted value is followed by more text"],
    ["quoted value never closes", 'terms:\n  - term: A\n    def: "abc\n', 3,
      "`def`: quoted value is not closed on this line"],
    ["double-quoted backslash escape", 'terms:\n  - term: A\n    def: "a\\nb"\n', 3,
      "`def`: double-quoted value contains a backslash escape"],
    ["flow collection outside avoid", "terms:\n  - term: A\n    def: [a, b]\n", 3,
      "`def`: flow collection is only supported for `avoid`"],
    ["block scalar", "terms:\n  - term: A\n    def: |\n      text\n", 3,
      "`def`: block scalar (`|` or `>`) is not supported"],
    ["anchor on the term", "terms:\n  - term: &x Invoice\n    def: d\n", 2,
      "`term`: anchor, alias or tag is not supported"],
    ["reserved indicator", "terms:\n  - term: A\n    def: %raw\n", 3,
      "`def`: value starts with a YAML indicator (`%`)"],
    ["colon inside a plain value", "terms:\n  - term: A\n    def: A request: for payment.\n", 3,
      "`def`: plain value contains a colon (quote the value)"],
    ["plain value ends with a colon", "terms:\n  - term: A\n    def: Note:\n", 3,
      "`def`: plain value contains a colon (quote the value)"],
    ["trailing comment on a plain value", "terms:\n  - term: A\n    def: text # why\n", 3,
      "`def`: plain value has a trailing comment (remove it or quote the value)"],
    ["empty value opens a nested block (block avoid list)", "terms:\n  - term: A\n    def: d\n    avoid:\n      - bill\n", 4,
      "`avoid`: value is empty or opens a nested block, which is not supported"],
    ["empty top-level value (nested map before terms)", "meta:\n  owner: x\nterms:\n  - term: A\n    def: d\n", 1,
      "`meta`: value is empty or opens a nested block, which is not supported"],
    // ── flowOrScalar()
    ["flow list never closes", "terms:\n  - term: A\n    def: d\n    avoid: [a, b\n", 4,
      "`avoid`: flow list is not closed with `]` on this line"],
    ["comma inside a quoted list item", 'terms:\n  - term: A\n    def: d\n    avoid: ["a, b"]\n', 4,
      "`avoid` list item: quoted value is not closed on this line (or a comma sits inside a quoted item, which is not supported)"],
    ["empty list item", "terms:\n  - term: A\n    def: d\n    avoid: [a, ]\n", 4,
      "`avoid` list item: value is empty or opens a nested block, which is not supported"],
    // ── parseGlossaryYaml(): before terms
    ["top-level line is not a key", "- a\n", 1, "top-level line is not a `key: value` pair at column 0"],
    ["indented top-level key", "  terms:\n", 1, "top-level line is not a `key: value` pair at column 0"],
    ["terms with an inline value", "terms: []\n", 1,
      "`terms:` has an inline value; only a block list of `- term:` entries is supported"],
    ["no terms list at all", "version: '1'\n", 0, "no `terms:` list found"],
    ["empty file", "", 0, "no `terms:` list found"],
    // ── parseGlossaryYaml(): inside terms
    ["entry indented differently", "terms:\n  - term: A\n    def: x\n    - term: B\n", 4,
      "`- term:` entry is indented differently from the earlier entries"],
    ["entry without def (reported at the entry's line)", "terms:\n  - term: A\n    def: x\n  - term: B\n    vi: b\n", 4,
      "entry has no `def`"],
    ["last entry without def", "terms:\n  - term: Invoice\n", 2, "entry has no `def`"],
    ["list entry not in term form", "terms:\n  - {term: Invoice, def: A request.}\n", 2,
      "list entry is not in the form `- term: <name>`"],
    ["unknown field (nested mapping under a term)", "terms:\n  - term: A\n    def: d\n    meta:\n      owner: finance\n", 4,
      "unknown field `meta` (supported: term, vi, def, avoid)"],
    ["unknown field see", "terms:\n  - term: A\n    def: d\n    see: Bill\n", 4,
      "unknown field `see` (supported: term, vi, def, avoid)"],
    ["top-level key after terms", "terms:\n  - term: A\n    def: d\nversion: 1\n", 4,
      "top-level key `version` after `terms:` is not supported (`terms:` must be the last top-level key)"],
    ["stray text line", "terms:\n  - term: A\n    def: d\n    continuation text\n", 4,
      "line is not a `- term:` entry or a `key: value` field"],
    ["field before the first entry", "terms:\n    def: x\n", 2, "`def` appears before the first `- term:` entry"],
    ["field with wrong indent", "terms:\n  - term: A\n  def: x\n", 3, "`def` is not indented two spaces under its `- term:` entry"],
    ["field set twice", "terms:\n  - term: A\n    def: x\n    def: y\n", 4, "`def` is set twice in one entry"],
  ];

  for (const [label, text, line, reason] of cases) {
    it(label, () => {
      expect(refusalOf(text)).toEqual({ line, reason });
    });
  }

  it("line numbers count the original file: comments, blank lines and CRLF included", () => {
    const text = `# header\r\n\r\nversion: 1\r\nterms:\r\n  - term: A\r\n    def: d\r\n${CX_LINE_48}\r\n`;
    expect(refusalOf(text)).toEqual({ line: 7, reason: "`avoid` list item: quoted value is followed by more text" });
  });

  it("formatGlossaryRefusal prefixes the line, and omits it for whole-file refusals", () => {
    expect(formatGlossaryRefusal({ line: 48, reason: "boom" })).toBe("line 48: boom");
    expect(formatGlossaryRefusal({ line: 0, reason: "no `terms:` list found" })).toBe("no `terms:` list found");
  });

  it("valid YAML in an unsupported shape is never called invalid YAML", () => {
    const validButUnsupported = [
      "terms: []\n",
      "terms:\n  - term: A\n    def: d\n    meta:\n      owner: x\n",
      "terms:\n  - term: A\n    def: [a, b]\n",
      "terms:\n  - term: A\n    def: |\n      text\n",
      "terms:\n  - {term: A, def: d}\n",
      "terms:\n  - term: A\n    def: d\n    avoid:\n      - bill\n",
      "terms:\n  - term: A\n    def: d\nversion: 1\n",
    ];
    for (const text of validButUnsupported) {
      expect(refusalOf(text).reason, text).not.toMatch(/invalid|malformed|syntax|parse error|not valid/i);
    }
  });

  it("a readable glossary still parses and carries no refusal", () => {
    const r = parseGlossaryYaml("terms:\n  - term: A\n    def: d\n    avoid: [x, y]\n", "g.yaml");
    expect(r).toEqual({ ok: true, terms: [{ term: "A", def: "d", avoid: ["x", "y"], source: "g.yaml" }] });
  });
});

// ─── through the pack build ─────────────────────────────────────────────────

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
const manifestOf = (pack: string): { skippedSources: { path: string; reason: string }[] } =>
  JSON.parse(readFileSync(join(pack, "guidelines.manifest.json"), "utf8")) as { skippedSources: { path: string; reason: string }[] };

describe("pack build records the line and cause but keeps building", () => {
  it("CX line 48 shape: exit 0, skip reason names the line and cause, CONTEXT.md terms still land", () => {
    const { dir, pack } = project(`terms:\n  - term: Rule (benchmark)\n    def: A rule.\n${CX_LINE_48}\n`);
    expect(capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]).code).toBe(0);
    expect(manifestOf(pack).skippedSources).toContainEqual({
      path: "ontology/glossary.yaml",
      reason: "line 4: `avoid` list item: quoted value is followed by more text — glossary skipped",
    });
    expect(readFileSync(join(pack, "terminology.md"), "utf8")).toMatch(/^- `term:Panel`/m);
  });

  it("CX line 71 shape: the skip reason names line 4 and the quoted-scalar cause", () => {
    const { dir, pack } = project(`terms:\n  - term: Evidence id\n    vi: Mã bằng chứng\n${CX_LINE_71}\n`);
    expect(capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]).code).toBe(0);
    expect(manifestOf(pack).skippedSources).toContainEqual({
      path: "ontology/glossary.yaml",
      reason: "line 4: `def`: quoted value is followed by more text — glossary skipped",
    });
  });

  it("valid YAML in an unsupported shape (nested mapping): line + cause, no claim of invalid YAML, no absolute path", () => {
    const { dir, pack } = project("terms:\n  - term: Invoice\n    def: A request.\n    meta:\n      owner: finance\n");
    expect(capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]).code).toBe(0);
    const reason = manifestOf(pack).skippedSources.find((s) => s.path === "ontology/glossary.yaml")?.reason ?? "";
    expect(reason).toBe("line 4: unknown field `meta` (supported: term, vi, def, avoid) — glossary skipped");
    expect(reason).not.toMatch(/invalid|malformed|syntax/i);
    expect(reason).not.toContain(dir);
  });

  it("a whole-file refusal carries no line number", () => {
    const { dir, pack } = project("version: '1'\n");
    expect(capture(["ds", "guidelines", "build", "--dir", dir, "--now", NOW]).code).toBe(0);
    expect(manifestOf(pack).skippedSources).toContainEqual({
      path: "ontology/glossary.yaml",
      reason: "no `terms:` list found — glossary skipped",
    });
  });
});
