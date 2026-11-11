/**
 * Every source of nodes, read from the project's own contract paths (never from an argument): the sealed stores, the
 * Figma scan and the code door for screens, the rule sources, the ring-2 enrichers and the kernel's gate families. One
 * reader per kind; a source that is absent yields zero nodes and one summary line, never a failure and never an
 * invented node. A source that exists and cannot be read is refused by name (`OntologyReadError`).
 */
import { readRulingStore } from "../owner-rulings/ruling-store.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import { gateNodes } from "./gate-table.js";
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
import type { OntNode, SourceReport } from "./ontology-types.js";
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
}

const PROJECT: OntNode = { id: "project:root", kind: "project", name: "project" };

function mergeScreenReports(figma: SourceReport, code: SourceReport): SourceReport {
  const status = figma.status === "read" || code.status === "read" ? "read" : figma.status === "not-sensed" || code.status === "not-sensed" ? "not-sensed" : "missing";
  const parts = [`Figma: ${figma.note}`, `code: ${code.note}`];
  return { kind: "screen", status, nodes: figma.nodes + code.nodes, note: parts.join("; ") };
}

export function readNodeSources(projectDir: string, rulings?: readonly Ruling[]): NodeSources {
  const ruled = rulings ?? readRulingStore(projectDir).rulings;
  const stores = readSealedStores(projectDir);
  const figma = readFigmaScreens(projectDir, ruled);
  const code = readCodeScreens(projectDir);
  const rules = readRuleNodes(projectDir);
  const ring2 = readRing2(projectDir);
  const gates = gateNodes();

  const screens = [...figma.nodes, ...code.nodes].map((n) => {
    const meta = ring2.screenMeta.get(n.id);
    return meta === undefined ? n : { ...n, meta };
  });
  const nodes = [PROJECT, ...stores.tokens, ...stores.components, ...screens, ...rules.nodes, ...gates, ...ring2.nodes].sort((a, b) => byText(a.id, b.id));
  const byKind = new Map<string, SourceReport>();
  for (const r of [...stores.reports, mergeScreenReports(figma.report, code.report), rules.report, ...ring2.reports]) byKind.set(r.kind, r);
  byKind.set("project", { kind: "project", status: "read", nodes: 1, note: "always one node" });
  byKind.set("gate", { kind: "gate", status: "read", nodes: gates.length, note: `${gates.length} gate families of the kernel` });
  const reports = NODE_KINDS.map((k) => byKind.get(k) as SourceReport);
  return { nodes, reports, stores, rules, ring2, scan: figma.scan, figma: figma.figma, code: code.code };
}
