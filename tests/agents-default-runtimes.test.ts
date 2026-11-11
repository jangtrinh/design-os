/**
 * `ui agents init` without `--runtimes` regenerates the runtimes the project already has a target for, and writes a
 * runtime with no target only when it is named. A project with no target at all still gets every runtime. The output
 * says which case applied and prints the command that adds a runtime the project lacks.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { builtRing1, printedCommands } from "./ontology-query-helpers.js";
import { check, init, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();
const OWN = "# Team notes\n";
const claudeOnly = (): string => {
  const p = builtRing1();
  writeFileSync(join(p, "AGENTS.md"), OWN);
  expect(init(p, "--runtimes", "claude").code).toBe(0);
  return p;
};
const data = (p: string, ...flags: string[]): { runtimes: string[]; runtimesWithoutTarget: string[]; targets: { runtime: string }[] } => JSON.parse(init(p, ...flags, "--json").out).data;

describe("the default of --runtimes is what the project already has", () => {
  it("a Claude-only project with its own AGENTS.md: --force writes no .agent directory and leaves AGENTS.md alone", () => {
    const p = claudeOnly();
    const done = init(p, "--force");
    expect(done.code).toBe(0);
    expect(existsSync(join(p, ".agent"))).toBe(false);
    expect(readFileSync(join(p, "AGENTS.md"), "utf8")).toBe(OWN);
    expect(done.out.match(/agent replaced:/g)).toHaveLength(3);
  });
  it("a project with Claude and Codex targets regenerates both and leaves Antigravity untouched", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "claude,codex").code).toBe(0);
    const done = init(p, "--force");
    expect(done.out).toContain("agents section replaced:");
    expect(done.out.match(/agent replaced:/g)).toHaveLength(3);
    expect(existsSync(join(p, ".agent"))).toBe(false);
  });
  it("a project with no target gets the three runtimes", () => {
    const d = data(builtRing1());
    expect(d.runtimes).toEqual(["claude", "antigravity", "codex"]);
    expect(d.runtimesWithoutTarget).toEqual([]);
  });
  it("an explicit --runtimes is obeyed exactly, even for a runtime the project lacks", () => {
    const p = claudeOnly();
    expect(data(p, "--force", "--runtimes", "claude,antigravity").runtimes).toEqual(["claude", "antigravity"]);
    expect(existsSync(join(p, ".agent"))).toBe(true);
  });
});

describe("the output says which case applied", () => {
  it("names the runtimes regenerated because the project has them, and the command that adds the others", () => {
    const p = claudeOnly();
    const done = init(p, "--force");
    expect(done.out).toContain("Regenerated the runtimes this project already has: claude.");
    expect(done.out).toContain("No target yet for antigravity, codex; add them with: ui agents init --runtimes antigravity,codex");
    const d = data(p, "--force");
    expect(d.runtimes).toEqual(["claude"]);
    expect(d.runtimesWithoutTarget).toEqual(["antigravity", "codex"]);
  });
  it("says nothing of the kind on a first run", () => {
    expect(init(builtRing1()).out).not.toMatch(/already has|No target yet/);
  });
  it("the printed add command runs as printed, needs no --force, and the check is clean afterwards", () => {
    const p = claudeOnly();
    const add = printedCommands(init(p, "--force").out, p).find((a) => a.includes("--runtimes"));
    expect(add).toBeDefined();
    expect(add).not.toContain("--force");
    expect(capture(add as string[]).code).toBe(0);
    expect(existsSync(join(p, ".agent"))).toBe(true);
    expect(readFileSync(join(p, "AGENTS.md"), "utf8").startsWith(OWN)).toBe(true);
    expect(check(p).code).toBe(0);
  });
});
