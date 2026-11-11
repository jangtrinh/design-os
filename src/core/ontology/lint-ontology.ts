/**
 * `ui ontology lint`, pure over what it is given: the fresh emit (or the reason there is none), the file on disk and the
 * conventions pair. Errors: a link whose target does not exist, a duplicate node id, a stale file (a fresh emit differs
 * from the file on disk, compared by bytes: the method `principles.json` uses), a conventions pair that differs. Orphans
 * are warnings, errors under `--strict`. It never writes and never raises a question.
 */
import { orphanNodes } from "./coverage.js";
import { parseConventionsDoc } from "./conventions-machine-form.js";
import { PAIR_CODE, pairDrift } from "./conventions-pair.js";
export { PAIR_CODE };
import { serializeOntology } from "./emit-ontology.js";
import { graphErrors, sample } from "./graph-errors.js";
import { NODE_KINDS, byText } from "./ontology-types.js";
import type { NodeKind, Ontology } from "./ontology-types.js";

export const STALE_CODE = "ONTOLOGY_STALE";
export const BLOCKED_FRESH_CODE = "ONBOARD_BLOCKED_NEEDS_OWNER_RULING";

export interface LintFinding { code: string; severity: "error" | "warning"; message: string }
export interface LintInput {
  /** The ontology a build would compute now, always: the graph checks run on it even when an open question blocks the write. */
  fresh: Ontology;
  /** Set when an open question blocks a fresh emit: what is open, and the action that works. */
  blocked?: { summary: string; action: string };
  /** The text of the file on disk, or null when there is none. */
  disk: string | null;
  conventions: { json: string | null; md: string | null };
  strict: boolean;
}
export interface LintResult { findings: LintFinding[]; ontology: Ontology | null }

function parseDisk(text: string): Ontology | string {
  let doc: unknown;
  try { doc = JSON.parse(text); } catch { return "the ontology file is not valid JSON; run ui ontology build"; }
  const o = doc as Partial<Ontology> | null;
  if (o === null || typeof o !== "object" || !Array.isArray(o.nodes) || !Array.isArray(o.links)) return "the ontology file has no nodes and links lists; run ui ontology build";
  return o as Ontology;
}

function pairFindings(c: LintInput["conventions"]): LintFinding[] {
  if (c.json === null) return c.md === null ? [] : [{ code: PAIR_CODE, severity: "warning", message: "CONVENTIONS.md has no machine form (design/conventions.json), so no convention becomes a rule node: ui synthesize-conventions <usage-dna.json>" }];
  let parsed: ReturnType<typeof parseConventionsDoc>;
  try { parsed = parseConventionsDoc(JSON.parse(c.json)); } catch { parsed = "not valid JSON"; }
  if (typeof parsed === "string") return [{ code: PAIR_CODE, severity: "error", message: `design/conventions.json cannot be read (${parsed}); re-run ui synthesize-conventions` }];
  return pairDrift(parsed, c.md);
}

export function lintOntology(input: LintInput): LintResult {
  const findings: LintFinding[] = [];
  const err = (code: string, message: string): void => { findings.push({ code, severity: "error", message }); };
  let ontology: Ontology | null = null;
  let onDisk: Ontology | null = null;

  if (input.disk === null) err(STALE_CODE, input.blocked === undefined ? "there is no ontology file yet: ui ontology build writes design/knowledge/ontology.json" : "there is no ontology file yet; answer the open questions first, then ui ontology build writes design/knowledge/ontology.json");
  else {
    const parsed = parseDisk(input.disk);
    if (typeof parsed === "string") err(STALE_CODE, parsed);
    else { onDisk = parsed; ontology = parsed; }
  }
  const view = onDisk ?? input.fresh;
  for (const e of graphErrors(view.nodes, view.links)) err(e.code, e.message);
  const b = input.blocked;
  if (onDisk !== null) {
    if (b !== undefined) err(BLOCKED_FRESH_CODE, `${b.summary}, so the file cannot be compared with a fresh emit: ${b.action}`);
    else if (serializeOntology(input.fresh) !== input.disk) err(STALE_CODE, "the file differs from a fresh emit of the current sources: ui ontology build rewrites it");
  } else if (b !== undefined) err(BLOCKED_FRESH_CODE, `${b.summary}: ${b.action}`);
  ontology = ontology ?? input.fresh;

  if (ontology !== null) {
    const orphans = orphanNodes(ontology);
    for (const kind of NODE_KINDS as readonly NodeKind[]) {
      const mine = orphans.filter((n) => n.kind === kind).map((n) => n.id).sort(byText);
      if (mine.length > 0) findings.push({ code: "ONTOLOGY_ORPHAN", severity: input.strict ? "error" : "warning", message: `${mine.length} ${kind} node(s) have no link and are not standalone: ${sample(mine)}` });
    }
    for (const u of ontology.uncovered ?? []) findings.push({ code: "ONTOLOGY_ORPHAN_UNASKED", severity: "warning", message: `${u.count} ${u.kind} orphan(s) have no candidate, so no question covers them yet` });
  }
  findings.push(...pairFindings(input.conventions));
  return { findings, ontology };
}
