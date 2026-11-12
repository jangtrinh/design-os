/**
 * The "add them with" line of a default `ui agents init` is printed only for the runtimes the command would write. For a
 * runtime it would refuse (the file would pass the Codex limit, the agents section has malformed markers, a folder with
 * the agent prefix is not ours) there is no command: the facts and the manual action, in words. A malformed section is not
 * "no target".
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { builtRing1 } from "./ontology-query-helpers.js";
import { extractCommands } from "./agents-walker-extract.js";
import { init, name, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();
const asRun = (out: string, p: string): string[][] => extractCommands(out).filter((a) => a.includes("--runtimes") && !a.includes("--force")).map((a) => [...a, "--dir", p]);
const json = (p: string, ...flags: string[]): { runtimes: string[]; runtimesWithoutTarget: string[]; runtimesNotAddable: Record<string, string> } => JSON.parse(init(p, ...flags, "--json").out).data;

/** A Claude-only project whose AGENTS.md holds the person's text, `bytes` long. */
function claudeOnly(bytes = 0): string {
  const p = builtRing1();
  if (bytes > 0) writeFileSync(join(p, "AGENTS.md"), "x".repeat(bytes));
  expect(init(p, "--runtimes", "claude").code).toBe(0);
  return p;
}

describe("a runtime the add command would be refused for gets words, not a command", () => {
  it("the AGENTS.md that would result is over the limit: the command names the other runtime only, and Codex gets the bytes", () => {
    const p = claudeOnly(33000);
    const done = init(p, "--force");
    expect(done.out).toContain("add them with: ui agents init --runtimes antigravity\n");
    expect(done.out).not.toMatch(/--runtimes [a-z,]*codex/);
    expect(done.out).toMatch(/Codex is not added: AGENTS\.md would be \d+ bytes.*shorten the project's own text in AGENTS\.md by at least \d+ bytes/);
    for (const argv of asRun(done.out, p)) expect(capture(argv).code, argv.join(" ")).toBe(0);
  });
  it("an agents section with malformed markers is not 'no target': it is named in words and the others are still regenerated", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "claude,codex").code).toBe(0);
    writeFileSync(join(p, "AGENTS.md"), readFileSync(join(p, "AGENTS.md"), "utf8").replace("<!-- END design-os agents -->\n", ""));
    const done = init(p, "--force");
    expect(done.code).toBe(0);
    expect(done.out).not.toMatch(/No target yet for [a-z, ]*codex/);
    expect(done.out).toContain("The design-os agents section of AGENTS.md has 1 start marker line(s) and 0 end marker line(s)");
    expect(done.out).toContain("add them with: ui agents init --runtimes antigravity\n");
    expect(done.out.match(/agent replaced:/g)).toHaveLength(3);
    for (const argv of asRun(done.out, p)) expect(capture(argv).code, argv.join(" ")).toBe(0);
  });
  it("a folder with the agent prefix and no roster stamp: its path and that it is left alone, and the command names the other runtime", () => {
    const p = claudeOnly();
    const dir = `.agent/skills/design-os-agent-designer-${name(p)}`;
    mkdirSync(join(p, dir), { recursive: true });
    writeFileSync(join(p, dir, "SKILL.md"), "written by hand\n");
    const done = init(p, "--force");
    expect(done.out).toContain("add them with: ui agents init --runtimes codex\n");
    expect(done.out).toContain(`Antigravity is not added: ${dir}/SKILL.md was not written by this tool, so it is left alone`);
    for (const argv of asRun(done.out, p)) expect(capture(argv).code, argv.join(" ")).toBe(0);
  });
  it("when every runtime without a target would be refused, no add line is printed at all", () => {
    const p = claudeOnly(33000);
    const dir = `.agent/skills/design-os-agent-designer-${name(p)}`;
    mkdirSync(join(p, dir), { recursive: true });
    writeFileSync(join(p, dir, "SKILL.md"), "written by hand\n");
    expect(init(p, "--force").out).not.toContain("add them with");
  });
});

describe("--json", () => {
  it("runtimesNotAddable carries the code of each reason; runtimesWithoutTarget still means no target on disk", () => {
    const p = claudeOnly(33000);
    const d = json(p, "--force");
    expect(d.runtimesWithoutTarget).toEqual(["antigravity", "codex"]);
    expect(d.runtimesNotAddable).toEqual({ codex: "AGENTS_DOC_OVER_LIMIT" });
  });
  it("a malformed section is not among the runtimes without a target", () => {
    const p = builtRing1();
    init(p, "--runtimes", "claude,codex");
    writeFileSync(join(p, "AGENTS.md"), readFileSync(join(p, "AGENTS.md"), "utf8").replace("<!-- END design-os agents -->\n", ""));
    const d = json(p, "--force");
    expect(d.runtimesWithoutTarget).toEqual(["antigravity"]);
    expect(d.runtimesNotAddable).toEqual({ codex: "AGENTS_SECTION_MALFORMED" });
  });
});
