/**
 * Pure builder for schemas/template-descriptions.json. Filesystem access lives
 * in src/commands/templates-catalogue.ts; this module only turns raw template
 * bytes into the catalogue document and serialises it canonically.
 */
import { createHash } from "node:crypto";
import { WORKFLOW_VERBS, SKILL_NAMES, JOURNEY_NAMES } from "../adapters/templates.js";
import { parseTemplateDescription } from "./template-catalogue-parse.js";

export interface TemplateCatalogueEntry {
  path: string;
  description: string | null;
  sourceSha256: string;
}
export interface TemplateCatalogue { version: 1; templates: TemplateCatalogueEntry[] }

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Registry-relative template paths, sorted. `init` is synthetic: it has no file. */
export function registeredTemplatePaths(): string[] {
  return [
    ...WORKFLOW_VERBS.filter((v) => v !== "init").map((v) => `workflows/${v}.md`),
    ...SKILL_NAMES.map((n) => `skills/${n}.md`),
    ...JOURNEY_NAMES.map((n) => `journeys/${n}.md`),
  ].sort(byCodePoint);
}

/** `raw` maps each registered path to the template's file content. */
export function buildTemplateCatalogue(raw: ReadonlyMap<string, Buffer>): TemplateCatalogue {
  const templates = [...raw.keys()].sort(byCodePoint).map((path) => {
    const bytes = raw.get(path) as Buffer;
    return {
      path,
      description: parseTemplateDescription(bytes.toString("utf8")),
      sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    };
  });
  return { version: 1, templates };
}

export function serialiseTemplateCatalogue(catalogue: TemplateCatalogue): string {
  return JSON.stringify(catalogue, null, 2) + "\n";
}
