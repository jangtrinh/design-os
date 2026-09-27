/** Lint for schemas/template-descriptions.json: shape, order, uniqueness, coverage. */
import { validateMethodSchema } from "./method-json-schema.js";
import type { Schema } from "./method-json-schema.js";
import { registeredTemplatePaths } from "./template-catalogue-build.js";
import type { TemplateCatalogue } from "./template-catalogue-build.js";

export interface CatalogueFinding { checkId: string; message: string }

export function lintTemplateCatalogue(doc: unknown, schema: Schema): CatalogueFinding[] {
  const shape = validateMethodSchema(doc, schema);
  if (shape.length > 0) return shape.map((message) => ({ checkId: "catalogue-schema", message }));
  const paths = (doc as TemplateCatalogue).templates.map((t) => t.path);
  const findings: CatalogueFinding[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    if (seen.has(p)) findings.push({ checkId: "catalogue-duplicate", message: `duplicate path ${p}` });
    seen.add(p);
  }
  if (paths.some((p, i) => i > 0 && p < (paths[i - 1] as string))) {
    findings.push({ checkId: "catalogue-order", message: "entries must be sorted by path" });
  }
  const registered = registeredTemplatePaths();
  for (const p of registered) if (!seen.has(p)) findings.push({ checkId: "catalogue-coverage", message: `registered template missing: ${p}` });
  for (const p of seen) if (!registered.includes(p)) findings.push({ checkId: "catalogue-coverage", message: `not a registered template: ${p}` });
  return findings;
}
