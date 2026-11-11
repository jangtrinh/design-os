/**
 * Every source of nodes, read from the project's own contract paths (never from an argument): the sealed stores, the
 * Figma scan and the code door for screens, the rule sources, the ring-2 enrichers and the kernel's gate families. One
 * reader per kind; a source that is absent yields zero nodes and one summary line, never a failure and never an
 * invented node. A source that exists and cannot be read is refused by name (`OntologyReadError`).
 */
import { rulingView, withOutcome } from "../figma-ds-ingest-rulings.js";
import { readRulingStore } from "../owner-rulings/ruling-store.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import { gateNodes } from "./gate-table.js";
import { tieEntries } from "./screen-meta-ties.js";
import type { MetaFact } from "./source-screens-meta.js";
import { readRing2 } from "./source-ring2.js";
import type { Ring2Read } from "./source-ring2.js";
import { readRuleNodes } from "./source-rules.js";
import type { RuleRead } from "./source-rules.js";
import { readCodeScreens } from "./source-screens-code.js";
import type { CodeFacts } from "./source-screens-code.js";
import { readFigmaScreens } from "./source-screens-figma.js";
import type { FigmaFacts } from "./source-screens-figma.js";
import { readSealedStores } from "./source-stores.js";
import type { StoreRead } from "./source-stores.js";
import { NODE_KINDS, byText } from "./ontology-types.js";
import type { OntNode, SourceDoor, SourceReport } from "./ontology-types.js";
import type { DsFile } from "../figma-ds-scan-read.js";

export interface NodeSources {
  /** Every node, sorted by id. */
  nodes: OntNode[];
  /** One report per node kind, in kind order. */
  reports: SourceReport[];
  stores: StoreRead;
  rules: RuleRead;
  ring2: Ring2Read;
  scan: DsFile | null;
  figma: FigmaFacts | null;
  code: CodeFacts | null;
  /** Scan nodes the owner kept as deprecated (`archived-marked-nodes`): the ingest strips their archive marker to derive the stored name. */
  keptDeprecated: ReadonlySet<string>;
}

const PROJECT: OntNode = { id: "project:root", kind: "project", name: "project" };

function mergeScreenReports(figma: SourceReport, code: SourceReport): SourceReport {
  const status = figma.status === "read" || code.status === "read" ? "read" : figma.status === "not-sensed" || code.status === "not-sensed" ? "not-sensed" : "missing";
  const parts = [`Figma: ${figma.note}`, `code: ${code.note}`];
  const door = (name: SourceDoor["door"], r: SourceReport): SourceDoor => ({ door: name, status: r.status, nodes: r.nodes, note: r.note });
  return { kind: "screen", status, nodes: figma.nodes + code.nodes, note: parts.join("; "), doors: [door("figma", figma), door("code", code)] };
}

/** The strings a project supplies for a screen (`name`, `kind`, `page`, `purpose`) become that node's `meta`, for the entries that tie to it. */
function withScreenMeta(screens: OntNode[], meta: MetaFact | null): OntNode[] {
  if (meta === null) return screens;
  const ties = tieEntries(meta, screens).tied;
  const fields = new Map([...ties].map(([entry, node]) => [node, meta.entries.find((e) => e.id === entry)?.fields ?? {}]));
  return screens.map((n) => { const f = fields.get(n.id); return f === undefined || Object.keys(f).length === 0 ? n : { ...n, meta: f }; });
}

export function readNodeSources(projectDir: string, rulings?: readonly Ruling[]): NodeSources {
  const ruled = rulings ?? readRulingStore(projectDir).rulings;
  const stores = readSealedStores(projectDir);
  const figma = readFigmaScreens(projectDir, ruled);
  const code = readCodeScreens(projectDir);
  const rules = readRuleNodes(projectDir);
  const ring2 = readRing2(projectDir);
  const gates = gateNodes();
  // The ingest's own question and outcome name: the nodes the owner kept although their name carries an archive marker.
  const keptDeprecated = withOutcome(rulingView(ruled), "archived-marked-nodes", (figma.scan?.components ?? []).map((c) => c.id), "keep-archived");

  const screens = withScreenMeta([...figma.nodes, ...code.nodes], ring2.meta);
  const nodes = [PROJECT, ...stores.tokens, ...stores.components, ...screens, ...rules.nodes, ...gates, ...ring2.nodes].sort((a, b) => byText(a.id, b.id));
  const byKind = new Map<string, SourceReport>();
  for (const r of [...stores.reports, mergeScreenReports(figma.report, code.report), rules.report, ...ring2.reports]) byKind.set(r.kind, r);
  byKind.set("project", { kind: "project", status: "read", nodes: 1, note: "always one node" });
  byKind.set("gate", { kind: "gate", status: "read", nodes: gates.length, note: `${gates.length} gate families of the kernel` });
  const reports = NODE_KINDS.map((k) => byKind.get(k) as SourceReport);
  return { nodes, reports, stores, rules, ring2, scan: figma.scan, figma: figma.figma, code: code.code, keptDeprecated };
}
