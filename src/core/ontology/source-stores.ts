/**
 * The two stores `ui ds import` seals: the token store and the component registry. Read through the same seal check the
 * other commands use (`loadDesignSystem`, strict: a store whose files drifted from their seal is refused, never read).
 * Absent stores are missing sources with the command that produces them, never a failure.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DSError, loadDesignSystem, pathsForDir } from "../design-system.js";
import type { ComponentRecord } from "../registry-store.js";
import { nodeId } from "./node-ids.js";
import { INGEST_COMMAND, INGEST_OUT_REL } from "./source-screens-figma.js";
import { OntologyReadError } from "./read-error.js";
import type { OntNode, SourceReport } from "./ontology-types.js";

export interface StoreRead {
  tokens: OntNode[];
  components: OntNode[];
  records: ComponentRecord[];
  tokenPaths: Set<string>;
  reports: SourceReport[];
}

/** The project-relative file of a code reference (`path:start-end` -> `path`): a line range is a position, never an id or a field. */
export const fileOfSourceRef = (ref: string): string => ref.replace(/:\d+-\d+$/, "");

function componentNode(r: ComponentRecord): OntNode {
  const code = r.provenance?.kind === "code" ? r.provenance.sourceRef : r.code?.sourceRef;
  return {
    id: nodeId("component", r.name), kind: "component", name: r.name, category: r.category,
    origin: r.provenance?.kind ?? "registry",
    ...(code === undefined ? {} : { codeFile: fileOfSourceRef(code) }),
    ...(r.status === undefined ? {} : { status: r.status }),
    ...(r.scope === undefined ? {} : { scope: r.scope }),
    ...(r.deprecated === true ? { deprecated: true } : {}),
    ...(r.variants === undefined || r.variants.length === 0 ? {} : { variants: [...r.variants].sort() }),
  };
}

export function readSealedStores(projectDir: string): StoreRead {
  const paths = pathsForDir(join(projectDir, "design"));
  try {
    const ds = loadDesignSystem(paths);
    // A token written from CSS carries the custom property it came from, so a host can write var(--ds-surface) without guessing.
    const tokens = ds.resolved.map((t): OntNode => ({ id: nodeId("token", t.path), kind: "token", name: t.path, type: t.type, value: t.value, ...(t.customProperty === undefined ? {} : { customProperty: t.customProperty }) }));
    const components = ds.registry.components.map(componentNode);
    const read = (kind: "token" | "component", n: number, what: string): SourceReport => ({ kind, status: "read", nodes: n, note: n === 0 ? `${what} is sealed and holds no entry` : `${n} from the sealed ${what}` });
    return {
      tokens, components, records: ds.registry.components, tokenPaths: new Set(ds.resolved.map((t) => t.path)),
      reports: [read("token", tokens.length, "token store"), read("component", components.length, "component registry")],
    };
  } catch (e) {
    if (!(e instanceof DSError)) throw e;
    if (e.code !== "DS_NOT_FOUND") throw new OntologyReadError(e.code, `${e.message.replace(/[.\s]+$/, "")}. The ontology reads only a sealed store: restore the file, or adopt the change with ui ds reseal --apply --reason "<why>", then run ui ontology build again`);
    const registryHere = existsSync(join(projectDir, "design", "component-registry.json"));
    const registryNote = registryHere ? "design/component-registry.json is not sealed: run ui ds import <tokens.json> --registry design/component-registry.json" : `no sealed component registry: run ${INGEST_COMMAND}, then ui ds import ${INGEST_OUT_REL}/tokens.json --registry ${INGEST_OUT_REL}/component-registry.json, or ui ds surface --register --apply`;
    return {
      tokens: [], components: [], records: [], tokenPaths: new Set(),
      reports: [
        { kind: "token", status: "missing", nodes: 0, note: "no sealed token store: run ui ds import <tokens.json>" },
        { kind: "component", status: "missing", nodes: 0, note: registryNote },
      ],
    };
  }
}
