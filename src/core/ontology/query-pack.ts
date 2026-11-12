/**
 * The pack of `ui ontology query`: the reached nodes, grouped in one fixed order (rules, patterns, components, tokens,
 * rulings, sibling screens), each entry naming its node id and the project-relative file a host can open, cut to a
 * budget of characters. The cut takes whole entries from the end of the order, never the middle of one; what it left
 * out is counted per group.
 */
import type { NodeKind, OntNode } from "./ontology-types.js";
import { byText } from "./ontology-types.js";

export const GROUP_ORDER = ["rules", "patterns", "components", "tokens", "rulings", "sibling screens"] as const;
export type GroupName = (typeof GROUP_ORDER)[number];
export const GROUP_OF_KIND: Partial<Record<NodeKind, GroupName>> = { rule: "rules", pattern: "patterns", component: "components", token: "tokens", ruling: "rulings" };

export interface ScoredNode { node: OntNode; score: number }
export interface PackEntry { id: string; name: string; kind: string; source: string; score: number; line: string }
export interface PackGroup { group: GroupName; entries: PackEntry[]; leftOut: number }
export interface Pack { characters: number; text: string; groups: PackGroup[] }

const RULE_FILES: Record<string, string> = { soul: "design/soul.md", adherence: "design/rules/_adherence.rules.json", convention: "design/conventions.json" };

/** The project-relative file a node came from, so a host can open it. Never an absolute path. */
export function sourcePath(n: OntNode): string {
  const key = n.id.slice(n.id.indexOf(":") + 1);
  switch (n.kind) {
    case "component": return typeof n["codeFile"] === "string" ? n["codeFile"] : "design/component-registry.json";
    case "token": return "design/design.tokens.json";
    case "rule": return RULE_FILES[String(n["origin"])] ?? "design/soul.md";
    case "pattern": return `design/patterns/${key}.md`;
    case "ruling": return "design/knowledge/rulings.json";
    case "principle": return "design/principles.json";
    case "term": return "CONTEXT.md";
    case "screen": return n["door"] === "code" && typeof n["file"] === "string" ? n["file"] : "design/ds.json";
    case "app": case "feature": return "design/knowledge/screens.meta.json";
    default: return "";
  }
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const oneLine = (s: string): string => s.replace(/\s+/g, " ").trim();

function line(n: OntNode): string {
  const extra = n.kind === "token" ? ` = ${typeof n["value"] === "string" ? n["value"] : JSON.stringify(n["value"])}${typeof n["customProperty"] === "string" ? ` [${n["customProperty"]}]` : ""}` : n.kind === "ruling" && typeof n["text"] === "string" ? `: ${clip(oneLine(n["text"]), 160)}` : "";
  return `- ${clip(oneLine(n.name), 160)} (${n.id}) — ${sourcePath(n)}${extra}`;
}

export function entryOf({ node, score }: ScoredNode): PackEntry {
  return { id: node.id, name: node.name, kind: node.kind, source: sourcePath(node), score, line: line(node) };
}

const byScoreThenId = (a: PackEntry, b: PackEntry): number => b.score - a.score || byText(a.id, b.id);

/** Groups the reached nodes in the fixed order and cuts whole entries from the end to fit `budget` characters. */
export function buildPack(reached: readonly ScoredNode[], siblings: readonly ScoredNode[], budget: number): Pack {
  const full = new Map<GroupName, PackEntry[]>(GROUP_ORDER.map((g) => [g, []]));
  for (const r of reached) { const g = GROUP_OF_KIND[r.node.kind]; if (g !== undefined) full.get(g)?.push(entryOf(r)); }
  for (const s of siblings) full.get("sibling screens")?.push(entryOf(s));
  const groups: PackGroup[] = [];
  let text = "";
  let open = true;
  for (const g of GROUP_ORDER) {
    const all = (full.get(g) ?? []).sort(byScoreThenId);
    if (all.length === 0) continue;
    const kept: PackEntry[] = [];
    for (const e of all) {
      if (!open) break;
      const head = kept.length === 0 ? `## ${g}\n` : "";
      const cost = head.length + e.line.length + 1;
      if (text.length + cost > budget) { open = false; break; }
      text += `${head}${e.line}\n`;
      kept.push(e);
    }
    groups.push({ group: g, entries: kept, leftOut: all.length - kept.length });
  }
  return { characters: text.length, text, groups };
}
