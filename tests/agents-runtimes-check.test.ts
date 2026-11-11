/**
 * `ui agents check`: it fails on a hand-edited roster, a role one runtime lacks and a stale area block, writes nothing, and
 * every action it prints heals what it found. A project with no ontology gets a block that says so.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blocksIn } from "../src/core/agents-areas-block.js";
import { CODEX_AGENTS_BEGIN } from "../src/core/agents-targets.js";
import { RUNTIMES } from "../src/core/init-stub.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { build, ring1Project } from "./ontology-helpers.js";
import { builtRing1, changeScanAndRebuild, printedCommands } from "./ontology-query-helpers.js";
import { check, claudeFile, codes, init, name, pinStudioHome, projectOf, read } from "./agents-runtimes-helpers.js";

pinStudioHome();

describe("ui agents check", () => {
  it("is clean on freshly generated agents, checks every runtime found and writes nothing", () => {
    const p = projectOf();
    const before = hashTree(p);
    const got = check(p);
    expect(got.code).toBe(0);
    expect(got.data.findings).toEqual([]);
    expect(got.data.runtimesChecked).toEqual([...RUNTIMES]);
    expect(hashTree(p)).toBe(before);
  });
  it("checks only the runtimes that have a target and says which it found none for", () => {
    const p = builtRing1();
    init(p, "--runtimes", "claude");
    const got = check(p);
    expect(got.code).toBe(0);
    expect(got.data.runtimesChecked).toEqual(["claude"]);
    expect(got.data.runtimesWithoutTargets).toEqual(["antigravity", "codex"]);
    expect(capture(["agents", "check", "--dir", p]).out).toContain("no generated target found for: antigravity, codex");
  });
  it("a hand edit of one runtime's roster fails it, one finding per file, in the code of that runtime", () => {
    const p = projectOf();
    const n = name(p);
    const skill = join(p, `.agent/skills/design-os-curator-${n}/SKILL.md`);
    writeFileSync(skill, readFileSync(skill, "utf8").replace("You are", "You were"));
    let got = check(p);
    expect(got.code).toBe(1);
    expect(got.data.findings.map((f) => f.checkId)).toEqual(["AGENTS_ROSTER_DRIFT"]);
    expect(got.data.findings[0]!.message).toContain(`.agent/skills/design-os-curator-${n}/SKILL.md`);
    init(p, "--force");
    const agents = join(p, "AGENTS.md");
    writeFileSync(agents, readFileSync(agents, "utf8").replace("You are", "You were"));
    got = check(p);
    expect(got.data.findings.map((f) => f.checkId)).toEqual(["AGENTS_ROSTER_DRIFT"]);
    expect(got.data.findings[0]!.message).toContain("AGENTS.md");
    init(p, "--force");
    const claude = join(p, claudeFile(p, "designer"));
    writeFileSync(claude, readFileSync(claude, "utf8").replace("You are", "You were"));
    expect(codes(p)).toEqual(["agent-stale"]);
  });
  it("a role one runtime holds and another lacks fails it", () => {
    const p = builtRing1();
    init(p, "--runtimes", "claude");
    init(p, "--runtimes", "codex", "--roster", "designer");
    const got = check(p);
    expect(got.code).toBe(1);
    expect(got.data.findings.map((f) => f.checkId)).toEqual(["AGENTS_ROSTER_DRIFT"]);
    expect(got.data.findings[0]!.message).toContain("codex agents lack the role curator, figma-hand");
  });
  it("an area block edited by hand, or left from before a rebuild, is ONTOLOGY_STALE until the agents are regenerated", () => {
    const p = projectOf();
    const claude = join(p, claudeFile(p, "designer"));
    writeFileSync(claude, readFileSync(claude, "utf8").replace("(3 nodes)", "(4 nodes)"));
    expect(codes(p)).toEqual(["ONTOLOGY_STALE"]);
    init(p, "--force");
    expect(check(p).code).toBe(0);
    changeScanAndRebuild(p, (scan) => { scan.components.find((c) => c["name"] === "Card")!["page"] = { id: "0:7", name: "Kit" }; });
    const got = check(p);
    expect(got.code).toBe(1);
    expect(got.data.findings.map((f) => f.checkId)).toEqual(Array(7).fill("ONTOLOGY_STALE"));
    const cure = printedCommands(got.data.findings[0]!.message, p);
    expect(cure).toEqual([["agents", "init", "--force", "--runtimes", "claude,antigravity,codex", "--dir", p]]);
    expect(capture(cure[0] as string[]).code).toBe(0);
    expect(check(p).code).toBe(0);
    expect(read(p, "AGENTS.md")).toContain("page:Kit");
  });
  it("the cure reproduces what was found and no more: a Claude-only project is regenerated for Claude only", () => {
    const p = builtRing1();
    init(p, "--runtimes", "claude", "--roster", "designer");
    changeScanAndRebuild(p, (scan) => { scan.components.find((c) => c["name"] === "Card")!["page"] = { id: "0:7", name: "Kit" }; });
    const got = check(p);
    const cure = printedCommands(got.data.findings[0]!.message, p);
    expect(cure[0]!.slice(0, 7)).toEqual(["agents", "init", "--force", "--runtimes", "claude", "--roster", "designer"]);
    expect(capture(cure[0] as string[]).code).toBe(0);
    expect(existsSync(join(p, "AGENTS.md"))).toBe(false);
    expect(check(p).code).toBe(0);
  });
  it("a project with no agents at all keeps the single no-agents warning", () => {
    const p = builtRing1();
    const got = check(p);
    expect(got.code).toBe(0);
    expect(got.data.findings.map((f) => f.checkId)).toEqual(["no-agents"]);
  });
});

describe("a project with no ontology", () => {
  it("gets a block that says so and names the build, never an empty one, and the printed actions heal it", () => {
    const p = ring1Project();
    const done = init(p);
    expect(done.code).toBe(0);
    for (const text of [read(p, claudeFile(p, "designer")), read(p, "AGENTS.md")]) {
      const block = blocksIn(text)[0]!;
      expect(block).toContain("no ontology yet");
      expect(block).toContain("`ui ontology build`");
    }
    expect(check(p).code).toBe(0);
    const next = printedCommands(done.out, p);
    expect(next).toEqual([["ontology", "build", "--dir", p], ["agents", "init", "--force", "--dir", p]]);
    for (const argv of next) expect(capture(argv).code, argv.join(" ")).toBe(0);
    expect(read(p, "AGENTS.md")).toContain("page:Library");
    expect(check(p).code).toBe(0);
  });
  it("a file that is not an ontology is not current: the block says so and names the build", () => {
    const p = ring1Project();
    mkdirSync(join(p, "design", "knowledge"), { recursive: true });
    writeFileSync(join(p, "design", "knowledge", "ontology.json"), "{ nope");
    init(p, "--runtimes", "claude");
    expect(blocksIn(read(p, claudeFile(p, "designer")))[0]).toContain("is not current");
  });
});

describe("ui init --with-agents keeps its behaviour: Claude Code only", () => {
  it("writes the Claude roster and neither the Antigravity skills nor the Codex section", () => {
    const p = ring1Project();
    const done = capture(["init", "--all", "--cwd", p, "--with-agents", "--json"]);
    expect(done.code).toBe(0);
    expect(existsSync(join(p, claudeFile(p, "designer")))).toBe(true);
    expect(existsSync(join(p, `.agent/skills/design-os-designer-${name(p)}`))).toBe(false);
    expect(read(p, "AGENTS.md")).not.toContain(CODEX_AGENTS_BEGIN);
  });
});

describe("generated agents pass the linters that read them", () => {
  it("ui doctor reports the same after the agents are generated as before", () => {
    const p = builtRing1();
    expect(capture(["init", "--all", "--cwd", p]).code).toBe(0);
    const before = capture(["doctor", "--cwd", p, "--json"]);
    expect(init(p).code).toBe(0);
    const after = capture(["doctor", "--cwd", p, "--json"]);
    expect(after.code).toBe(before.code);
    expect(after.out).toBe(before.out);
    expect(check(p).code).toBe(0);
    expect(build(p).code).toBe(0);
  });
});
