/**
 * need-routing parity — the ship-gate for agent expertise (owner corollary,
 * 2026-08-20: shipping a new design:os capability must fail CI until the
 * agent-teaching layer covers it).
 *
 * Parses ONLY the anchored "## Route table" section of knowledge/need-routing.md
 * — never the whole file, or prose like "never use `slides` for single pages"
 * would count as coverage (the grep-tautology scar). Two directions:
 *   routing-unknown-verb   — a route-column verb not in WORKFLOW_VERBS (dead teaching);
 *   routing-verb-uncovered — a WORKFLOW_VERB with no route-table row (untaught feature —
 *                            the dangerous mirror of the 3-of-4 gate hole).
 * Both directions are red-proven in tests with synthetic tables.
 */
import { WORKFLOW_VERBS } from "../adapters/templates.js";
import type { KnowledgeFinding } from "./knowledge-lint.js";

/** The route-table section: from its heading to the next heading or EOF. */
function routeTableSection(md: string): string | null {
  const m = /^## Route table\s*$/m.exec(md);
  if (m === null) return null;
  const rest = md.slice(m.index + m[0].length);
  const next = /^## /m.exec(rest);
  return next === null ? rest : rest.slice(0, next.index);
}

export function routingChecks(needRoutingMd: string | null): KnowledgeFinding[] {
  const findings: KnowledgeFinding[] = [];
  if (needRoutingMd === null) {
    return [{ checkId: "routing-file-missing", severity: "error",
      message: "knowledge/need-routing.md is missing — the need→verb decision procedure has no home, so generated agents have no routing expertise to read" }];
  }
  const table = routeTableSection(needRoutingMd);
  if (table === null) {
    return [{ checkId: "routing-file-missing", severity: "error",
      message: 'need-routing.md has no "## Route table" section — the anchored table is the machine-checked half of the routing standard' }];
  }

  const covered = new Set<string>();
  // Route column = every backticked token in table rows; composite rows list chains.
  for (const row of table.split("\n")) {
    if (!/^\|.*\|.*\|/.test(row) || /^\|\s*-+/.test(row)) continue;
    for (const tok of row.matchAll(/`([a-z0-9-]+)`/g)) {
      const verb = tok[1] as string;
      if (!(WORKFLOW_VERBS as readonly string[]).includes(verb)) {
        findings.push({ checkId: "routing-unknown-verb", severity: "error",
          message: `route table names \`${verb}\` — not a WORKFLOW_VERB; the routing knowledge teaches a verb that does not exist` });
      } else {
        covered.add(verb);
      }
    }
  }
  for (const verb of WORKFLOW_VERBS) {
    if (!covered.has(verb)) {
      findings.push({ checkId: "routing-verb-uncovered", severity: "error",
        message: `WORKFLOW_VERB \`${verb}\` has no route-table row — a capability shipped without teaching the agents when to use it; add the row (or a declared-exemption row) in knowledge/need-routing.md` });
    }
  }
  return findings;
}
