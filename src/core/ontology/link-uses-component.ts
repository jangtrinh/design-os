/**
 * `uses-component` (screen -> component), from the exact source of each door and by identity only.
 *
 * Figma: the frame's `instances[].component` (a node id or a key) against the scan's components, closed over the nested
 * components of `components[].instances`. The sealed registry records a Figma component under the name the ingest
 * derived from the node (`storedName`), not under its node id; that derived name is the only identity the record
 * holds, so a scan component is tied to a record only when its derived name equals the record's name AND no other scan
 * component derives the same name. A renamed or duplicated one ties to nothing and its references are unresolved.
 * The name is derived by the ingest's own `storedName`, with the flag the ingest passes for a node the owner kept as
 * deprecated. Only a record with no provenance (the ingest writes none) takes part: a record registered from code never
 * ties to a scan component by name (`component-source-match` is the question that links the doors), and the references
 * that match only such a record are counted apart. Limits: a component the owner renamed through the duplicate-names
 * ruling does not tie (counted); a new component that reuses a retired name ties to the old record until the ingest
 * records a Figma identity.
 *
 * Code: the page file's import against the record's code reference. The surface names a component by file and the lines
 * of its declaration; that reference (`file:start-end`) is exactly what registration writes as the record's code source.
 * A name two components share is not resolved by name: it is counted unresolved.
 */
import { storedName } from "../figma-ds-registry.js";
import type { ScanComponent } from "../figma-ds-scan-read.js";
import type { ComponentRecord } from "../registry-store.js";
import { nodeId } from "./node-ids.js";
import type { CodeFacts } from "./source-screens-code.js";
import type { FigmaFacts } from "./source-screens-figma.js";
import type { LinkReport, OntLink } from "./ontology-types.js";
import { byText } from "./ontology-types.js";

/** A record the Figma ingest wrote: it writes no provenance. A record with one (another door wrote it) never ties to a scan component by name. */
const figmaRecord = (r: ComponentRecord): boolean => r.provenance === undefined;
/** The name the ingest stored for a node: its own function, with the flag it passes for a node the owner kept as deprecated. */
const derivedName = (c: ScanComponent, keptDeprecated: ReadonlySet<string>): string => storedName(c, keptDeprecated.has(c.id));

/** Registry record name -> the one scan component the ingest derived that name from; ambiguous or renamed ones are absent. */
export function scanEntries(components: readonly ScanComponent[], records: readonly ComponentRecord[], keptDeprecated: ReadonlySet<string>): Map<string, ScanComponent> {
  const recordNames = new Set(records.filter(figmaRecord).map((r) => r.name));
  const derived = new Map<string, ScanComponent[]>();
  for (const c of components) { const name = derivedName(c, keptDeprecated); derived.set(name, [...(derived.get(name) ?? []), c]); }
  const out = new Map<string, ScanComponent>();
  for (const [name, list] of derived) if (list.length === 1 && recordNames.has(name)) out.set(name, list[0] as ScanComponent);
  return out;
}

/** Scan component id and key -> the registry record name the ingest wrote for it; only unambiguous ties. */
export function figmaIdentity(components: readonly ScanComponent[], records: readonly ComponentRecord[], keptDeprecated: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [name, c] of scanEntries(components, records, keptDeprecated)) { out.set(c.id, name); if (c.key !== undefined) out.set(c.key, name); }
  return out;
}

const empty = (): LinkReport => ({ link: "uses-component", written: 0, unresolved: 0, notSensed: 0, details: [] });

