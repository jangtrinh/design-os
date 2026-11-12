/**
 * An agents section whose markers are not one start line and one end line is not a held target: the default run neither
 * regenerates it nor counts its runtime among those the project has.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runtimesWithTargets } from "../src/commands/agents-shared.js";
import { builtRing1 } from "./ontology-query-helpers.js";
import { init, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();
const breakSection = (p: string): void => writeFileSync(join(p, "AGENTS.md"), readFileSync(join(p, "AGENTS.md"), "utf8").replace("<!-- END design-os agents -->\n", ""));

describe("runtimesWithTargets", () => {
  it("counts a well-formed agents section", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "claude,codex").code).toBe(0);
    expect(runtimesWithTargets(p)).toEqual(["claude", "codex"]);
  });
  it("does not count a malformed agents section as a target", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "claude,codex").code).toBe(0);
    breakSection(p);
    expect(runtimesWithTargets(p)).toEqual(["claude"]);
  });
  it("a project whose only target is a malformed section holds no runtime, so a default run is a first run and is refused whole", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "codex").code).toBe(0);
    breakSection(p);
    expect(runtimesWithTargets(p)).toEqual([]);
    const done = init(p, "--force", "--json");
    expect(done.code).toBe(1);
    expect(JSON.parse(done.out).error.code).toBe("AGENTS_SECTION_MALFORMED");
  });
});
