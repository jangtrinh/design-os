/**
 * `ui ontology query "<text>" [--area <name>] [--budget <chars>] [--dir <project>] [--json]` (FR-025). Reads only
 * design/knowledge/ontology.json, and only while it equals what a build from the current sources would write: a stale
 * or missing file is refused, never queried and never rebuilt. Writes nothing. No match is a result (exit 0).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { PendingStoreError } from "../core/owner-rulings/pending-store.js";
import { RulingStoreError } from "../core/owner-rulings/ruling-store.js";
import { blockingAction, blockingClusters, blockingSummary } from "../core/ontology/blocking-clusters.js";
import { serializeOntology } from "../core/ontology/emit-ontology.js";
import { graphErrors } from "../core/ontology/graph-errors.js";
import { ONTOLOGY_REL } from "../core/ontology/ontology-types.js";
import type { Ontology } from "../core/ontology/ontology-types.js";
import { listAreas, resolveArea } from "../core/ontology/query-areas.js";
import { queryOntology } from "../core/ontology/query-ontology.js";
import { shellQuote, wordsOf } from "../core/ontology/query-text.js";
import { queryText } from "./ontology-query-render.js";
import { fail, isResult, prepare } from "./ontology-shared.js";
import type { Prepared } from "./ontology-shared.js";

const CMD = "ontology query";
const KNOWN = ["dir", "area", "budget"] as const;
export const DEFAULT_BUDGET = 12000;
const STALE = "ONTOLOGY_STALE";

/** Why the file on disk cannot be queried, and the one next action that works; null when it is the file a build would write now. */
function staleReason(dir: string, ready: Prepared, disk: string | null): string | null {
  if (disk !== null && disk === serializeOntology(ready.built.ontology)) return null;
  const what = disk === null ? "there is no ontology file yet" : "the ontology file differs from what the current sources give";
  const refused = ready.sources.rules.pairDrift.length > 0 || graphErrors(ready.built.ontology.nodes, ready.built.ontology.links).length > 0;
  if (refused) return `${what}, and a rebuild is refused until the findings of the ontology lint are settled; the query reads only a current file`;
  const open = blockingClusters(dir, ready.built.detections);
  if (open.length > 0) {
    const action = blockingAction(dir, open);
    return `${what}, and ${blockingSummary(open)}; the query reads only a current file.\nNext: ${action.startsWith("run ui ontology build") ? "ui ontology build" : action}`;
  }
  return `${what}; the query reads only a current file.\nNext: ui ontology build`;
}

export function runOntologyQuery(parsed: ParsedArgs): CommandResult {
  const json = parsed.json;
  const ready = prepare(parsed, CMD, KNOWN);
  if (isResult(ready)) return ready;
  const text = parsed.positionals.join(" ");
  if (wordsOf(text).length === 0) return fail(CMD, json, "BAD_ARG", `a query needs the task as text with at least one word, for example: ui ontology query ${shellQuote("sign in screen")}`);
  const rawBudget = parsed.flags["budget"];
  if (rawBudget !== undefined && !/^[1-9][0-9]*$/.test(String(rawBudget))) return fail(CMD, json, "BAD_ARG", `--budget '${String(rawBudget)}' must be a whole number of characters above 0`);
  const budget = rawBudget === undefined ? DEFAULT_BUDGET : Number(rawBudget);

  const file = join(ready.dir, ONTOLOGY_REL);
  let why: string | null;
  try { why = staleReason(ready.dir, ready, existsSync(file) ? readFileSync(file, "utf8") : null); }
  catch (e) { if (e instanceof RulingStoreError || e instanceof PendingStoreError) return fail(CMD, json, e.code, e.message); throw e; }
  if (why !== null) return fail(CMD, json, STALE, why);
  // The file equals the fresh emit, so the fresh ontology in memory is the file.
  const ontology: Ontology = ready.built.ontology;

  let area: string | null = null;
  if (typeof parsed.flags["area"] === "string") {
    const areas = listAreas(ontology);
    const chosen = resolveArea(areas, parsed.flags["area"]);
    if ("problem" in chosen) {
      const forText = (key: string): string => `ui ontology query ${shellQuote(text)} --area ${shellQuote(key)}`;
      const named = parsed.flags["area"];
      const msg = chosen.problem === "ambiguous"
        ? `the area name '${named}' matches more than one area: ${chosen.keys.join(", ")}. Use the full key, for example ${forText(chosen.keys[0] as string)}`
        : areas.length === 0
          ? `no area named '${named}': this ontology has no area (no component, token or ruling carries one); query without --area`
          : `no area named '${named}'; the nearest are ${chosen.keys.join(", ")}. For example ${forText(chosen.keys[0] as string)}`;
      return fail(CMD, json, chosen.problem === "ambiguous" ? "ONTOLOGY_AREA_AMBIGUOUS" : "ONTOLOGY_AREA_UNKNOWN", msg);
    }
    area = chosen.key;
  }
  const outcome = queryOntology(ontology, text, area, budget);
  return json ? okJson(CMD, outcome) : { exitCode: 0, stdout: queryText(outcome) };
}