function figmaLinks(facts: FigmaFacts, records: readonly ComponentRecord[], keptDeprecated: ReadonlySet<string>, report: LinkReport, out: OntLink[]): void {
  const identity = figmaIdentity(facts.scan.components, records, keptDeprecated);
  const codeOnly = new Set(records.filter((r) => !figmaRecord(r)).map((r) => r.name));
  const byRef = new Map<string, ScanComponent>();
  for (const c of facts.scan.components) { byRef.set(c.id, c); if (c.key !== undefined) byRef.set(c.key, c); }
  let lookupFailed = 0;
  const lost = new Set<string>();
  const lostToCode = new Set<string>();
  let toCode = 0;
  for (const frame of facts.frames) {
    lookupFailed += frame.unresolvedInstances ?? 0;
    const seen = new Set<string>();
    const queue = frame.instances.map((i) => i.component);
    while (queue.length > 0) {
      const ref = queue.shift() as string;
      if (seen.has(ref)) continue;
      seen.add(ref);
      for (const nested of byRef.get(ref)?.instances ?? []) queue.push(nested.component);
      const name = identity.get(ref);
      if (name !== undefined) out.push({ kind: "uses-component", from: nodeId("screen", frame.id), to: nodeId("component", name) });
      else {
        report.unresolved++;
        const scanned = byRef.get(ref);
        if (scanned !== undefined && codeOnly.has(derivedName(scanned, keptDeprecated)) && !records.some((r) => figmaRecord(r) && r.name === derivedName(scanned, keptDeprecated))) { toCode++; lostToCode.add(scanned.name); }
        else lost.add(`${scanned?.name ?? ref}`);
      }
    }
  }
  report.unresolved += lookupFailed;
  if (lookupFailed > 0) report.details.push(`${lookupFailed} instance(s) the host could not resolve to a component`);
  if (toCode > 0) report.details.push(`${toCode} reference(s) match only a record another door wrote (registered from code, or any provenance the Figma ingest does not write), which is never tied to a Figma component by name: ${[...lostToCode].sort(byText).slice(0, 5).join(", ")}${lostToCode.size > 5 ? ", ..." : ""}`);
  if (lost.size > 0) report.details.push(`${report.unresolved - lookupFailed - toCode} reference(s) match no registry record: ${[...lost].sort(byText).slice(0, 5).join(", ")}${lost.size > 5 ? ", ..." : ""}`);
}

function codeLinks(facts: CodeFacts, records: readonly ComponentRecord[], report: LinkReport, out: OntLink[]): void {
  const recordOfRef = new Map<string, string>();
  for (const r of records) for (const ref of [r.provenance?.kind === "code" ? r.provenance.sourceRef : undefined, r.code?.sourceRef]) if (ref !== undefined) recordOfRef.set(ref, r.name);
  const byName = new Map<string, typeof facts.components>();
  for (const c of facts.components) byName.set(c.name, [...(byName.get(c.name) ?? []), c]);
  const lost = new Set<string>();
  for (const screen of facts.screens) {
    for (const name of screen.components) {
      const found = byName.get(name) ?? [];
      const record = found.length === 1 ? recordOfRef.get(`${found[0]?.file}:${found[0]?.startLine}-${found[0]?.endLine}`) : undefined;
      if (record !== undefined) out.push({ kind: "uses-component", from: nodeId("screen", screen.file), to: nodeId("component", record) });
      else { report.unresolved++; lost.add(found.length > 1 ? `${name} (declared in ${found.length} files)` : name); }
    }
  }
  if (lost.size > 0) report.details.push(`${lost.size} imported component(s) tie to no registry record: ${[...lost].sort(byText).slice(0, 5).join(", ")}${lost.size > 5 ? ", ..." : ""}`);
}

export function usesComponentLinks(figma: FigmaFacts | null, code: CodeFacts | null, records: readonly ComponentRecord[], keptDeprecated: ReadonlySet<string>, notSensedReason: string | undefined): { links: OntLink[]; report: LinkReport } {
  const links: OntLink[] = [];
  const report = empty();
  if (figma !== null) figmaLinks(figma, records, keptDeprecated, report, links);
  if (code !== null) codeLinks(code, records, report, links);
  if (figma === null && notSensedReason !== undefined) report.notSensedReason = notSensedReason;
  return { links, report };
}
