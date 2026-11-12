/**
 * The area of a node: the grouping the source already carries, written as a key that says where it comes from.
 *
 *   component tied to a scan component   page:<page name>   (page:<name> (<id>) when two pages share a name)
 *   component registered from code       dir:<category>     (the category of a code record is the directory of its file)
 *   token                                tokens:<first segment of its path>
 *   ruling that carries a category       rulings:<category>
 *
 * A node with no source for an area carries none and is counted under the reason: an area is never taken from a name.
 * `ui ontology query --area` and the agents' area block read this field and nothing else.
 */
import type { ScanComponent } from "../figma-ds-scan-read.js";
import type { ComponentRecord } from "../registry-store.js";
import { scanEntries } from "./link-uses-component.js";
import type { NodeSources } from "./node-sources.js";
import { byText } from "./ontology-types.js";
import type { OntNode } from "./ontology-types.js";

export const NOT_TIED = "not tied to a scan component";
export const NO_PAGE = "the scan carries no page";

/** Page key per scan page: the name alone, or the name with the page id when two different pages share the name. */
export function pageKeys(s: Pick<NodeSources, "scan">): Map<string, string> {
  const pages = new Map<string, string>();
  for (const x of [...(s.scan?.components ?? []), ...(s.scan?.frames ?? [])]) {
    const name = x.pageName;
    if (name === undefined || name === "") continue;
    pages.set(x.pageId ?? name, name);
  }
  const idsOfName = new Map<string, string[]>();
  for (const [id, name] of pages) idsOfName.set(name, [...(idsOfName.get(name) ?? []), id]);
  return new Map([...pages].map(([id, name]) => [id, (idsOfName.get(name) ?? []).length > 1 ? `page:${name} (${id})` : `page:${name}`]));
}

const fromCode = (r: ComponentRecord): boolean => r.provenance?.kind === "code" || r.code !== undefined;

function componentArea(r: ComponentRecord | undefined, tied: ScanComponent | undefined, keys: Map<string, string>): { area: string } | { gap: string } {
  if (tied !== undefined) {
    const key = tied.pageName === undefined || tied.pageName === "" ? undefined : keys.get(tied.pageId ?? tied.pageName);
    return key === undefined ? { gap: NO_PAGE } : { area: key };
  }
  if (r !== undefined && fromCode(r) && r.category !== "") return { area: `dir:${r.category}` };
  return { gap: NOT_TIED };
}

export interface Areaed { nodes: OntNode[]; withoutArea: Record<string, number> }

export function assignAreas(nodes: readonly OntNode[], s: NodeSources): Areaed {
  const keys = pageKeys(s);
  const tied = scanEntries(s.scan?.components ?? [], s.stores.records, s.keptDeprecated);
  const records = new Map(s.stores.records.map((r) => [r.name, r]));
  const gaps = new Map<string, number>();
  const out = nodes.map((n): OntNode => {
    if (n.kind === "token") return { ...n, area: `tokens:${n.name.split(".")[0] as string}` };
    if (n.kind === "ruling") return typeof n["category"] === "string" && n["category"] !== "" ? { ...n, area: `rulings:${n["category"]}` } : n;
    if (n.kind !== "component") return n;
    const got = componentArea(records.get(n.name), tied.get(n.name), keys);
    if ("gap" in got) { gaps.set(got.gap, (gaps.get(got.gap) ?? 0) + 1); return n; }
    return { ...n, area: got.area };
  });
  return { nodes: out, withoutArea: Object.fromEntries([...gaps].sort((a, b) => byText(a[0], b[0]))) };
}
