/**
 * Why a build refuses a graph its own lint would refuse: the count, the source that holds the cause and the command
 * that settles it. The meaning leads; the code is printed after it by the failure envelope.
 */
import { DUPLICATE_CODE } from "../core/ontology/graph-errors.js";
import type { GraphError } from "../core/ontology/graph-errors.js";
import { INGEST_COMMAND, INGEST_OUT_REL } from "../core/ontology/source-screens-figma.js";

// True whether the repeat came from the ingest or from a registry edited by hand and resealed: the registry is written again from the scan.
const REGISTRY_CAUSE = `design/component-registry.json holds a component name more than once; run the ingest again with ${INGEST_COMMAND} (it asks when two components of the scan share a name), then seal what it wrote with ui ds import ${INGEST_OUT_REL}/tokens.json --registry ${INGEST_OUT_REL}/component-registry.json --force --reset-registry (replacing the registry removes the records registered from code, and ui ds surface --register --apply writes them again)`;

export function refusalText(errors: readonly GraphError[]): string {
  const parts = errors.map((e) => {
    if (e.code !== DUPLICATE_CODE) return `${e.message}. A link names a node no source holds; re-run the source that wrote it`;
    const kinds = [...new Set(e.ids.map((id) => id.slice(0, id.indexOf(":"))))].sort();
    const where = kinds.map((k) => (k === "component" ? REGISTRY_CAUSE : `the sources of ${k} nodes hold one name more than once; make the names unique at the source`));
    return `${e.message}. ${where.join("; ")}`;
  });
  return `nothing was written: ${parts.join("; ")}`;
}
