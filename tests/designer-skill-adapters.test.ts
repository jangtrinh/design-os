/**
 * `ui init` wires the shipped design-os-designer skill into every runtime without copying it: Claude and
 * Antigravity get a byte-identical thin wrapper that points at the packaged folder, Codex gets a line in its
 * managed AGENTS.md block, and the wrapper integrity lint accepts (and can reject) the new wrapper shape.
 */
import { afterAll, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { generateAdapter } from "../src/adapters/index.js";
import { DESIGNER_SKILL_NAME, designerSkillPath, readDesignerSkillDescription } from "../src/adapters/designer-skill.js";
import { checkWrappers } from "../src/core/adapter-wrapper-lint.js";
import { REPO_ROOT } from "./helpers/designer-skill-harness.js";

const TEMPLATES_ROOT = join(REPO_ROOT, "templates");
const SKILL_MD = designerSkillPath(TEMPLATES_ROOT);
const scratch: string[] = [];
afterAll(() => { for (const d of scratch) rmSync(d, { recursive: true, force: true }); });

function emit(runtime: "claude" | "antigravity" | "codex") {
  const cwd = mkdtempSync(join(tmpdir(), "designer-adapter-"));
  scratch.push(cwd);
  const artifacts = generateAdapter({ runtime, cwd, templatesRoot: TEMPLATES_ROOT });
  const adapters: string[] = [];
  for (const a of artifacts) {
    if (a.mode !== "write") continue;
    mkdirSync(dirname(a.absPath), { recursive: true });
    writeFileSync(a.absPath, a.content);
    // The model-adapter wrapper script is kept out of the manifest's adapters[] by `ui init`.
    if (a.executable !== true) adapters.push(a.absPath.slice(cwd.length + 1));
  }
  return { cwd, artifacts, adapters };
}

describe("designer skill wiring per runtime", () => {
  it("resolves to the shipped SKILL.md whose frontmatter supplies the discovery description", () => {
    expect(existsSync(SKILL_MD)).toBe(true);
    expect(SKILL_MD).toBe(join(REPO_ROOT, "skills", DESIGNER_SKILL_NAME, "SKILL.md"));
    expect(readDesignerSkillDescription(SKILL_MD).startsWith("Use when ")).toBe(true);
  });

  it("Claude and Antigravity emit one byte-identical wrapper that points at the packaged folder", () => {
    const claude = emit("claude").artifacts.find((a) => a.absPath.endsWith(".claude/skills/design-os-designer/SKILL.md"));
    const agy = emit("antigravity").artifacts.find((a) => a.absPath.endsWith(".agent/skills/design-os-designer/SKILL.md"));
    expect(claude?.content).toBeDefined();
    expect(claude?.content).toBe(agy?.content);
    expect(claude?.content).toContain("name: design-os-designer");
    expect(claude?.content).toContain(`\`${SKILL_MD}\``);
    expect(claude?.content).toContain(readDesignerSkillDescription(SKILL_MD));
    expect(claude?.content).toContain("needs no separate install");
  });

  it("Codex's managed block names the skill path and says it needs no install", () => {
    const block = emit("codex").artifacts[0]?.content ?? "";
    expect(block).toContain(`\`${SKILL_MD}\``);
    expect(block).toContain("Designer skill for rendered UI work (shipped with ease-design, no install needed)");
  });

  it("ships only the designer skill folder, not the whole skills/ tree", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { files: string[] };
    expect(pkg.files).toContain("skills/design-os-designer");
    expect(pkg.files).not.toContain("skills");
  });

  it("tells the host to run the scripts from the project directory by absolute path", () => {
    const wrapper = emit("claude").artifacts.find((a) => a.absPath.endsWith("design-os-designer/SKILL.md"))?.content ?? "";
    expect(wrapper).toContain("from your project directory");
    expect(wrapper).not.toMatch(/from that folder/);
    expect(emit("codex").artifacts[0]?.content).toContain("from your project directory, by absolute path");
  });

  it("emits no copy of the skill: wrappers are small and the folder is not duplicated into the project", () => {
    for (const runtime of ["claude", "antigravity"] as const) {
      const { cwd, artifacts } = emit(runtime);
      const wrapper = artifacts.find((a) => a.absPath.includes("design-os-designer"));
      expect((wrapper?.content ?? "").split("\n").length).toBeLessThan(20);
      expect(artifacts.some((a) => /\/(build|validate|look)\.mjs$/.test(a.absPath))).toBe(false);
      expect(existsSync(join(cwd, ".claude", "skills", "design-os-designer", "validate.mjs"))).toBe(false);
    }
  });

  it("the routing rule names design-os-designer before es:designer and says to prefer es:designer only when exposed", () => {
    for (const runtime of ["claude", "antigravity"] as const) {
      const rule = emit(runtime).artifacts.find((a) => a.absPath.endsWith("design-os-routing.md"))?.content ?? "";
      expect(rule.indexOf("design-os-designer")).toBeGreaterThan(-1);
      expect(rule.indexOf("design-os-designer")).toBeLessThan(rule.indexOf("es:designer"));
      expect(rule).toContain("If the live skill catalog also exposes `es:designer`");
      expect(rule).not.toMatch(/\b(install|fetch|download)\b[^.\n]*\bes:designer\b/i);
    }
  });
});

describe("adapter wrapper lint with the designer wrapper", () => {
  it("passes for a freshly emitted tree", () => {
    for (const runtime of ["claude", "antigravity"] as const) {
      const { cwd, adapters } = emit(runtime);
      const check = checkWrappers(cwd, { adapters });
      expect(check, check.detail).toMatchObject({ status: "pass" });
    }
  });

  it("fails when the wrapper points at a skill folder that no longer exists", () => {
    const { cwd, adapters } = emit("claude");
    const wrapper = join(cwd, ".claude", "skills", "design-os-designer", "SKILL.md");
    writeFileSync(wrapper, readFileSync(wrapper, "utf8").replace(SKILL_MD, "/gone/skills/design-os-designer/SKILL.md"));
    const check = checkWrappers(cwd, { adapters });
    expect(check.status).toBe("fail");
    expect(check.detail).toContain("points at a template that no longer exists: /gone/skills/design-os-designer/SKILL.md");
  });
});
