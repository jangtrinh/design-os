/**
 * Every regenerate command `ui agents check` prints names the runtimes the project has: running it never creates a
 * target for a runtime the project never generated, and never touches a person's AGENTS.md.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capture } from "./owner-rulings-helpers.js";
import { builtRing1, printedCommands } from "./ontology-query-helpers.js";
import { check, claudeFile, init, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();

describe("the cure of an agent-stale finding", () => {
  it("on a Claude-only project with its own AGENTS.md: the printed command writes Claude only and leaves AGENTS.md alone", () => {
    const p = builtRing1();
    writeFileSync(join(p, "AGENTS.md"), "# Team notes\n");
    expect(init(p, "--runtimes", "claude").code).toBe(0);
    const agent = join(p, claudeFile(p, "designer"));
    writeFileSync(agent, readFileSync(agent, "utf8").replace("You are", "You were"));
    const got = check(p);
    expect(got.data.findings.map((f) => f.checkId)).toEqual(["agent-stale"]);
    const cure = printedCommands(got.data.findings[0]!.message, p);
    expect(cure).toHaveLength(1);
    expect(cure[0]!.slice(0, 6)).toEqual(["agents", "init", "--force", "--runtimes", "claude", "--dir"]);
    expect(capture(cure[0] as string[]).code).toBe(0);
    expect(existsSync(join(p, ".agent"))).toBe(false);
    expect(readFileSync(join(p, "AGENTS.md"), "utf8")).toBe("# Team notes\n");
    expect(check(p).code).toBe(0);
  });
  it("on a project with a role subset, the cure keeps the roster it found", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "claude", "--roster", "designer").code).toBe(0);
    const agent = join(p, claudeFile(p, "designer"));
    writeFileSync(agent, readFileSync(agent, "utf8").replace("You are", "You were"));
    const cure = printedCommands(check(p).data.findings[0]!.message, p);
    expect(cure[0]!.slice(0, 8)).toEqual(["agents", "init", "--force", "--runtimes", "claude", "--roster", "designer", "--dir"]);
    expect(capture(cure[0] as string[]).code).toBe(0);
    expect(existsSync(join(p, claudeFile(p, "curator")))).toBe(false);
  });
});
