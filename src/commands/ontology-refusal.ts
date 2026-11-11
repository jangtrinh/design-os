/**
 * Why a build refuses a graph its own lint would refuse: the count, the source that holds the cause and the command
 * that settles it. The meaning leads; the code is printed after it by the failure envelope.
 */
import { DUPLICATE_CODE } from "../core/ontology/graph-errors.js";
import type { GraphError } from "../core/ontology/graph-errors.js";

const REGISTRY_CAUSE = "design/component-registry.json holds a component name more than once; ui ingest-figma-ds asks about duplicate component names, so answer that question (ui onboard questions) and ingest again";

export function refusalText(errors: readonly GraphError[]): string {
  const parts = errors.map((e) => {
    if (e.code !== DUPLICATE_CODE) return `${e.message}. A link names a node no source holds; re-run the source that wrote it`;
    const kinds = [...new Set(e.ids.map((id) => id.slice(0, id.indexOf(":"))))].sort();
    const where = kinds.map((k) => (k === "component" ? REGISTRY_CAUSE : `the sources of ${k} nodes hold one name more than once; make the names unique at the source`));
    return `${e.message}. ${where.join("; ")}`;
  });
  return `nothing was written: ${parts.join("; ")}`;
}
