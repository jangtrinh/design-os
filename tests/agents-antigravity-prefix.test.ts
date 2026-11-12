/**
 * An Antigravity agent lives under a folder prefix of its own, so no project name can make an agent land on a skill the
 * kernel writes: the figma-hand agent of a project named `craft` is `figma-craft`, which is also a kernel skill.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JOURNEY_NAMES, SKILL_NAMES } from "../src/adapters/templates.js";
import { capture } from "./owner-rulings-helpers.js";
import { check, init, pinStudioHome } from "./agents-runtimes-helpers.js";

pinStudioHome();
const PERSONA_DATA = join(process.cwd(), "knowledge", "personas", "personas.json");
const craft = (): string => {
  const p = mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "agents-craft-"));
  expect(capture(["ds", "init", "craft", "--persona", "liquid-glass", "--intent", "prefix test", "--dir", p, "--persona-data", PERSONA_DATA, "--bare"]).code).toBe(0);
  return p;
};
const skills = (p: string): string => join(p, ".agent", "skills");

describe("the agent folder prefix", () => {
  it("no kernel Antigravity skill name starts with the agent prefix", () => {
    for (const name of [...SKILL_NAMES, ...JOURNEY_NAMES, "designer"]) expect(name.startsWith("agent-"), name).toBe(false);
  });
  it("agents are written to .agent/skills/design-os-agent-<agent name>/SKILL.md with the same name in the frontmatter", () => {
    const p = craft();
    expect(init(p, "--runtimes", "antigravity").code).toBe(0);
    const text = readFileSync(join(skills(p), "design-os-agent-figma-craft", "SKILL.md"), "utf8");
    expect(text).toMatch(/^---\nname: design-os-agent-figma-craft\n/);
    expect(existsSync(join(skills(p), "design-os-agent-designer-craft", "SKILL.md"))).toBe(true);
  });
  it("a project named craft: the agents never touch the kernel's figma-craft skill, and the kernel never touches the agents", () => {
    const p = craft();
    expect(capture(["init", "--runtime", "antigravity", "--cwd", p]).code).toBe(0);
    const kernel = join(skills(p), "design-os-figma-craft", "SKILL.md");
    const before = readFileSync(kernel, "utf8");
    expect(init(p, "--runtimes", "antigravity", "--force").code).toBe(0);
    expect(readFileSync(kernel, "utf8")).toBe(before);
    expect(check(p).code).toBe(0);
    expect(capture(["init", "--runtime", "antigravity", "--cwd", p, "--force"]).code).toBe(0);
    expect(readdirSync(skills(p)).filter((d) => d.startsWith("design-os-agent-")).sort()).toEqual(["design-os-agent-curator-craft", "design-os-agent-designer-craft", "design-os-agent-figma-craft"]);
    expect(readFileSync(kernel, "utf8")).toBe(before);
    expect(check(p).data.findings).toEqual([]);
  });
});
