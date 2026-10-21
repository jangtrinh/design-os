/**
 * The skill's contract.md is generated from the `ui` command signatures. These tests prove the three
 * failure modes: a stale copy (signatures changed), an edited copy, and a header recomputed over an
 * edit (still caught, because the repo script compares against a fresh render, not the header).
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DIST_CLI, REPO_ROOT, SKILL_DIR, cleanTemps, hasBuiltBinary, makeTemp, node } from "./helpers/designer-skill-harness.js";

afterAll(cleanTemps);
const SCRIPT = join(REPO_ROOT, "scripts", "designer-skill-contract.mjs");
const CONTRACT = join(SKILL_DIR, "contract.md");

interface Schema { data: { commands: Record<string, { signature?: { flags: { name: string; type: string; summary: string }[] } }> } }

function liveSchema(): Schema {
  const run = node(DIST_CLI, ["schema", "--json"]);
  return JSON.parse(run.stdout) as Schema;
}

describe.skipIf(!hasBuiltBinary)("designer skill contract", () => {
  it("--check passes for the checked-in contract", () => {
    const run = node(SCRIPT, ["--check"]);
    expect({ status: run.status, out: run.stdout.trim() }).toEqual({ status: 0, out: "contract: current" });
  });

  it("carries a sha256 header over every byte after the first line", () => {
    const text = readFileSync(CONTRACT, "utf8");
    const [first, ...rest] = text.split("\n");
    expect(first).toBe(`<!-- sha256: ${createHash("sha256").update(rest.join("\n")).digest("hex")} -->`);
  });

  it("regenerates byte-identical output across runs", () => {
    const a = join(makeTemp(), "a.md");
    const b = join(makeTemp(), "b.md");
    expect(node(SCRIPT, ["--write", "--contract", a]).status).toBe(0);
    expect(node(SCRIPT, ["--write", "--contract", b]).status).toBe(0);
    expect(readFileSync(a, "utf8")).toBe(readFileSync(b, "utf8"));
    expect(readFileSync(a, "utf8")).toBe(readFileSync(CONTRACT, "utf8"));
  });

  it("refuses an edited copy, including one whose header was recomputed", () => {
    const original = readFileSync(CONTRACT, "utf8");
    const edited = join(makeTemp(), "edited.md");
    writeFileSync(edited, original + "extra line\n");
    expect(node(SCRIPT, ["--check", "--contract", edited]).status).toBe(1);

    const body = original.split("\n").slice(1).join("\n") + "extra line\n";
    const rehashed = join(makeTemp(), "rehashed.md");
    writeFileSync(rehashed, `<!-- sha256: ${createHash("sha256").update(body).digest("hex")} -->\n${body}`);
    const run = node(SCRIPT, ["--check", "--contract", rehashed]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/^contract: stale or edited/);
  });

  it("goes red when a signature changes: a flag added to ui gate, and a flag removed", () => {
    const schema = liveSchema();
    const gate = schema.data.commands["gate"]?.signature;
    expect(gate).toBeDefined();
    const original = JSON.parse(JSON.stringify(schema)) as Schema;

    const added = join(makeTemp(), "added.json");
    gate?.flags.push({ name: "invented-flag", type: "boolean", summary: "not real" });
    writeFileSync(added, JSON.stringify(schema));
    expect(node(SCRIPT, ["--check", "--schema", added]).status).toBe(1);

    const removed = join(makeTemp(), "removed.json");
    original.data.commands["gate"]?.signature?.flags.pop();
    writeFileSync(removed, JSON.stringify(original));
    expect(node(SCRIPT, ["--check", "--schema", removed]).status).toBe(1);

    const untouched = join(makeTemp(), "same.json");
    writeFileSync(untouched, JSON.stringify(liveSchema()));
    expect(node(SCRIPT, ["--check", "--schema", untouched]).status).toBe(0);
  });

  it("exits 2 when a contract command is missing from the schema", () => {
    const schema = liveSchema();
    delete schema.data.commands["gate"];
    const path = join(makeTemp(), "missing.json");
    writeFileSync(path, JSON.stringify(schema));
    const run = node(SCRIPT, ["--check", "--schema", path]);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("ui schema has no command 'gate'");
  });
});
