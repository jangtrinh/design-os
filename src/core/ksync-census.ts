/**
 * ksync census — how much of the route manifest is built, and how much of what is
 * built is pinned to a Figma frame. Pure.
 *
 * The labels (built | placeholder | orphan | parked) are READ, never inferred. A manifest
 * entry gets one from (in order): an explicit `parked` marker, its own `status`, then a
 * labels file. An entry with none is counted as `unlabeled` — unless the caller states
 * `assumeUnlisted`, in which case the count says so. The kernel cannot see the code, so
 * it cannot tell built from placeholder on its own.
 */
import type { KsyncPin } from "./ksync-pins.js";

export const STATUSES = ["built", "placeholder", "orphan", "parked"] as const;
export type Status = (typeof STATUSES)[number];
export type Label = Status | "unlabeled";

export interface ManifestEntry {
  app: string;
  routeId: string;
  kind: string;
  figmaId: string | null;
  key: string | null;
  parentRouteId: string | null;
  status: Status | null;
  parked: boolean;
}

export interface LabelRow { routeId: string; kind: string; variant: string | null; status: Status }

export type Counts = Record<Label, number>;
const zero = (): Counts => ({ built: 0, placeholder: 0, orphan: 0, parked: 0, unlabeled: 0 });
const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUSES as readonly string[]).includes(v);
const rec = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const s = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export function readManifest(doc: unknown): ManifestEntry[] {
  const d = rec(doc);
  const list = Array.isArray(doc) ? doc : d !== null && Array.isArray(d["entries"]) ? d["entries"] : d !== null && Array.isArray(d["routes"]) ? d["routes"] : null;
  if (list === null) throw new Error("manifest needs an 'entries' array (route-manifest.json) or to be an array of entries");
  return list.flatMap((raw: unknown): ManifestEntry[] => {
    const e = rec(raw);
    const routeId = e === null ? null : s(e["routeId"]);
    if (e === null || routeId === null) return [];
    return [{
      app: s(e["app"]) ?? routeId.split("/")[0] ?? "?", routeId, kind: s(e["kind"]) ?? "route", figmaId: s(e["figmaId"]), key: s(e["key"]),
      parentRouteId: s(e["parentRouteId"]), status: isStatus(e["status"]) ? e["status"] : null, parked: rec(e["parked"]) !== null || e["parked"] === true,
    }];
  });
}

/** Accepts an array of rows, {entries|rows: [...]}, or a census file's unbuiltInManifest.entries. */
export function readLabels(doc: unknown): LabelRow[] {
  const d = rec(doc);
  const list = Array.isArray(doc) ? doc : d === null ? null
    : Array.isArray(d["rows"]) ? d["rows"] : Array.isArray(d["entries"]) ? d["entries"]
    : Array.isArray(rec(d["unbuiltInManifest"])?.["entries"]) ? (rec(d["unbuiltInManifest"])?.["entries"] as unknown[]) : null;
  if (list === null) throw new Error("labels file needs rows: an array, {rows|entries: [...]}, or {unbuiltInManifest: {entries: [...]}}");
  return list.flatMap((raw: unknown): LabelRow[] => {
    const r = rec(raw);
    const routeId = r === null ? null : s(r["routeId"]);
    if (r === null || routeId === null || !isStatus(r["status"])) return [];
    return [{ routeId, kind: s(r["kind"]) ?? "route", variant: s(r["variant"]) ?? s(r["id"]), status: r["status"] }];
  });
}

/** State/overlay id of a non-route entry: the part after '#' or after the last '?axis='. */
export function variantOf(e: ManifestEntry): string | null {
  if (e.kind === "route" || e.key === null) return null;
  const m = /[#?](?:[a-z]+=)?([^#?&=]+)$/.exec(e.key);
  return m?.[1] === undefined ? null : decodeURIComponent(m[1]);
}

const labelKey = (routeId: string, kind: string, variant: string | null): string => `${routeId}|${kind}|${variant ?? ""}`;

export interface CensusInput {
  entries: ManifestEntry[];
  pins: readonly KsyncPin[];
  labels?: LabelRow[];
  assumeUnlisted?: Status;
  registry?: { figmaNode?: unknown }[];
}

export interface AppRow extends Counts { app: string; entries: number; pinned: number; builtPinned: number }

export function computeCensus(input: CensusInput) {
  const byLabel = new Map((input.labels ?? []).map((l) => [labelKey(l.routeId, l.kind, l.variant), l.status] as const));
  const pinnedNodes = new Set(input.pins.map((p) => p.node));
  const total = zero();
  const apps = new Map<string, AppRow>();
  const matchedNodes = new Set<string>();
  let builtPinned = 0;
  let labelsUsed = 0;
  for (const e of input.entries) {
    let label: Label;
    if (e.parked) label = "parked";
    else if (e.status !== null) label = e.status;
    else {
      const hit = byLabel.get(labelKey(e.kind === "route" ? e.routeId : e.parentRouteId ?? e.routeId, e.kind, variantOf(e)));
      if (hit !== undefined) { label = hit; labelsUsed++; } else label = input.assumeUnlisted ?? "unlabeled";
    }
    const row = apps.get(e.app) ?? { app: e.app, entries: 0, pinned: 0, builtPinned: 0, ...zero() };
    apps.set(e.app, row);
    row.entries++; row[label]++; total[label]++;
    if (e.figmaId !== null && pinnedNodes.has(e.figmaId)) {
      matchedNodes.add(e.figmaId); row.pinned++;
      if (label === "built") { row.builtPinned++; builtPinned++; }
    }
  }
  const registry = input.registry === undefined ? null : (() => {
    const withNode = input.registry.filter((c) => typeof c.figmaNode === "string" && c.figmaNode !== "").length;
    return { total: input.registry.length, withFigmaNode: withNode, withoutFigmaNode: input.registry.length - withNode };
  })();
  const appRows = [...apps.values()].sort((a, b) => (a.app < b.app ? -1 : a.app > b.app ? 1 : 0));
  return {
    entries: input.entries.length,
    counts: total,
    labelsUsed,
    assumption: input.assumeUnlisted === undefined ? null : `entries without a label were counted as '${input.assumeUnlisted}' (--assume-unlisted)`,
    pins: { total: input.pins.length, matchedToManifest: matchedNodes.size, unmatched: input.pins.length - matchedNodes.size, appsWithPins: appRows.filter((a) => a.pinned > 0).length, appsTotal: appRows.length },
    builtPinned,
    pinnedOfBuiltPct: total.built === 0 ? null : Math.round((builtPinned / total.built) * 1000) / 10,
    perApp: appRows,
    registry,
  };
}
