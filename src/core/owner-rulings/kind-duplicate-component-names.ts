/**
 * `duplicate-component-names` (FR-010): two kept nodes share a name after marker stripping. The registry never holds a
 * name twice, so the owner decides. The question is assigned: a member is one repeated name, `<name>#<id>,<id>` (the
 * name plus the sorted ids of the kept nodes that bear it), and its outcome names what happens to the bearers:
 * `keep:<nodeId>` (that node keeps the name, the others are excluded and counted), `rename-all` (every bearer is
 * written as `<name> · <page>`, with an ordinal when the page repeats the name) or `exclude-all`. No node keeps a name
 * by being first in the scan.
 */
import type { ClusterOption, MemberChoice } from "./cluster.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import { memberWithIds } from "./fingerprint.js";
import type { KindDetection, KindEmitter } from "./kind-emitter.js";

export interface DuplicateNode { id: string; name: string; page?: string; pageId?: string }
export interface DuplicateNamesInput {
  /** Kept nodes in scan order; `name` is the stored name (markers already stripped). */
  nodes: DuplicateNode[];
}

export const RENAME_ALL = "rename-all";
export const EXCLUDE_ALL = "exclude-all";
const MAX_PAGE_OPTIONS = 2;

export const keepNode = (nodeId: string): string => `keep:${nodeId}`;

export interface DuplicateGroup { member: string; name: string; bearers: DuplicateNode[] }

/** Every name borne by two or more nodes, in the order of its first node, with its bearers in scan order. */
export function duplicateGroups(nodes: readonly DuplicateNode[]): DuplicateGroup[] {
  const byName = new Map<string, DuplicateNode[]>();
  for (const n of nodes) (byName.get(n.name) ?? byName.set(n.name, []).get(n.name)!).push(n);
  return [...byName].filter(([, bearers]) => bearers.length > 1)
    .map(([name, bearers]) => ({ member: memberWithIds(name, bearers.map((b) => b.id)), name, bearers }));
}

const pageKey = (n: DuplicateNode): string | undefined => n.pageId ?? n.page;
/** Where a node sits, in words: `on <page>`, or `with no page`. */
const where = (n: DuplicateNode): string => (n.page === undefined ? "with no page" : `on ${n.page}`);

function detect(raw: unknown): KindDetection | null {
  const input = raw as DuplicateNamesInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.nodes)) return null;
  const groups = duplicateGroups(input.nodes);
  const by = new Map(groups.map((g) => [g.member, g]));
  const size = new Map<string, number>();
  for (const n of input.nodes) { const k = pageKey(n); if (k !== undefined) size.set(k, (size.get(k) ?? 0) + 1); }
  const order = new Map<string, number>();
  for (const n of input.nodes) { const k = pageKey(n); if (k !== undefined && !order.has(k)) order.set(k, order.size); }
  const members = groups.map((g) => g.member);
  return {
    kind: "duplicate-component-names",
    members,
    domain: members,
    ask(asked) {
      const rows = asked.map((m) => by.get(m)).filter((g): g is DuplicateGroup => g !== undefined);
      const shown = rows.slice(0, 3).map((g) => g.name).join(", ");
      const pages = [...new Set(input.nodes.map(pageKey).filter((k): k is string => k !== undefined))]
        .filter((p) => rows.every((g) => g.bearers.filter((b) => pageKey(b) === p).length === 1))
        .sort((a, b) => (size.get(b) ?? 0) - (size.get(a) ?? 0) || (order.get(a) ?? 0) - (order.get(b) ?? 0))
        .slice(0, MAX_PAGE_OPTIONS);
      const options: ClusterOption[] = pages.map((p) => {
        const label = (input.nodes.find((n) => pageKey(n) === p) as DuplicateNode).page ?? p;
        return {
          id: `keep-page:${p}`, label: `Keep the one on page ${label}`,
          consequence: `${rows.length} name(s): the node on ${label} keeps the name, the other node(s) are excluded and counted`,
          assigns: Object.fromEntries(rows.map((g) => [g.member, keepNode((g.bearers.find((b) => pageKey(b) === p) as DuplicateNode).id)])),
        };
      });
      options.push({
        id: RENAME_ALL, label: "Keep all under distinct names",
        consequence: `${rows.reduce((n, g) => n + g.bearers.length, 0)} record(s) written as "<name> · <page>" (with an ordinal when a page repeats the name)`,
        assigns: Object.fromEntries(rows.map((g) => [g.member, RENAME_ALL])),
      });
      if (options.length + 2 <= 4) {
        options.push({
          id: EXCLUDE_ALL, label: "Exclude all of them",
          consequence: `${rows.reduce((n, g) => n + g.bearers.length, 0)} node(s) left out of the registry, counted and named`,
          assigns: Object.fromEntries(rows.map((g) => [g.member, EXCLUDE_ALL])),
        });
      }
      options.push({ id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${rows.length} name(s) with their nodes; you choose per name` });
      const memberChoices: Record<string, MemberChoice[]> = {};
      const labels: Record<string, string> = {};
      for (const g of rows) {
        memberChoices[g.member] = [
          ...g.bearers.map((b) => ({ id: keepNode(b.id), label: `Keep the one ${where(b)} (${b.id})` })),
          { id: RENAME_ALL, label: "Keep all under distinct names" },
          { id: EXCLUDE_ALL, label: "Exclude all of them" },
        ];
        labels[g.member] = `${g.name}: ${g.bearers.map(where).join(", ")}`;
      }
      return {
        question: `${rows.length} name(s) occur more than once after marker stripping (${shown}${rows.length > 3 ? ", …" : ""}). Which node keeps each name?`,
        options, memberChoices, labels,
      };
    },
  };
}

export const duplicateComponentNamesEmitter: KindEmitter = { kind: "duplicate-component-names", detect };
