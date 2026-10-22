/**
 * The public `design-os-designer` skill is shipped as a folder at `<package>/skills/design-os-designer/`
 * (single source of truth). `ui init` never copies it: each runtime gets a thin wrapper that points at
 * the installed folder, so there is no second copy to drift. This module owns the path, the discovery
 * description (read from the skill's own frontmatter) and the wrapper text.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AdapterArtifact } from "./index.js";
import { toFwdSlash, yamlQuote } from "./wrapper-shapes-shared.js";

export const DESIGNER_SKILL_NAME = "design-os-designer";

/** Absolute path of the shipped SKILL.md (the package root is the parent of templates/). */
export function designerSkillPath(templatesRoot: string): string {
  return resolve(templatesRoot, "..", "skills", DESIGNER_SKILL_NAME, "SKILL.md");
}

/** The `description` value of the skill's frontmatter; throws when the skill is missing or malformed. */
export function readDesignerSkillDescription(skillPath: string): string {
  if (!existsSync(skillPath)) throw new Error(`designer skill not found at ${skillPath}`);
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(skillPath, "utf8"))?.[1] ?? "";
  const description = /^description:\s*"(.*)"\s*$/m.exec(front)?.[1];
  if (description === undefined || description.trim() === "") {
    throw new Error(`designer skill at ${skillPath} has no description in its frontmatter`);
  }
  return description;
}

/** Wrapper body shared byte-for-byte by the Claude and Antigravity skill folders. */
export function buildDesignerSkillWrapper(skillPath: string, description: string): string {
  return [
    "---",
    `name: ${DESIGNER_SKILL_NAME}`,
    `description: ${yamlQuote(description)}`,
    "---",
    "",
    "Follow the skill shipped with ease-design at:",
    `\`${toFwdSlash(skillPath)}\``,
    "",
    "Read it end to end, then run its build, validate and look scripts with Node from your project directory,",
    "by the absolute paths of the files next to that SKILL.md (never from inside the skill folder).",
    "It needs no separate install. If the live skill catalog also exposes `es:designer`, prefer that one.",
    "",
  ].join("\n");
}

/** One wrapper artifact for a runtime whose skills live under `<cwd>/<runtimeDir>/skills/`. */
export function designerSkillArtifact(cwd: string, runtimeDir: ".claude" | ".agent", templatesRoot: string): AdapterArtifact {
  const skillPath = designerSkillPath(templatesRoot);
  return {
    mode: "write",
    absPath: join(cwd, runtimeDir, "skills", DESIGNER_SKILL_NAME, "SKILL.md"),
    content: buildDesignerSkillWrapper(skillPath, readDesignerSkillDescription(skillPath)),
  };
}
