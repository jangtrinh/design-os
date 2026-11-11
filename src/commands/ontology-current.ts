/**
 * The one definition of "the ontology file is current": it equals what a build from the current sources would write. The
 * query, `ui agents init` and `ui agents check` all ask this module, so the sentence and the next action are the same
 * wherever the question comes up. Pure over what it is given, except `judgeCurrentOnDisk`, which reads the project.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "../core/cli-args.js";
import { blockingAction, blockingClusters, blockingSummary } from "../core/ontology/blocking-clusters.js";
import { serializeOntology } from "../core/ontology/emit-ontology.js";
import { graphErrors } from "../core/ontology/graph-errors.js";
import { ONTOLOGY_REL } from "../core/ontology/ontology-types.js";
import { PendingStoreError } from "../core/owner-rulings/pending-store.js";
import { RulingStoreError } from "../core/owner-rulings/ruling-store.js";
import { isResult, prepare } from "./ontology-shared.js";
import type { Prepared } from "./ontology-shared.js";

/** Why the file is not current, and the one command that works next (null when none does until something else is settled). */
export interface NotCurrent { sentence: string; next: string | null }

/** null when `disk` is the file a build would write now. */
export function judgeCurrent(dir: string, ready: Prepared, disk: string | null): NotCurrent | null {
  if (disk !== null && disk === serializeOntology(ready.built.ontology)) return null;
  const what = disk === null ? "there is no ontology file yet" : "the ontology file differs from what the current sources give";
  const refused = ready.sources.rules.pairDrift.length > 0 || graphErrors(ready.built.ontology.nodes, ready.built.ontology.links).length > 0;
  if (refused) return { sentence: `${what}, and a rebuild is refused until the findings of the ontology lint are settled`, next: null };
  const open = blockingClusters(dir, ready.built.detections);
  if (open.length > 0) {
    const action = blockingAction(dir, open);
    return { sentence: `${what}, and ${blockingSummary(open)}`, next: action.startsWith("run ui ontology build") ? "ui ontology build" : action };
  }
  return { sentence: what, next: "ui ontology build" };
}

/** For a caller that has not read the sources yet: null when there is no file (the project has no ontology) or it is current. */
export function judgeCurrentOnDisk(dir: string): NotCurrent | null {
  const file = join(dir, ONTOLOGY_REL);
  if (!existsSync(file)) return null;
  const ready = prepare(parseArgs(["ontology", "build", "--dir", dir]), "ontology build", ["dir"]);
  if (isResult(ready)) return { sentence: `the sources cannot be read (${(ready.stderr ?? "").replace(/^ui: /, "").trim()})`, next: null };
  try { return judgeCurrent(dir, ready, readFileSync(file, "utf8")); }
  catch (e) {
    if (e instanceof RulingStoreError || e instanceof PendingStoreError) return { sentence: e.message, next: null };
    throw e;
  }
}
