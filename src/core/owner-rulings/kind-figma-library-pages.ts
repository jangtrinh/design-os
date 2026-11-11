/**
 * `figma-library-pages` (FR-009): component-kind nodes sit on more than one page. A multi-select question over the
 * pages, largest first, with no computed recommendation: which pages hold the design system. The member is the page
 * id from the scan (its name only when the scan carries nothing else). Nodes on pages that are left out are excluded,
 * counted per page, and the page named.
 */
import type { KindDetection, KindEmitter } from "./kind-emitter.js";
import { setValuedOptions } from "./set-valued-options.js";

export interface LibraryPagesInput {
  pages: { id: string; name: string; nodes: number }[];
}

function detect(raw: unknown): KindDetection | null {
  const input = raw as LibraryPagesInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.pages)) return null;
  const ids = input.pages.map((p) => p.id);
  const by = new Map(input.pages.map((p) => [p.id, p]));
  const nodes = (id: string): number => by.get(id)?.nodes ?? 0;
  const nameOf = (id: string): string => by.get(id)?.name ?? id;
  return {
    kind: "figma-library-pages",
    members: input.pages.length > 1 ? ids : [],
    domain: ids,
    ask(members) {
      const position = new Map(members.map((m, i) => [m, i]));
      const list = [...members].sort((a, b) => nodes(b) - nodes(a) || (position.get(a) ?? 0) - (position.get(b) ?? 0)).map((m) => `${nameOf(m)} (${nodes(m)} nodes)`).join(", ");
      return {
        question: `Component-kind nodes sit on ${members.length} pages: ${list}. Which pages hold the design system? Nodes on a page left out are excluded and counted; the page is named.`,
        options: setValuedOptions({
          members,
          weight: nodes,
          describe(group, role) {
            const total = group.reduce((n, m) => n + nodes(m), 0);
            return role === "rest"
              ? { label: `Keep the other ${group.length} pages (${total} nodes)`, consequence: `${total} nodes kept, from ${group.length} pages` }
              : { label: `Keep ${nameOf(group[0] ?? "")}`, consequence: `${total} nodes kept` };
          },
        }),
        labels: Object.fromEntries(members.map((m) => [m, nameOf(m)])),
      };
    },
  };
}

export const figmaLibraryPagesEmitter: KindEmitter = { kind: "figma-library-pages", detect };
