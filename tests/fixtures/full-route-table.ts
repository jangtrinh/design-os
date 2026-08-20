/**
 * A complete need-routing route table derived from the live verb registry —
 * the one definition behind every synthetic knowledge fixture. A consistent
 * fixture MUST carry a full table, since a missing/partial routing file is an
 * error by design (the routing parity ship-gate). Deriving from WORKFLOW_VERBS
 * keeps fixtures green when a verb ships — the REAL knowledge/need-routing.md
 * is what the gate holds accountable, via its own real-file test.
 */
import { WORKFLOW_VERBS } from "../../src/adapters/templates.js";

export function fullRouteTable(): string {
  const rows = WORKFLOW_VERBS.map((v) => `| need for ${v} | \`${v}\` |`).join("\n");
  return `## Route table\n\n| Need class | Route |\n|---|---|\n${rows}\n\n## Next\n`;
}
