/**
 * `ui agents init` for the three runtimes: one roster rendered to Claude Code, Antigravity and Codex, each agent carrying
 * the generated ontology-areas block, and what a person wrote around the Codex section surviving a regeneration.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderAgent } from "../src/core/agents-gen.js";
import { BLOCK_END, BLOCK_START, blocksIn, stripBlocks } from "../src/core/agents-areas-block.js";
import { CODEX_AGENTS_BEGIN, CODEX_AGENTS_END } from "../src/core/agents-targets.js";
import { RUNTIMES } from "../src/core/init-stub.js";
import { capture, hashTree } from "./owner-rulings-helpers.js";
import { builtRing1 } from "./ontology-query-helpers.js";
import { ROLES, claudeFile, init, name, pinStudioHome, prefix, projectOf, rawTemplate, read } from "./agents-runtimes-helpers.js";

pinStudioHome();

describe("one roster, three targets", () => {
  it("writes the Claude, Antigravity and Codex targets from the same roster, with a non-empty area block on a ring-1 project", () => {
    const p = builtRing1();
    const done = init(p);
    expect(done.code).toBe(0);
    const n = name(p);
    for (const role of ROLES) {
      const claude = read(p, claudeFile(p, role));
      const skill = read(p, `.agent/skills/design-os-agent-${prefix(role)}-${n}/SKILL.md`);
      const stamp = /<!-- design-os agents · roster-role: ([a-z-]+) · template-hash: ([0-9a-f]{8}) -->/.exec(claude)!;
      expect(stamp[1]).toBe(role);
      expect(skill).toContain(stamp[0]);
      expect(read(p, "AGENTS.md")).toContain(stamp[0]);
    }
    expect(read(p, ".agent/skills/design-os-agent-designer-" + n + "/SKILL.md")).toMatch(/^---\nname: design-os-agent-designer-.+\ndescription: ".+"\n---\n/);
    const agents = read(p, "AGENTS.md");
    expect(agents.startsWith(CODEX_AGENTS_BEGIN)).toBe(true);
    expect(agents.trimEnd().endsWith(CODEX_AGENTS_END)).toBe(true);
    expect(blocksIn(agents)).toHaveLength(3);
    for (const file of [read(p, claudeFile(p, "designer")), read(p, `.agent/skills/design-os-agent-designer-${n}/SKILL.md`), agents]) {
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
    for (const text of [read(p, `.agent/skills/design-os-agent-designer-${n}/SKILL.md`), read(p, "AGENTS.md")]) {
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

