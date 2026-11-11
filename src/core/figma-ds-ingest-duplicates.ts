/**
 * What the owner's duplicate-name rulings do to the nodes: which are excluded and which are written under a distinct
 * name. A ruling names the node that keeps a name by id (`keep:<nodeId>`), asks for every bearer to be renamed
 * (`rename-all`) or for none to stay (`exclude-all`); no node keeps a name by being first in the scan.
 */
import { EXCLUDE_ALL, RENAME_ALL, duplicateGroups } from "./owner-rulings/kind-duplicate-component-names.js";
import type { DuplicateNode } from "./owner-rulings/kind-duplicate-component-names.js";

export interface NamedItem { id: string; name: string }

export function resolveDuplicates(nodes: readonly DuplicateNode[], outcomeOf: (member: string) => string | undefined): { excluded: NamedItem[]; renames: Map<string, string> } {
  const groups = duplicateGroups(nodes);
  const inGroup = new Set(groups.flatMap((g) => g.bearers.map((b) => b.id)));
  // A name is taken by every node outside a repeated name, and by the node a ruling lets keep its name.
  const taken = new Set(nodes.filter((n) => !inGroup.has(n.id)).map((n) => n.name));
  const excluded: NamedItem[] = [];
  const renames = new Map<string, string>();
  const rename: Array<{ name: string; bearers: DuplicateNode[] }> = [];
  for (const g of groups) {
    const outcome = outcomeOf(g.member) ?? EXCLUDE_ALL;
    if (outcome === RENAME_ALL) { rename.push(g); continue; }
    const keptId = outcome.startsWith("keep:") ? outcome.slice("keep:".length) : undefined;
    if (keptId !== undefined && g.bearers.some((b) => b.id === keptId)) taken.add(g.name);
    for (const b of g.bearers) if (b.id !== keptId) excluded.push({ id: b.id, name: b.name });
  }
  // Renames come last so a distinct name never takes one that another ruling keeps.
  for (const g of rename) {
    for (const b of g.bearers) {
      const base = `${b.name} · ${b.page ?? "unpaged"}`;
      let candidate = base;
      for (let k = 2; taken.has(candidate); k++) candidate = `${base} (${k})`;
      taken.add(candidate);
      renames.set(b.id, candidate);
    }
  }
  return { excluded, renames };
}
