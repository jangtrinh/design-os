/**
 * `ui agents init|check` for the three runtimes: one roster rendered to Claude Code, Antigravity and Codex, each agent
 * carrying the generated ontology-areas block, and a linter that fails on a hand-edited roster, a missing role and a
 * stale block. The ring-1 project is built by the kernel's own commands (see ontology-helpers.ts).
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderAgent } from "../src/core/agents-gen.js";
import { BLOCK_END, BLOCK_START, blocksIn, stripBlocks } from "../src/core/agents-areas-block.js";
import { CODEX_AGENTS_BEGIN, CODEX_AGENTS_END } from "../src/core/agents-targets.js";
import { RUNTIMES } from "../src/core/init-stub.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { build, ring1Project } from "./ontology-helpers.js";
import { builtRing1, changeScanAndRebuild, printedCommands } from "./ontology-query-helpers.js";

const saved = process.env["EASE_DESIGN_HOME"];
beforeEach(() => { process.env["EASE_DESIGN_HOME"] = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "agents-home-")); });
afterEach(() => { if (saved === undefined) delete process.env["EASE_DESIGN_HOME"]; else process.env["EASE_DESIGN_HOME"] = saved; });

const ROLES = ["designer", "curator", "figma-hand"];
const read = (p: string, rel: string): string => readFileSync(join(p, rel), "utf8");
const prefix = (role: string): string => (role === "figma-hand" ? "figma" : role);
const claudeFile = (p: string, role: string): string => `.claude/agents/${prefix(role)}-${name(p)}.md`;
const name = (p: string): string => JSON.parse(read(p, "design/ds.manifest.json")).name as string;
const init = (p: string, ...flags: string[]): ReturnType<typeof capture> => capture(["agents", "init", "--dir", p, ...flags]);
const check = (p: string): { code: number; data: { findings: { checkId: string; severity: string; message: string }[]; errorCount: number; runtimesChecked: string[]; runtimesWithoutTargets: string[] } } => {
  const done = capture(["agents", "check", "--dir", p, "--json"]);
  return { code: done.code, data: JSON.parse(done.out).data };
};
const codes = (p: string): string[] => check(p).data.findings.map((f) => f.checkId);
const rawTemplate = (role: string): string => readFileSync(join(process.cwd(), "templates", "agents", `${role}.md`), "utf8");
const projectOf = (): string => { const p = builtRing1(); expect(init(p).code).toBe(0); return p; };

describe("one roster, three targets", () => {
  it("writes the Claude, Antigravity and Codex targets from the same roster, with a non-empty area block on a ring-1 project", () => {
    const p = builtRing1();
    const done = init(p);
    expect(done.code).toBe(0);
    const n = name(p);
    for (const role of ROLES) {
      const claude = read(p, claudeFile(p, role));
      const skill = read(p, `.agent/skills/design-os-${prefix(role)}-${n}/SKILL.md`);
      const stamp = /<!-- design-os agents · roster-role: ([a-z-]+) · template-hash: ([0-9a-f]{8}) -->/.exec(claude)!;
      expect(stamp[1]).toBe(role);
      expect(skill).toContain(stamp[0]);
      expect(read(p, "AGENTS.md")).toContain(stamp[0]);
    }
    expect(read(p, ".agent/skills/design-os-designer-" + n + "/SKILL.md")).toMatch(/^---\nname: design-os-designer-.+\ndescription: ".+"\n---\n/);
    const agents = read(p, "AGENTS.md");
    expect(agents.startsWith(CODEX_AGENTS_BEGIN)).toBe(true);
    expect(agents.trimEnd().endsWith(CODEX_AGENTS_END)).toBe(true);
    expect(blocksIn(agents)).toHaveLength(3);
    for (const file of [read(p, claudeFile(p, "designer")), read(p, `.agent/skills/design-os-designer-${n}/SKILL.md`), agents]) {
      const block = blocksIn(file)[0]!;
      expect(block.startsWith(BLOCK_START)).toBe(true);
      expect(block.trimEnd().endsWith(BLOCK_END)).toBe(true);
      for (const key of ["page:Library", "tokens:color", "tokens:space"]) expect(block).toContain(key);
      expect(block).toContain('`ui ontology query "<your task>" --area "page:Library"`');
      expect(block).toMatch(/page:Library \(3 nodes\)/);
    }
    expect(done.out).toMatch(/agent written: .*\(designer\)/);
  });
  it("the default of --runtimes is the RUNTIMES constant, and an unknown runtime is refused by name", () => {
    const p = builtRing1();
    const env = JSON.parse(init(p, "--json").out) as { data: { targets: { runtime: string }[] } };
    expect([...new Set(env.data.targets.map((t) => t.runtime))].sort()).toEqual([...RUNTIMES].sort());
    const bad = capture(["agents", "init", "--dir", builtRing1(), "--runtimes", "claude,gemini", "--json"]);
    expect(bad.code).toBe(1);
    const err = JSON.parse(bad.out).error as { code: string; message: string };
    expect(err.code).toBe("BAD_ARG");
    expect(err.message).toContain("gemini");
    expect(capture(["agents", "init", "--dir", builtRing1(), "--runtimes", "--force"]).code).toBe(1);
  });
  it("--runtimes writes exactly the runtimes named", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "codex").code).toBe(0);
    expect(existsSync(join(p, "AGENTS.md"))).toBe(true);
    expect(existsSync(join(p, ".claude"))).toBe(false);
    expect(existsSync(join(p, ".agent"))).toBe(false);
  });
  it("tells each runtime how to ask the owner an open question", () => {
    const p = projectOf();
    const n = name(p);
    expect(blocksIn(read(p, claudeFile(p, "designer")))[0]).toMatch(/AskUserQuestion.*ui onboard questions --format claude/);
    for (const text of [read(p, `.agent/skills/design-os-designer-${n}/SKILL.md`), read(p, "AGENTS.md")]) {
      expect(blocksIn(text)[0]).toMatch(/print the numbered questions that `ui onboard questions` prints and wait for the answer/);
      expect(blocksIn(text)[0]).not.toContain("AskUserQuestion");
    }
  });
});

describe("Claude-only bytes equal today's outside the block", () => {
  it("each Claude file is today's render plus the block after it, and nothing else", () => {
    const p = builtRing1();
    expect(init(p, "--runtimes", "claude").code).toBe(0);
    for (const role of ROLES) {
      const text = read(p, claudeFile(p, role));
      const today = renderAgent(rawTemplate(role), { name: `${prefix(role)}-${name(p)}`, project: name(p), studio: null, knowledgeRoot: join(process.cwd(), "knowledge") });
      expect(stripBlocks(text)).toBe(today);
      expect(text.startsWith(today)).toBe(true);
      expect(text.slice(today.length)).toBe(blocksIn(text)[0]);
    }
  });
  it("text outside a block is not read as part of it: a block is found by its markers alone", () => {
    expect(stripBlocks(`before\n${BLOCK_START}\nx\n${BLOCK_END}\nafter\n`)).toBe("before\nafter\n");
    expect(stripBlocks("no markers here\n")).toBe("no markers here\n");
  });
});

describe("what a person wrote around the section of AGENTS.md survives", () => {
  it("text before and after it, and the kernel's own ease-design block, are kept byte for byte across --force", () => {
    const p = builtRing1();
    const own = "<!-- BEGIN ease-design -->\n## ease-design\nown block\n<!-- END ease-design -->";
    writeFileSync(join(p, "AGENTS.md"), `# Team notes\n\nKeep it short.\n\n${own}\n`);
    expect(init(p).code).toBe(0);
    const first = read(p, "AGENTS.md");
    expect(first.startsWith(`# Team notes\n\nKeep it short.\n\n${own}\n\n${CODEX_AGENTS_BEGIN}`)).toBe(true);
    writeFileSync(join(p, "AGENTS.md"), `${first.replace("Keep it short.", "Keep it very short.")}\nAfter the section.\n`);
    const again = init(p, "--force");
    expect(again.code).toBe(0);
    const text = read(p, "AGENTS.md");
    expect(text).toContain("Keep it very short.");
    expect(text).toContain("After the section.");
    expect(text).toContain(own);
    expect(text.split(CODEX_AGENTS_BEGIN)).toHaveLength(2);
  });
  it("without --force an existing target of any runtime is refused before anything is written", () => {
    const p = projectOf();
    const before = hashTree(p);
    for (const flags of [[], ["--runtimes", "codex"], ["--runtimes", "antigravity"], ["--runtimes", "claude"]]) {
      const done = init(p, ...flags, "--json");
      expect(done.code, flags.join(" ")).toBe(1);
      expect(JSON.parse(done.out).error.code).toBe("EXISTS");
      expect(hashTree(p)).toBe(before);
    }
  });
});

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
  it("a file that is not an ontology reads as unreadable, with the same action", () => {
    const p = ring1Project();
    mkdirSync(join(p, "design", "knowledge"), { recursive: true });
    writeFileSync(join(p, "design", "knowledge", "ontology.json"), "{ nope");
    init(p, "--runtimes", "claude");
    expect(blocksIn(read(p, claudeFile(p, "designer")))[0]).toContain("cannot be read");
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
