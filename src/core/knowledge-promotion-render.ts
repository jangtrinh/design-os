/** candidates.md — the human-readable half of a promotion run, written for a librarian PR. */
import type { Candidate, GateParams } from "./knowledge-promotion-gate.js";

export interface CandidateView {
  id: string;
  category: string;
  text: string;
  detail?: string;
  scope: unknown;
  principle: string[];
  source: string[];
  reasons: Candidate["reasons"];
  recurrence: number;
  distinctSources: number;
}

const scopeLine = (scope: unknown): string => {
  if (scope === "global" || scope === undefined) return "global";
  if (scope === null || typeof scope !== "object") return String(scope);
  const parts = Object.entries(scope as Record<string, unknown>)
    .filter(([, v]) => Array.isArray(v) && v.length > 0)
    .map(([k, v]) => `${k}: ${(v as unknown[]).join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : "global";
};

function why(c: CandidateView, p: GateParams): string {
  const parts: string[] = [];
  if (c.reasons.includes("recurrence")) parts.push(`recurs in ${c.recurrence} ledger events (gate ≥ ${p.minRecurrence})`);
  if (c.reasons.includes("multi-source")) parts.push(`${c.distinctSources} distinct source documents (gate ≥ ${p.minSources})`);
  return parts.join(" · ");
}

export function renderCandidatesMarkdown(
  views: readonly CandidateView[], params: GateParams, counts: { considered: number; ledgerEvents: number },
): string {
  const out = [
    "# Promotion candidates", "",
    "Proposed by `ui knowledge promote`; scrubbed of project names, hostnames, emails, people, absolute paths and Figma file keys. A librarian PR decides what graduates.", "",
    `- Rulings considered: ${counts.considered}`,
    `- Ledger events read: ${counts.ledgerEvents}`,
    `- Candidates: ${views.length}`,
    `- Gate: recurrence ≥ ${params.minRecurrence} events, or ≥ ${params.minSources} distinct sources`, "",
  ];
  if (views.length === 0) out.push("No candidates: nothing recurs and no live ruling is corroborated by enough sources.", "");
  let category: string | null = null;
  for (const c of views) {
    if (c.category !== category) {
      category = c.category;
      out.push(`## ${category} (${views.filter((v) => v.category === category).length})`, "");
    }
    out.push(`- **\`${c.id}\`** — ${c.text}`, `  - why: ${why(c, params)}`, `  - scope: ${scopeLine(c.scope)}`);
    if (c.principle.length > 0) out.push(`  - principle: ${c.principle.join(", ")}`);
    if (c.detail !== undefined) out.push(`  - detail: ${c.detail}`);
    if (c.source.length > 0) out.push(`  - sources: ${c.source.join("; ")}`);
    out.push("");
  }
  return `${out.join("\n").replace(/\n+$/, "")}\n`;
}
