/**
 * Links each ingested node to the tokens written for the variables bound inside it, and counts what could not be
 * linked and why. A scan that does not sense bindings is "not-sensed", never "none".
 */
import type { DsFile, ScanComponent } from "./figma-ds-scan-read.js";
import type { TokenBuildResult } from "./figma-ds-tokens.js";

const TOKEN_PATH = /^[a-z][a-z0-9.-]*$/;

export interface BindingReport {
  /** Components whose scan entry carries `boundVariables`; the rest are `not-sensed`, never "none". */
  sensed: number;
  notSensed: number;
  linked: number;
  excluded: { collections: { name: string; count: number }[]; notWritten: number; outsideScan: number; unsafePath: number };
}

/** Links each node to the tokens written for the variables bound inside it, and counts what could not be linked. */
export function bindingLinks(nodes: ScanComponent[], ds: DsFile, tokens: TokenBuildResult, kept: ReadonlySet<string>): { links: Map<string, string[]>; report: BindingReport } {
  const links = new Map<string, string[]>();
  const report: BindingReport = { sensed: 0, notSensed: 0, linked: 0, excluded: { collections: [], notWritten: 0, outsideScan: 0, unsafePath: 0 } };
  const collectionOf = new Map(ds.tokens.map((v) => [v.id, v.collection ?? ""]));
  const perCollection = new Map<string, number>();
  const sensing = ds.sensing?.status !== "skipped";
  for (const n of nodes) {
    if (!sensing || n.boundVariables === undefined) { report.notSensed++; continue; }
    report.sensed++;
    const paths = new Set<string>();
    for (const id of n.boundVariables) {
      const written = tokens.pathById.get(id);
      const collection = collectionOf.get(id);
      if (written !== undefined) { if (TOKEN_PATH.test(written)) { paths.add(written); report.linked++; } else report.excluded.unsafePath++; }
      else if (collection === undefined) report.excluded.outsideScan++;
      else if (!kept.has(collection)) perCollection.set(collection, (perCollection.get(collection) ?? 0) + 1);
      else report.excluded.notWritten++;
    }
    links.set(n.id, [...paths].sort());
  }
  report.excluded.collections = [...perCollection].map(([name, count]) => ({ name, count }));
  return { links, report };
}

