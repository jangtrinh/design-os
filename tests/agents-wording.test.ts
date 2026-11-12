/**
 * What the two agents commands say at the end of a run. `ui agents init` closes with one line for each runtime it wrote,
 * saying how that runtime picks the agents up, and none for a runtime it did not write. `ui agents check` names every
 * runtime it checked in its headline, and the runtimes it found no target for.
 */
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { builtRing1 } from "./ontology-query-helpers.js";
import { init, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();
const CLAUDE = "Claude Code: the agents are subagents; delegate to them by name.";
const ANTIGRAVITY = "Antigravity: the agent skills under .agent/skills are read when Antigravity starts in the project.";
const CODEX = "Codex: the agents section of AGENTS.md is read when Codex starts in the project.";
const closing = (out: string): string[] => out.split("\n").filter((l) => [CLAUDE, ANTIGRAVITY, CODEX].includes(l));

describe("the closing lines of ui agents init", () => {
  it("one line per runtime that was written, in the order of the runtimes", () => {
    expect(closing(init(builtRing1()).out)).toEqual([CLAUDE, ANTIGRAVITY, CODEX]);
  });
  it("none for a runtime that was not written", () => {
    expect(closing(init(builtRing1(), "--runtimes", "codex").out)).toEqual([CODEX]);
    expect(closing(init(builtRing1(), "--runtimes", "claude,antigravity").out)).toEqual([CLAUDE, ANTIGRAVITY]);
  });
});

describe("the headline of ui agents check", () => {
  const headline = (p: string): string => capture(["agents", "check", "--dir", p]).out.split("\n")[0]!;
  it("names every runtime it checked", () => {
    const p = builtRing1();
    init(p);
    expect(headline(p)).toContain("claude, antigravity, codex");
  });
  it("names the runtimes it checked and those with no target", () => {
    const p = builtRing1();
    init(p, "--runtimes", "claude");
    const line = headline(p);
    expect(line).toContain("(checked claude; no target for antigravity, codex)");
  });
});
