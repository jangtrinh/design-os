import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validateMethodSchema } from "../src/core/method-json-schema.js";
import { ui } from "./ksync-helpers.js";

const CLEAN = join(process.cwd(), "tests", "fixtures", "design-dir", "clean");
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

/** A git-initialised copy of the clean fixture; `extra` files are written before `git add`. */
function project(extra: Record<string, string> = {}, opts: { git?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "design-lint-"));
  dirs.push(root);
  cpSync(CLEAN, root, { recursive: true });
  for (const [rel, body] of Object.entries(extra)) { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), body); }
  if (opts.git !== false) {
    execFileSync("git", ["-C", root, "init", "-q"]);
    execFileSync("git", ["-C", root, "add", "-A"]);
  }
  return root;
}
const lint = (root: string): { exitCode: number; findings: { checkId: string; severity: string; path: string; fix: string }[] } => {
  const r = ui(["design", "lint", root, "--json"]);
  return { exitCode: r.exitCode, findings: JSON.parse(r.stdout).data.findings };
};
const ids = (f: { checkId: string }[]): string[] => f.map((x) => x.checkId);

describe("ui design lint — negative controls", () => {
  it("clean fixture → exit 0, no findings", () => {
    const r = lint(project());
    expect(r.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  });
  it("two token files → exit 1 with a fix hint naming the extra file", () => {
    const r = lint(project({ "design-system/tokens.json": "{}", "design/design.tokens.json": "{}" }));
    expect(r.exitCode).toBe(1);
    expect(r.findings.filter((f) => f.checkId === "extra-token-file").map((f) => f.path)).toEqual(["design-system/tokens.json", "design/design.tokens.json"]);
    expect(r.findings[1]!.fix).toContain("derived_from");
  });
  it("a token file declared derived in the manifest is not a finding", () => {
    const r = lint(project({ "design/design.tokens.json": "{}", "design/design-dir.json": JSON.stringify({ version: 1, derived: [{ path: "design/design.tokens.json", derived_from: "design/tokens.json" }] }) }));
    expect(r.findings).toEqual([]);
    expect(r.exitCode).toBe(0);
  });
  it("a manifest that violates the schema → bad-manifest, exit 1", () => {
    const r = lint(project({ "design/design-dir.json": JSON.stringify({ version: 2 }) }));
    expect(ids(r.findings)).toContain("bad-manifest");
    expect(r.exitCode).toBe(1);
  });
  it("a tracked *.jsonl log → exit 1", () => {
    const r = lint(project({ "design/figma.changes.jsonl": "{}\n" }));
    // the fixture .gitignore ignores it, so force-add it the way a careless commit would
    const root = project();
    writeFileSync(join(root, "design/figma.changes.jsonl"), "{}\n");
    execFileSync("git", ["-C", root, "add", "-f", "design/figma.changes.jsonl"]);
    const forced = lint(root);
    expect(forced.exitCode).toBe(1);
    expect(forced.findings.map((f) => `${f.checkId}:${f.path}`)).toEqual(["tracked-log-or-cache:design/figma.changes.jsonl"]);
    expect(r.exitCode).toBe(0); // ignored + untracked is the contract's happy path
  });
  it("a tracked cache and a rotated log are errors; an unignored log is a warning", () => {
    const root = project();
    mkdirSync(join(root, "design/cache"), { recursive: true });
    writeFileSync(join(root, "design/cache/x.json"), "{}");
    writeFileSync(join(root, "design/a.jsonl.1"), "{}");
    writeFileSync(join(root, "design/notes.jsonl"), "{}");
    writeFileSync(join(root, ".gitignore"), ".DS_Store\n");
    execFileSync("git", ["-C", root, "add", "-A"]);
    writeFileSync(join(root, "design/later.jsonl"), "{}");
    writeFileSync(join(root, "plans-run.jsonl"), "{}"); // outside design/: not governed
    const r = lint(root);
    expect(r.findings.filter((f) => f.severity === "error").map((f) => f.path).sort()).toEqual(["design/a.jsonl.1", "design/cache/x.json", "design/notes.jsonl"]);
    expect(r.findings.filter((f) => f.checkId === "unignored-log-or-cache").map((f) => f.path)).toEqual(["design/later.jsonl"]);
  });
  it("art direction outside design/ → error with a git mv hint", () => {
    const r = lint(project({ "docs/art-direction-guidelines.md": "# x\n" }));
    expect(r.exitCode).toBe(1);
    expect(r.findings[0]).toMatchObject({ checkId: "art-direction-outside-design", fix: "git mv 'docs/art-direction-guidelines.md' design/art-direction/art-direction-guidelines.md" });
  });
  it("supersession in a decisions file, and SUPERSEDED prose without the field → errors", () => {
    const rulings = { schema: "rulings/1", rulings: [{ id: "r-a", text: "old. SUPERSEDED by r-b", superseded_by: undefined }, { id: "r-ok", text: "fine", superseded_by: "r-b" }, { id: "r-low", text: "was superseded by r-b last week" }, { id: "r-word", text: "a supersededness metric" }] };
    const r = lint(project({ "design/knowledge/decisions/am.md": "- R1 superseded by R2\n- R3 plain\n", "design/knowledge/rulings.json": JSON.stringify(rulings) }));
    expect(r.findings.map((f) => `${f.checkId}:${f.path}`)).toEqual([
      "supersession-outside-rulings:design/knowledge/decisions/am.md",
      "supersession-not-in-field:design/knowledge/rulings.json#r-a",
      "supersession-not-in-field:design/knowledge/rulings.json#r-low",
    ]);
  });
  it("principles.md without an index → error; with a drifted index → error; regenerated → clean", () => {
    const root = project();
    rmSync(join(root, "design/principles.json"));
    expect(ids(lint(root).findings)).toEqual(["missing-principles-index"]);
    writeFileSync(join(root, "design/principles.json"), readFileSync(join(CLEAN, "design/principles.json"), "utf8").replace("C2", "C9"));
    expect(ids(lint(root).findings)).toEqual(["principles-index-drift"]);
    writeFileSync(join(root, "design/principles.json"), readFileSync(join(CLEAN, "design/principles.json")));
    expect(lint(root).exitCode).toBe(0);
  });
  it("stale ingest: DESIGN.md older than ds.json by > 14 days → warning only (exit 0); 10 days → none", () => {
    const root = project({ "design/ds.json": "{}", "design/DESIGN.md": "# d\n" });
    const now = Date.now() / 1000;
    utimesSync(join(root, "design/ds.json"), now, now);
    utimesSync(join(root, "design/DESIGN.md"), now - 20 * 86400, now - 20 * 86400);
    const stale = lint(root);
    expect(stale.findings.map((f) => `${f.checkId}:${f.severity}`)).toEqual(["stale-ingest:warning"]);
    expect(stale.exitCode).toBe(0);
    utimesSync(join(root, "design/DESIGN.md"), now - 10 * 86400, now - 10 * 86400);
    expect(lint(root).findings).toEqual([]);
  });
  it("missing token source → error; missing soul → warning", () => {
    const root = project();
    rmSync(join(root, "design/tokens.json")); rmSync(join(root, "design/soul.md"));
    execFileSync("git", ["-C", root, "add", "-A"]);
    const r = lint(root);
    expect(r.findings.map((f) => `${f.checkId}:${f.severity}`).sort()).toEqual(["missing-required-file:warning", "missing-token-source:error"]);
    expect(r.exitCode).toBe(1);
  });
  it("outside a git repo: falls back to a walk, skips the tracked check, says so", () => {
    const r = lint(project({ "design-system/tokens.json": "{}" }, { git: false }));
    expect(ids(r.findings)).toEqual(["extra-token-file", "git-unavailable"]);
  });
});

describe("ui design lint — shell", () => {
  it("prints a status line and a fix hint per finding in text mode", () => {
    const out = ui(["design", "lint", project({ "design-system/tokens.json": "{}" })]);
    expect(out.exitCode).toBe(1);
    expect(out.stdout).toMatch(/^design lint: 1 error\(s\), 0 warning\(s\)\n/);
    expect(out.stdout).toContain("fix: Delete it");
  });
  it("rejects a non-directory, extra args, and unknown flags with coded errors", () => {
    expect(JSON.parse(ui(["design", "lint", "/no/such/dir", "--json"]).stdout).error.code).toBe("NOT_A_DIRECTORY");
    expect(JSON.parse(ui(["design", "lint", "--json"]).stdout).error.code).toBe("BAD_ARG");
    expect(JSON.parse(ui(["design", "lint", CLEAN, "--nope", "--json"]).stdout).error.code).toBe("UNKNOWN_FLAG");
  });
});

describe("schemas/design-dir.schema.json", () => {
  const schema = JSON.parse(readFileSync(join(process.cwd(), "schemas", "design-dir.schema.json"), "utf8")) as Record<string, unknown>;
  it("validates the emitted principles index through its $defs entry", () => {
    const idx = JSON.parse(readFileSync(join(CLEAN, "design/principles.json"), "utf8"));
    const rule = { $defs: schema["$defs"], $ref: "#/$defs/principlesIndex" };
    expect(validateMethodSchema(idx, rule)).toEqual([]);
    expect(validateMethodSchema({ ...idx, principles: [{ id: "c1", title: "t", yields_when: "y", test: "t" }] }, rule).length).toBeGreaterThan(0);
  });
});
