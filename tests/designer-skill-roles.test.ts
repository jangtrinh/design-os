/**
 * The skill orchestrates through the user's OWN runtime: it defines roles (builder, critic, scout) and
 * maps them to each host's mechanism, but never names a vendor model, a model slug or a private tool.
 * The probe is proven able to go red on planted strings before the real scan is trusted.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAdapter } from "../src/adapters/index.js";
import { REPO_ROOT, SKILL_DIR, forbiddenHits } from "./helpers/designer-skill-harness.js";

const scratch: string[] = [];
afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

function skillTexts(): [string, string][] {
  const out: [string, string][] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) visit(abs);
      else out.push([abs.slice(SKILL_DIR.length + 1), readFileSync(abs, "utf8")]);
    }
  };
  visit(SKILL_DIR);
  return out;
}

function wrapperTexts(): [string, string][] {
  const out: [string, string][] = [];
  for (const runtime of ["claude", "antigravity", "codex"] as const) {
    const cwd = mkdtempSync(join(tmpdir(), "designer-roles-"));
    scratch.push(cwd);
    for (const a of generateAdapter({ runtime, cwd, templatesRoot: join(REPO_ROOT, "templates") })) {
      if (a.mode !== "write" || a.executable !== true) out.push([`${runtime}:${a.absPath.slice(cwd.length + 1)}`, a.content]);
    }
  }
  return out;
}

describe("the forbidden-name probe goes red on planted strings", () => {
  const planted = [
    "Use Sonnet for the build", "ask the Opus reviewer", "a Haiku scout", "the Fable counsel",
    "model: claude-sonnet-5-5", "gpt-5.6-sol at high effort", "gemini-3.8-flash-medium", "gemini-3.1-pro-high",
    "run it through Grok", "codex-web --review", "start an Orca worktree", "ask kongming", "open a tmux pane",
    "use o3 for review", "o3-mini as the critic", "o4-mini scouts", "OpenAI o3", "o1-pro",
    "GPT 5 builds", "gemini 2.5 pro critiques", "Claude 4 reviews", "Grok 4 implements",
    "delegate to agy", "run JEV on it", "Laya MLX", "ask Astra",
  ];
  for (const text of planted) {
    it(`flags: ${text}`, () => {
      expect(forbiddenHits(text).length, text).toBeGreaterThan(0);
    });
  }

  it("flags a planted string inside a copied skill file and inside a generated wrapper", () => {
    const dir = mkdtempSync(join(tmpdir(), "designer-roles-plant-"));
    scratch.push(dir);
    writeFileSync(join(dir, "rules.md"), readFileSync(join(SKILL_DIR, "rules.md"), "utf8") + "\nCritic: claude-sonnet-5-5\n");
    expect(forbiddenHits(readFileSync(join(dir, "rules.md"), "utf8"))).not.toEqual([]);
    const claude = wrapperTexts().find(([name]) => name.endsWith("design-os-routing.md") && name.startsWith("claude:"));
    expect(forbiddenHits((claude?.[1] ?? "") + "\nUse Opus here.")).not.toEqual([]);
  });

  it("does not flag the ordinary words the skill uses", () => {
    expect(forbiddenHits("fresh subagent, orchestration, the `explorer` role, a pro-level page, flash of unstyled text, Gemini CLI, Claude Code, L1 overflow, step 3 of 4")).toEqual([]);
  });
});

describe("no hard-coded vendor, model or private tool", () => {
  it("the skill folder contains none", () => {
    for (const [name, text] of skillTexts()) expect({ name, hits: forbiddenHits(text) }).toEqual({ name, hits: [] });
  });

  it("the designer wording this change put into public docs, knowledge and workflows contains none", () => {
    // Only the paragraphs that mention the skill: those are the lines this change wrote. (Older text in the
    // same files is out of scope here; templates/workflows/generate.md already names a private loop elsewhere.)
    for (const rel of ["docs/design-entry.md", "docs/design-learning.md", "knowledge/ds-kit-onboarding.md",
      "templates/workflows/generate.md", "templates/workflows/learn.md"]) {
      const paragraphs = readFileSync(join(REPO_ROOT, rel), "utf8").split(/\n\s*\n/).filter((p) => p.includes("design-os-designer"));
      expect({ rel, found: paragraphs.length > 0 }).toEqual({ rel, found: true });
      for (const paragraph of paragraphs) expect({ rel, hits: forbiddenHits(paragraph) }).toEqual({ rel, hits: [] });
    }
    expect(forbiddenHits(readFileSync(join(REPO_ROOT, "src", "adapters", "designer-skill.ts"), "utf8"))).toEqual([]);
  });

  it("the wrappers `ui init` emits for claude, antigravity and codex contain none", () => {
    const texts = wrapperTexts();
    expect(texts.length).toBeGreaterThan(90);
    for (const [name, text] of texts) expect({ name, hits: forbiddenHits(text) }).toEqual({ name, hits: [] });
  });
});

describe("Roles on your runtime", () => {
  const skill = readFileSync(join(SKILL_DIR, "SKILL.md"), "utf8");
  const section = /## Roles on your runtime\n([\s\S]*?)(?:\n## |$)/.exec(skill)?.[1] ?? "";

  it("maps builder, critic and scout for each of the four hosts plus a fresh-session fallback", () => {
    expect(section).not.toBe("");
    for (const header of ["Builder", "Critic", "Scout"]) expect(section).toContain(header);
    for (const host of ["Claude Code", "Codex", "Gemini CLI", "Antigravity"]) expect(section).toMatch(new RegExp(`\\| ${host} \\|`));
    expect(section).toContain("a fresh session of your runtime");
    expect(section).toContain("The\ncritic is never the builder");
  });

  it("dates each host check and cites its official page in ATTRIBUTION.md", () => {
    const attribution = readFileSync(join(SKILL_DIR, "ATTRIBUTION.md"), "utf8");
    expect(attribution).toContain("2026-10-21");
    for (const url of [
      "https://code.claude.com/docs/en/sub-agents",
      "https://developers.openai.com/codex/subagents",
      "https://geminicli.com/docs/core/subagents/",
      "https://antigravity.google/docs/subagents",
    ]) expect(attribution).toContain(url);
  });

  it("the hand-over has a CRITIC field so an unchecked critique is declared", () => {
    expect(skill).toContain("CRITIC: <which separate subagent or session scored it, or NOT CHECKED>");
  });
});
