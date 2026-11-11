/**
 * `defines` candidates and what an owner ruling turns them into. A term is a candidate for a node only when its name
 * equals the node's name after the registry's own name normalisation (case and spacing). Only a ruling writes a link.
 * A term the owner ruled standalone (and linked to nothing) is not an orphan, nor is a node the owner ruled no term defines.
 */
import { normalizedName } from "../registry-code-source.js";
import { LINK_OUTCOME, STANDALONE_OUTCOME, pairMember } from "../owner-rulings/kind-inferred-links.js";
import type { InferredTerm } from "../owner-rulings/kind-inferred-links.js";
import type { OntLink, OntNode } from "./ontology-types.js";

/** The kinds a glossary term can define: a named thing, not a sentence (`rule`) and not kernel structure (`project`, `gate`). */
const DEFINABLE = new Set(["token", "component", "screen", "ruling", "principle", "pattern", "app", "feature"]);

export function termCandidates(nodes: readonly OntNode[]): InferredTerm[] {
  const named = nodes.filter((n) => DEFINABLE.has(n.kind));
  return nodes.filter((n) => n.kind === "term").map((term) => ({
    id: term.id, name: term.name,
    candidates: named.filter((n) => normalizedName(n.name) === normalizedName(term.name)).map((n) => ({ id: n.id, name: n.name, kind: n.kind })),
  }));
}

export interface AppliedDefines {
  links: OntLink[];
  /** Terms ruled standalone with no pair linked. */
  standalone: Set<string>;
  /** Nodes of a pair ruled standalone: the owner decided they define no term, so they are not orphans (unless linked elsewhere). */
  standaloneNodes: Set<string>;
  /** Recorded pairs that match no current candidate (the term or the node was renamed or removed), sorted. */
  stale: string[];
}

/** The `defines` links the owner ruled, and what was ruled standalone. `outcomes` is member -> outcome of the stored rulings. */
export function appliedDefines(terms: readonly InferredTerm[], outcomes: Readonly<Record<string, string>>): AppliedDefines {
  const links: OntLink[] = [];
  const standalone = new Set<string>();
  const standaloneNodes = new Set<string>();
  const current = new Set<string>();
  for (const t of terms) {
    let linked = 0;
    let declined = 0;
    for (const c of t.candidates) {
      const member = pairMember(t.id, c.id);
      current.add(member);
      const outcome = outcomes[member];
      if (outcome === LINK_OUTCOME) { links.push({ kind: "defines", from: t.id, to: c.id }); linked++; }
      else if (outcome === STANDALONE_OUTCOME) { declined++; standaloneNodes.add(c.id); }
    }
    if (linked === 0 && declined > 0) standalone.add(t.id);
  }
  const stale = Object.keys(outcomes).filter((m) => !current.has(m)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { links, standalone, standaloneNodes, stale };
}
