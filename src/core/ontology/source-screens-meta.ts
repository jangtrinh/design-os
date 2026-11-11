/**
 * `design/knowledge/screens.meta.json` (`screens-meta/1`), as supplied by a project: the kernel reads the fields it
 * names and ignores the rest. `screens` is an object keyed by the project's own screen id; every entry may carry `app`,
 * `feature`, `figmaId`, and the strings `name`, `kind`, `page`, `purpose`. `unassigned` lists frames no app owns yet.
 * `at` is never copied: the ontology carries no time.
 *
 * `app` nodes are the distinct `app` values; `feature` nodes are the distinct (`app`, `feature`) pairs, keyed
 * `feature:<app>/<feature>`. An entry without an `app` contributes no app or feature and is counted. A file that
 * declares the schema and cannot be read in this shape is refused by name: it is never read as "0 apps".
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { nodeId } from "./node-ids.js";
import { BAD_SOURCE, OntologyReadError, parseSourceJson } from "./read-error.js";
import { byText } from "./ontology-types.js";
import type { OntNode, SourceReport } from "./ontology-types.js";

export const SCREENS_META_REL = "design/knowledge/screens.meta.json";
export const SCREENS_META_SCHEMA = "screens-meta/1";
const COPIED_FIELDS = ["name", "kind", "page", "purpose"] as const;

export interface MetaEntry { id: string; app?: string; feature?: string; figmaId?: string; fields: Record<string, string> }
export interface MetaFeature { app: string; name: string; id: string }
export interface MetaFact {
  entries: MetaEntry[];
  apps: string[];
  features: MetaFeature[];
  /** Entries of `unassigned`: counted, never nodes. */
  unassigned: number;
  /** Entries with no usable `app`: they contribute no app or feature. */
  withoutApp: number;
}
export interface MetaRead { meta: MetaFact | null; nodes: OntNode[]; reports: SourceReport[] }

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" && v !== "" ? v : undefined);
const bad = (why: string): OntologyReadError => new OntologyReadError(BAD_SOURCE, `${SCREENS_META_REL} cannot be read as "${SCREENS_META_SCHEMA}": ${why}; fix it or remove it, then run ui ontology build again`);
const absent = (kind: SourceReport["kind"]): SourceReport => ({ kind, status: "missing", nodes: 0, note: `no ${SCREENS_META_REL}` });

export function readScreensMeta(projectDir: string): MetaRead {
  const path = join(projectDir, SCREENS_META_REL);
  if (!existsSync(path)) return { meta: null, nodes: [], reports: [absent("app"), absent("feature")] };
  const doc = parseSourceJson(SCREENS_META_REL, readFileSync(path, "utf8"));
  if (!isObj(doc) || doc["schema"] !== SCREENS_META_SCHEMA) throw new OntologyReadError(BAD_SOURCE, `${SCREENS_META_REL} must declare "schema": "${SCREENS_META_SCHEMA}"`);
  const screens = doc["screens"];
  if (!isObj(screens)) throw bad("'screens' must be an object keyed by screen id");
  const unassigned = doc["unassigned"];
  if (unassigned !== undefined && !Array.isArray(unassigned)) throw bad("'unassigned' must be a list");

  const entries: MetaEntry[] = [];
  const apps = new Set<string>();
  const features = new Map<string, MetaFeature>();
  let withoutApp = 0;
  for (const [id, raw] of Object.entries(screens).sort((a, b) => byText(a[0], b[0]))) {
    if (!isObj(raw)) throw bad(`the entry '${id}' is not an object`);
    const app = str(raw["app"]);
    const feature = str(raw["feature"]);
    const figmaId = str(raw["figmaId"]);
    const fields = Object.fromEntries(COPIED_FIELDS.flatMap((k) => (str(raw[k]) === undefined ? [] : [[k, str(raw[k]) as string]])));
    entries.push({ id, ...(app === undefined ? {} : { app }), ...(feature === undefined ? {} : { feature }), ...(figmaId === undefined ? {} : { figmaId }), fields });
    if (app === undefined) { withoutApp++; continue; }
    apps.add(app);
    if (feature !== undefined) features.set(nodeId("feature", `${app}/${feature}`), { app, name: feature, id: nodeId("feature", `${app}/${feature}`) });
  }
  const nodes: OntNode[] = [
    ...[...apps].map((a): OntNode => ({ id: nodeId("app", a), kind: "app", name: a })),
    ...[...features.values()].map((f): OntNode => ({ id: f.id, kind: "feature", name: f.name })),
  ];
  const meta: MetaFact = { entries, apps: [...apps].sort(byText), features: [...features.values()].sort((a, b) => byText(a.id, b.id)), unassigned: unassigned?.length ?? 0, withoutApp };
  const tail = `${entries.length} screen entr${entries.length === 1 ? "y" : "ies"}, ${meta.unassigned} unassigned${withoutApp > 0 ? `, ${withoutApp} without an app left out and counted` : ""}`;
  return {
    meta, nodes,
    reports: [
      { kind: "app", status: "read", nodes: apps.size, note: `${apps.size} app(s) from ${SCREENS_META_REL} (${tail})` },
      { kind: "feature", status: "read", nodes: features.size, note: `${features.size} feature(s) from ${SCREENS_META_REL} (${tail})` },
    ],
  };
}
