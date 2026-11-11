/**
 * The one decision "is the conventions pair consistent": the stored `rules` equal the rules derived from the stored
 * `totals`, and `CONVENTIONS.md` equals a render of the JSON. The build (which reads conventions only from a consistent
 * pair) and the lint (which reports the pair) both call it, so they cannot disagree. Known limit: a pair forged
 * consistently (totals, rules and Markdown edited to agree) cannot be told from a measured one without the usage-dna.
 */
import { derivedRules, renderConventionsMarkdown } from "./conventions-machine-form.js";
import type { ConventionsDoc } from "./conventions-machine-form.js";

export const PAIR_CODE = "CONVENTIONS_PAIR_DRIFT";
export interface PairFinding { code: string; severity: "error"; message: string }

const AGAIN = "until ui synthesize-conventions emits the pair again";

export function pairDrift(doc: ConventionsDoc, md: string | null): PairFinding[] {
  if (md === null) return [{ code: PAIR_CODE, severity: "error", message: `design/conventions.json exists but CONVENTIONS.md is missing, so no convention node is written ${AGAIN}` }];
  const out: PairFinding[] = [];
  if (JSON.stringify(doc.rules) !== JSON.stringify(derivedRules(doc))) out.push({ code: PAIR_CODE, severity: "error", message: `the rules stored in design/conventions.json differ from the rules its totals give, so no convention node is written ${AGAIN}` });
  if (md !== renderConventionsMarkdown(doc)) out.push({ code: PAIR_CODE, severity: "error", message: `CONVENTIONS.md differs from a render of design/conventions.json, so no convention node is written ${AGAIN}` });
  return out;
}
