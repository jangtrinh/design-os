/**
 * `ui design lint`: the kernel's own sealed token store is not an "extra" token file,
 * two disagreeing token files are one named finding, and the supersession finding says
 * what it checks.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { ui } from "./ksync-helpers.js";
import { writeFiles } from "./scan-wide-app-fixture.js";

const CLEAN = join(process.cwd(), "tests", "fixtures", "design-dir", "clean");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

function project(extra: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "design-lint-tok-"));
  dirs.push(root);
  cpSync(CLEAN, root, { recursive: true });
  writeFiles(root, extra);
  execFileSync("git", ["-C", root, "init", "-q"]);
  execFileSync("git", ["-C", root, "add", "-A"]);
  return root;
}
const lint = (root: string): { exitCode: number; findings: { checkId: string; severity: string; path: string; message: string; fix: string }[] } => {
  const r = ui(["design", "lint", root, "--json"]);
  return { exitCode: r.exitCode, findings: JSON.parse(r.stdout).data.findings };
};
const tokens = (n: number, value = "#000000"): string =>
  JSON.stringify({ color: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { $value: value, $type: "color" }])) });
const MANIFEST = JSON.stringify({ version: 1 });

describe("ui design lint — the sealed token store", () => {
  it("with a ds.manifest.json present, design/design.tokens.json is not an extra-token-file", () => {
    const r = lint(project({ "design/ds.manifest.json": MANIFEST, "design/design.tokens.json": readClean() }));
    expect(r.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  });

  it("without the manifest it is still an extra-token-file (the skip is for the sealed store only)", () => {
    const r = lint(project({ "design/design.tokens.json": readClean() }));
    expect(r.findings.map((f) => `${f.checkId}:${f.path}`)).toEqual(["extra-token-file:design/design.tokens.json"]);
  });

  it("the manifest does not excuse any other second token file", () => {
    const r = lint(project({ "design/ds.manifest.json": MANIFEST, "design-system/tokens.json": "{}" }));
    expect(r.findings.map((f) => `${f.checkId}:${f.path}`)).toEqual(["extra-token-file:design-system/tokens.json"]);
  });
});

describe("ui design lint — two-token-sources", () => {
  it("two files with different token sets → exactly one error carrying both counts and the source-authority fix", () => {
    const r = lint(project({ "design/ds.manifest.json": MANIFEST, "design/tokens.json": tokens(7), "design/design.tokens.json": tokens(12) }));
    const hits = r.findings.filter((f) => f.checkId === "two-token-sources");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.severity).toBe("error");
    expect(hits[0]!.fix).toBe("Keep one source: delete one of the two files, or declare design/design.tokens.json derived in design/design-dir.json");
    expect(`${hits[0]!.message} ${hits[0]!.fix}`).not.toContain("ui onboard questions");
    expect(hits[0]!.message).toContain("12 tokens");
    expect(hits[0]!.message).toContain("7 tokens");
    expect(r.exitCode).toBe(1);
  });

  it("a single token reads \"1 token\", several read \"N tokens\"", () => {
    const r = lint(project({ "design/ds.manifest.json": MANIFEST, "design/tokens.json": tokens(1), "design/design.tokens.json": tokens(2) }));
    const msg = r.findings.find((f) => f.checkId === "two-token-sources")!.message;
    expect(msg).toContain("(2 tokens)");
    expect(msg).toContain("(1 token)");
    expect(msg).not.toContain("1 tokens");
  });

  it("object values that differ only in key order are the same token set", () => {
    const doc = (value: string): string => `{ "color": { "brand": { "$type": "color", "$value": ${value} } } }`;
    const r = lint(project({
      "design/ds.manifest.json": MANIFEST,
      "design/tokens.json": doc('{ "r": 1, "g": 2, "nested": { "a": 1, "b": 2 } }'),
      "design/design.tokens.json": doc('{ "nested": { "b": 2, "a": 1 }, "g": 2, "r": 1 }'),
    }));
    expect(r.findings).toEqual([]);
  });

  it("equal token sets → nothing", () => {
    const r = lint(project({ "design/ds.manifest.json": MANIFEST, "design/tokens.json": tokens(5), "design/design.tokens.json": tokens(5) }));
    expect(r.findings).toEqual([]);
  });

  it("the same paths with a different value are still two sources", () => {
    const r = lint(project({ "design/ds.manifest.json": MANIFEST, "design/tokens.json": tokens(5, "#111111"), "design/design.tokens.json": tokens(5, "#222222") }));
    expect(r.findings.map((f) => f.checkId)).toEqual(["two-token-sources"]);
  });

  it("a file declared derived is the contract's own route and stays silent", () => {
    const manifest = JSON.stringify({ version: 1, derived: [{ path: "design/design.tokens.json", derived_from: "design/tokens.json" }] });
    const r = lint(project({ "design/design-dir.json": manifest, "design/tokens.json": tokens(7), "design/design.tokens.json": tokens(12) }));
    expect(r.findings).toEqual([]);
  });

  it("an unparseable sealed file is not compared", () => {
    const r = lint(project({ "design/ds.manifest.json": MANIFEST, "design/design.tokens.json": "{ not json" }));
    expect(r.findings.map((f) => f.checkId)).toEqual([]);
  });
});

describe("ui design lint — supersession-not-in-field says what it checks", () => {
  it("names the marker and the replacing id the marker carries", () => {
    const rulings = { schema: "rulings/1", rulings: [{ id: "r-a", text: "(SUPERSEDED 2026-01-01 by r-b) old" }] };
    const r = lint(project({ "design/knowledge/rulings.json": JSON.stringify(rulings) }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0]!.message).toBe("the text starts with a `(SUPERSEDED …)` marker but `superseded_by` is not set");
    expect(r.findings[0]!.fix).toContain("the marker names r-b");
  });
});

/** The fixture's own design/tokens.json, so the sealed copy is an equal token set. */
function readClean(): string {
  return readFileSync(join(CLEAN, "design", "tokens.json"), "utf8");
}
