/**
 * No line the agents commands print writes more than the run it follows. The "Then:" line of `ui agents init` carries the
 * runtimes and the roster of that run; the area block names no `init` command (it is rendered per file and cannot know
 * what else the project has) and points at `ui agents check`, whose cure names exactly what the project holds.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { build, ring1Project } from "./ontology-helpers.js";
import { builtRing1, printedCommands } from "./ontology-query-helpers.js";
import { check, claudeFile, init, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();
const OWN = "# Team notes\n";

/** The ontology file on disk no longer matches the sources: the scan changed after the build. */
function makeNotCurrent(p: string): void {
  const file = join(p, "design", "ds.json");
  const scan = JSON.parse(readFileSync(file, "utf8")) as { components: Record<string, unknown>[] };
  scan.components.find((c) => c["name"] === "Card")!["page"] = { id: "0:7", name: "Kit" };
  writeFileSync(file, JSON.stringify(scan, null, 2));
}
/** A Claude-only project holding one role and its own AGENTS.md; `built` gives it an ontology file that is no longer current. */
const subsetProject = (built: boolean): string => {
  const p = built ? builtRing1() : ring1Project();
  if (built) makeNotCurrent(p);
  writeFileSync(join(p, "AGENTS.md"), OWN);
  expect(init(p, "--runtimes", "claude", "--roster", "designer").code).toBe(0);
  return p;
};
const noWidening = (p: string): void => {
  expect(existsSync(join(p, ".agent"))).toBe(false);
  expect(existsSync(join(p, claudeFile(p, "curator")))).toBe(false);
  expect(readFileSync(join(p, "AGENTS.md"), "utf8")).toBe(OWN);
};

describe("the Then: line of ui agents init", () => {
  it("carries the runtimes and the roster of this very run when the roster is a subset", () => {
    const p = builtRing1();
    makeNotCurrent(p);
    const done = init(p, "--runtimes", "claude,codex", "--roster", "designer,curator");
    expect(done.out).toContain("Then: ui agents init --force --runtimes claude,codex --roster designer,curator\n");
  });
  it("names no --roster when the run wrote the whole roster, and no runtime it did not write", () => {
    const p = ring1Project();
    const done = init(p, "--runtimes", "claude");
    expect(done.out).toContain("Then: ui agents init --force --runtimes claude\n");
    expect(done.out).not.toMatch(/--roster/);
  });
  it("every printed line, followed in a Claude-only project with a roster subset, adds no runtime and no role", () => {
    const p = subsetProject(true);
    const again = init(p, "--force", "--roster", "designer");
    const then = printedCommands(again.out, p).find((a) => a.includes("--force"));
    expect(then).toBeDefined();
    expect(capture(then as string[]).code).toBe(0);
    noWidening(p);
  });
});

describe("the area block names no init command", () => {
  for (const [label, built] of [["missing", false], ["not current", true]] as const) {
    it(`${label}: following it literally (build, check, the cure the check prints) leaves the check clean and adds nothing`, () => {
      const p = subsetProject(built);
      const agent = readFileSync(join(p, claudeFile(p, "designer")), "utf8");
      expect(agent).not.toMatch(/ui agents init/);
      expect(agent).toContain("`ui agents check` prints the command that lists the areas here");
      expect(build(p).code).toBe(0);
      const got = check(p);
      expect(got.code).toBe(1);
      const cure = printedCommands(got.data.findings.map((f) => f.message).join("\n"), p).find((a) => a.includes("--force"));
      expect(cure).toBeDefined();
      expect(capture(cure as string[]).code).toBe(0);
      expect(check(p).code).toBe(0);
      noWidening(p);
    });
  }
});
