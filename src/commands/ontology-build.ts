/**
 * `ui ontology build [--dir <project>] [--out design/knowledge/ontology.json] [--json]` (FR-022). Reads the sealed
 * stores and the other sources of the project, writes one knowledge graph with no invented node and no guessed link, and
 * raises the `inferred-links` question for each glossary term named like a node. An open question blocks the write: exit
 * 1, nothing written but the pending question list, and the summary of what would be written is still shown.
 */
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { blockOnOpenClusters } from "../core/owner-rulings/block-contract.js";
import { PendingStoreError } from "../core/owner-rulings/pending-store.js";
import { RulingStoreError } from "../core/owner-rulings/ruling-store.js";
import { coverageTable } from "../core/ontology/coverage.js";
import { serializeOntology } from "../core/ontology/emit-ontology.js";
import { graphErrors } from "../core/ontology/graph-errors.js";
import { ONTOLOGY_REL } from "../core/ontology/ontology-types.js";
import { blockedSummaryText, buildText } from "./ontology-render.js";
import { refusalText } from "./ontology-refusal.js";
import { fail, insideProject, isResult, prepare } from "./ontology-shared.js";

const CMD = "ontology build";
const KNOWN = ["dir", "out"] as const;

export function runOntologyBuild(parsed: ParsedArgs): CommandResult {
  const json = parsed.json;
  const ready = prepare(parsed, CMD, KNOWN);
  if (isResult(ready)) return ready;
  const { dir, built } = ready;
  const o = built.ontology;
  const bad = graphErrors(o.nodes, o.links);
  if (bad.length > 0) return fail(CMD, json, bad[0]!.code, refusalText(bad));
  const outRel = insideProject(CMD, json, dir, "out", typeof parsed.flags["out"] === "string" ? parsed.flags["out"] : ONTOLOGY_REL);
  if (typeof outRel !== "string") return outRel;
  const target = resolve(dir, outRel);

  let blocked: CommandResult | null;
  try { blocked = blockOnOpenClusters({ command: CMD, projectDir: dir, detections: built.detections, ownKinds: ["inferred-links"], runsProjectDetectors: true, json }); }
  catch (e) { if (e instanceof RulingStoreError || e instanceof PendingStoreError) return fail(CMD, json, e.code, e.message); throw e; }
  const facts = { nodes: o.nodes.length, links: o.links.length, coverage: coverageTable(o), sources: o.sources, linkReports: o.linkReports, proposals: o.proposals, uncovered: o.uncovered };
  if (blocked !== null) {
    if (!json) return { ...blocked, stderr: `${blocked.stderr ?? ""}${blockedSummaryText(o)}` };
    const env = JSON.parse(blocked.stdout ?? "{}") as { error?: unknown; data?: Record<string, unknown> };
    return { exitCode: 1, stdout: `${JSON.stringify({ ...env, data: { ...(env.data ?? {}), wouldWrite: facts } }, null, 2)}\n` };
  }

  try {
    mkdirSync(dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, serializeOntology(o), "utf8");
    renameSync(tmp, target);
  } catch (e) {
    return fail(CMD, json, "WRITE_ERROR", `cannot write '${outRel}': ${e instanceof Error ? e.message : String(e)}`);
  }
  return json ? okJson(CMD, { out: outRel, ...facts }) : { exitCode: 0, stdout: buildText(o, outRel) };
}

