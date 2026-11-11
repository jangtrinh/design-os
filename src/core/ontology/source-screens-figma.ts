/**
 * The Figma side of `screen` nodes: the frames of the pages the `screen-pages` ruling kept, read from the scan at
 * `design/ds.json` (sections included, as the scan lists them). The page question belongs to the ingest: when the scan
 * has frames on more than one page and a page is not ruled, the build does not ask it again, it reports the screens as
 * a missing source with the command that raises the question and writes no screen node.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DsIngestError, parseDsFile } from "../figma-ds-scan-read.js";
import type { DsFile, DsFrame } from "../figma-ds-scan-read.js";
import { governedOutcomes, indexRulings } from "../owner-rulings/resolve-detections.js";
import type { Ruling } from "../owner-rulings/ruling-store.js";
import { nodeId } from "./node-ids.js";
import { BAD_SOURCE, OntologyReadError, parseSourceJson } from "./read-error.js";
import type { OntNode, SourceReport } from "./ontology-types.js";

export const SCAN_REL = "design/ds.json";

export interface FigmaFacts {
  scan: DsFile;
  /** The frames on kept pages: one screen each. */
  frames: DsFrame[];
}
export interface ScreenRead { nodes: OntNode[]; figma: FigmaFacts | null; report: SourceReport; scan: DsFile | null }

const screenReport = (status: SourceReport["status"], nodes: number, note: string): SourceReport => ({ kind: "screen", status, nodes, note });

/** `scan` is read once here and shared: the component side needs it for its own not-sensed answer. */
export function readFigmaScreens(projectDir: string, rulings: readonly Ruling[]): ScreenRead {
  const path = join(projectDir, SCAN_REL);
  if (!existsSync(path)) return { nodes: [], figma: null, scan: null, report: screenReport("missing", 0, `no Figma scan at ${SCAN_REL}: figma-agent scan-design-system --out ${SCAN_REL}`) };
  let scan: DsFile;
  try { scan = parseDsFile(parseSourceJson(SCAN_REL, readFileSync(path, "utf8"))); }
  catch (e) {
    if (e instanceof DsIngestError) throw new OntologyReadError(BAD_SOURCE, `${SCAN_REL} is not a scan: ${e.message}`);
    throw e;
  }
  if (scan.frames === undefined) {
    const why = scan.sensing?.status === "skipped" ? `the host skipped sensing${scan.sensing.reason === undefined ? "" : ` (${scan.sensing.reason})`}` : "it carries no frames";
    return { nodes: [], figma: null, scan, report: screenReport("not-sensed", 0, `the scan was never sensed for frames: ${why}; re-scan with a host that writes frames`) };
  }
  const pages = [...new Set(scan.frames.map((f) => f.pageId))];
  const outcomes = governedOutcomes(indexRulings(rulings), "screen-pages");
  if (pages.length > 1) {
    const open = pages.filter((p) => outcomes[p] === undefined);
    if (open.length > 0) return { nodes: [], figma: null, scan, report: screenReport("missing", 0, `${open.length} of ${pages.length} pages with frames are not ruled as screen pages yet: ui ingest-figma-ds ${SCAN_REL} raises the question`) };
  }
  const kept = scan.frames.filter((f) => pages.length <= 1 || outcomes[f.pageId] !== "drop");
  const nodes = kept.map((f): OntNode => ({
    id: nodeId("screen", f.id), kind: "screen", name: f.name, door: "figma", page: f.pageName,
    ...(f.section === undefined ? {} : { section: f.section }),
  }));
  const left = scan.frames.length - kept.length;
  return { nodes, scan, figma: { scan, frames: kept }, report: screenReport("read", nodes.length, `${nodes.length} frame(s) on the pages kept as screen pages${left > 0 ? `; ${left} frame(s) on pages ruled out` : ""}`) };
}
