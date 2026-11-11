/**
 * `inferred-links` (FR-023, raised by `ui ontology build`): a glossary term is named like one or more nodes of the
 * ontology. A `defines` link is never exact, so it is asked: one question per term, whose members are the candidate
 * nodes. The question is assigned (one outcome per member): the owner links the term to every candidate, marks the term
 * standalone, or decides node by node. A member is the pair `<term id>→<node id>`, so it names the term and the node by
 * id; renaming either leaves the ruling attached to the right pair, and a pair that no longer exists is simply stale.
 *
 * A candidate exists only when the term's name equals the node's name after the normalisation the registry uses for
 * names (case and spacing): no substring, no stemming, no similarity score. A term nothing is named after raises
 * nothing here: the kernel has no question kind for it.
 */
import type { ClusterOption, MemberChoice } from "./cluster.js";
import { REVIEW_INDIVIDUALLY } from "./cluster-kinds.js";
import type { AskResult, KindDetection, KindEmitter } from "./kind-emitter.js";

export const LINK_OUTCOME = "link";
export const STANDALONE_OUTCOME = "standalone";
const SEPARATOR = "→";

export interface TermCandidate { id: string; name: string; kind: string }
export interface InferredTerm { id: string; name: string; candidates: TermCandidate[] }
export interface InferredLinksInput { terms: InferredTerm[] }

export const pairMember = (termId: string, nodeId: string): string => `${termId}${SEPARATOR}${nodeId}`;
export function parsePair(member: string): { term: string; node: string } | null {
  const at = member.indexOf(SEPARATOR);
  return at <= 0 ? null : { term: member.slice(0, at), node: member.slice(at + SEPARATOR.length) };
}

function askFor(term: InferredTerm, members: readonly string[]): AskResult {
  const wanted = new Set(members);
  const asked = term.candidates.filter((c) => wanted.has(pairMember(term.id, c.id)));
  const all = (outcome: string): Record<string, string> => Object.fromEntries(asked.map((c) => [pairMember(term.id, c.id), outcome]));
  const options: ClusterOption[] = [
    { id: "link-all", label: `Link the term to ${asked.length === 1 ? "this node" : `all ${asked.length} nodes`}`, consequence: `${asked.length} defines link(s) written from the term ${term.name}`, recommended: true, assigns: all(LINK_OUTCOME) },
    { id: "standalone", label: "Mark the term standalone", consequence: `no link written; the term ${term.name} is not counted as an orphan`, assigns: all(STANDALONE_OUTCOME) },
  ];
  if (asked.length > 1) options.push({ id: REVIEW_INDIVIDUALLY, label: "Review individually", consequence: `a sheet lists the ${asked.length} nodes; you choose per node` });
  const choices: MemberChoice[] = [{ id: LINK_OUTCOME, label: "The term defines this node" }, { id: STANDALONE_OUTCOME, label: "No link; the term is standalone" }];
  return {
    question: `The term ${term.name} is named like ${asked.length} node(s): ${asked.map((c) => `${c.name} (${c.kind})`).join(", ")}. Does the term define ${asked.length === 1 ? "it" : "them"}, or is it standalone?`,
    options,
    memberChoices: Object.fromEntries(asked.map((c) => [pairMember(term.id, c.id), choices])),
    labels: Object.fromEntries(asked.map((c) => [pairMember(term.id, c.id), `${term.name} (term) defines ${c.name} (${c.kind})`])),
  };
}

function detectAll(raw: unknown): KindDetection[] {
  const input = raw as InferredLinksInput | null;
  if (input === null || typeof input !== "object" || !Array.isArray(input.terms)) return [];
  return input.terms.filter((t) => t.candidates.length > 0).map((term): KindDetection => {
    const members = term.candidates.map((c) => pairMember(term.id, c.id));
    return { kind: "inferred-links", members, domain: members, ask: (asked) => askFor(term, asked) };
  });
}

export const inferredLinksEmitter: KindEmitter = {
  kind: "inferred-links",
  detect: (input) => detectAll(input)[0] ?? null,
  detectAll,
};
