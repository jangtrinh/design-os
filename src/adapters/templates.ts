/**
 * Template path resolver and hash utility for the adapter generator.
 *
 * WORKFLOW_VERBS, SKILL_NAMES, and JOURNEY_NAMES are the canonical registries.
 * If a new template file is added to templates/, these lists must be updated
 * in the same commit. The test suite asserts parity with the actual filesystem.
 *
 * The `init` verb is a special case: there is no `templates/workflows/init.md`
 * because the init slash-command wraps `ui init` itself, not a design workflow.
 * `resolveTemplatePath` returns null for ("workflow", "init") and callers
 * must handle null to produce a synthetic body.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { createHash } from "node:crypto";

// ─── Registries ───────────────────────────────────────────────────────────────

/**
 * All user-facing workflow verbs. "init" is synthetic (no template file). The
 * rest correspond to files in templates/workflows/ (critique.md is a build
 * sub-step, not a directly-invoked verb, so it is intentionally absent).
 */
export const WORKFLOW_VERBS = [
  "generate",
  "native-macos",
  "native-ios",
  "native-ipados",
  "iterate",
  "refine",
  "redesign",
  "extract",
  "learn",
  "why",
  "from-ref",
  "from-url",
  "figma",
  "figma-comments",
  "to-figma",
  "audit",
  "design",
  "diagram",
  "chart",
  "slides",
  "evidence",
  "init",
] as const satisfies readonly string[];

export type WorkflowVerb = (typeof WORKFLOW_VERBS)[number];

/**
 * Per-role command allowlist for templates/agents/*.md — agent templates POINT,
 * they never enumerate volatile commands. An existence check cannot catch the
 * drift class actually observed (a template teaching live-but-SUPERSEDED
 * commands: the designer's old four-linter quartet all still exist); pinning
 * what each role should cite makes a superseded citation a red test.
 * Same-commit discipline as WORKFLOW_VERBS: change a template's commands and
 * this list in one commit. tests/template-command-refs.test.ts enforces
 * template→allowlist (every cited span is allowlisted) and
 * allowlist→registry (every `ui` prefix names a real command AND subcommand;
 * `design-os` spans belong to the Typer umbrella's own registry). It does NOT
 * enforce allowlist→template: a prefix left behind after a template edit is
 * dead config, pruned by review.
 */
export const AGENT_TEMPLATE_COMMAND_ALLOWLIST: Record<string, readonly string[]> = {
  designer: ["ui ds context", "ui gate", "ui knowledge activate", "ui memory record", "ui schema"],
  curator: ["ui ds context", "ui gate", "ui ds a11y", "ui memory record", "ui schema", "design-os audit"],
  "figma-hand": ["ui ds context", "ui memory record", "ui schema"],
};

/**
 * All skill names. Each corresponds to a file in templates/skills/.
 */
export const SKILL_NAMES = [
  "pick-persona",
  "score-taste",
  "check-consistency",
  "verify-canvas",
  "color-decision",
  "token-model",
  "apply-prompt-mode",
  "designmd-emit",
  "figma-craft",
  "diagram-craft",
  "chart-craft",
  "gsap-motion",
  "canvas-effect",
  "gflow-flight",
  "scroll-cinema",
  "shader-gradient",
  "native-macos-craft",
  "native-ios-craft",
  "native-ipados-craft",
] as const satisfies readonly string[];

export type SkillName = (typeof SKILL_NAMES)[number];

/**
 * All journey-skill names. Each corresponds to a file in templates/journeys/.
 * Journeys are stage-level skills (onboard/daily/deliver) — cross-cutting
 * sequencing + disambiguation knowledge, as opposed to SKILL_NAMES' single-verb
 * craft skills. Emitted through the same per-runtime skill wrapper shape.
 */
export const JOURNEY_NAMES = [
  "onboard",
  "daily",
  "deliver",
] as const satisfies readonly string[];

export type JourneyName = (typeof JOURNEY_NAMES)[number];

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve the absolute path of a template file.
 *
 * Returns null for the synthetic "init" workflow (no template file exists).
 * Throws if any other template is missing — a missing template is a hard error
 * caught before any file is written.
 */
export function resolveTemplatePath(
  templatesRoot: string,
  kind: "workflow" | "skill" | "journey",
  name: string,
): string | null {
  if (kind === "workflow" && name === "init") {
    return null;
  }
  const subdir = kind === "workflow" ? "workflows" : kind === "skill" ? "skills" : "journeys";
  const absPath = join(templatesRoot, subdir, `${name}.md`);
  if (!existsSync(absPath)) {
    throw new Error(`template not found at ${absPath}`);
  }
  return absPath;
}

// ─── Discovery description ────────────────────────────────────────────────────

const TEMPLATE_KINDS = new Set(["workflows", "skills", "journeys"]);
const catalogueCache = new Map<string, Map<string, string | null>>();

function loadDescriptionCatalogue(path: string): Map<string, string | null> {
  const cached = catalogueCache.get(path);
  if (cached !== undefined) return cached;
  let doc: { templates: Array<{ path: string; description: string | null }> };
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(
      `template description catalogue unreadable at ${path}; regenerate it with ` +
        "`ui templates catalogue --out schemas/template-descriptions.json`",
    );
  }
  const map = new Map(doc.templates.map((t) => [t.path, t.description] as const));
  catalogueCache.set(path, map);
  return map;
}

/**
 * The `description` of a registered template (what + when + trigger terms), or
 * null when the template carries none or `absPath` is not a template location
 * (<root>/templates/{workflows,skills,journeys}/<name>.md).
 *
 * The value comes from <root>/schemas/template-descriptions.json, emitted from
 * the template frontmatter by `ui templates catalogue`; the kernel never parses
 * template Markdown at runtime. A missing or unparseable catalogue throws.
 */
export function readTemplateDescription(absPath: string): string | null {
  const kindDir = dirname(absPath);
  const templatesDir = dirname(kindDir);
  if (basename(templatesDir) !== "templates" || !TEMPLATE_KINDS.has(basename(kindDir))) return null;
  const catalogue = loadDescriptionCatalogue(
    join(dirname(templatesDir), "schemas", "template-descriptions.json"),
  );
  return catalogue.get(`${basename(kindDir)}/${basename(absPath)}`) ?? null;
}

// ─── Hasher ───────────────────────────────────────────────────────────────────

/**
 * Return the sha256 hex digest of a template file's contents.
 * Used to record templateHashes in the manifest for future drift detection.
 */
export function hashTemplateFile(absPath: string): string {
  const buf = readFileSync(absPath);
  return createHash("sha256").update(buf).digest("hex");
}
