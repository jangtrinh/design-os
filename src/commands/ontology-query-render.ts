/**
 * The text of `ui ontology query`: what was asked and found, the pack in its fixed order and what the budget cut. The
 * meaning leads and the node id follows it; no absolute path, so the same tree gives the same bytes from any checkout.
 */
import type { QueryOutcome } from "../core/ontology/query-ontology.js";

const SHOWN_MATCHES = 10;
const SINGULAR: Record<string, string> = { rules: "rule(s)", patterns: "pattern(s)", components: "component(s)", tokens: "token(s)", rulings: "ruling(s)", "sibling screens": "sibling screen(s)" };

export function queryText(o: QueryOutcome): string {
  const lines = [`Query: "${o.query}"${o.area === null ? "" : ` in area ${o.area}`}`, `matches: ${o.matchCount}`];
  const replaced = o.supersededLeftOut > 0 ? `Left out because a newer ruling replaces them: ${o.supersededLeftOut} ruling(s) that matched the words but declare a successor.\n` : "";
  if (o.pack === null) {
    lines.push("Nearest titles:", ...o.nearest.map((n) => `  - ${n.name} (${n.id})`), "No pack: no title or alias holds a word of the query.");
    return `${lines.join("\n")}\n${replaced}`;
  }
  for (const m of o.matches.slice(0, SHOWN_MATCHES)) lines.push(`  - ${m.name} (${m.id}) — ${m.source} — ${m.score} word(s)`);
  if (o.matches.length > SHOWN_MATCHES) lines.push(`  and ${o.matches.length - SHOWN_MATCHES} more`);
  const kept = o.pack.groups.reduce((n, g) => n + g.entries.length, 0);
  lines.push(`Pack: ${kept} entr${kept === 1 ? "y" : "ies"}, ${o.pack.characters} of ${o.budget} characters`);
  const left = o.pack.groups.filter((g) => g.leftOut > 0).map((g) => `${g.leftOut} ${SINGULAR[g.group]}`);
  return `${lines.join("\n")}\n${o.pack.text}${left.length === 0 ? "" : `Left out to respect the budget: ${left.join(", ")}\n`}${replaced}`;
}
