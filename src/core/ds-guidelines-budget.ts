/**
 * DS Guidelines Pack — Figma bundle model, rendering and budget trimming (pure, no fs).
 *
 * A bundle file is a list of sections; trimmable sections hold UNITS (a ruling, a term, a whole
 * grammar section, the stance summary). With `--budget` units are dropped in a fixed priority —
 * grammar → terminology → overview → apps (largest app first, oldest ruling first) → rulings
 * (oldest first); anti-patterns, vocabulary and components are never trimmed — and every drop
 * is reported with its id. Without a budget nothing is ever dropped.
 */

export interface Unit {
  /** What the trim report shows: a ruling id, `term:<name>`, `grammar:<heading>`, `overview:stance`. */
  id: string;
  lines: string[];
  /** Rules this unit stands for (a grammar section holds several DO/DON'T statements). */
  weight: number;
  /** `YYYY-MM-DD` the ruling was recorded; empty when unknown (treated as oldest). */
  since: string;
}

export interface BSection {
  heading: string | null;
  /** App name for apps.md: rendered once as `## <app> (<n>)` above its category sections. */
  parent?: string;
  /** Lines kept verbatim above the units. */
  pre: string[];
  units: Unit[];
  /** A trimmable section with no units left disappears (heading included). */
  trimmable: boolean;
}

export type TrimKind = "grammar" | "terminology" | "overview" | "apps" | "rulings" | "fixed";

export interface BFile {
  path: string;
  kind: TrimKind;
  sections: BSection[];
}

export interface TrimEntry {
  file: string;
  rulesDropped: number;
  bytesSaved: number;
  ids: string[];
}

export const byteLength = (text: string): number => Buffer.byteLength(text, "utf8");

const parentCount = (f: BFile, parent: string): number =>
  f.sections.filter((s) => s.parent === parent).reduce((n, s) => n + s.units.length, 0);

export function renderBFile(f: BFile): string {
  const chunks: string[] = [];
  let lastParent: string | undefined;
  for (const s of f.sections) {
    if (s.trimmable && s.units.length === 0) continue;
    if (s.parent !== undefined && s.parent !== lastParent) {
      chunks.push(`## ${s.parent} (${parentCount(f, s.parent)})`);
      lastParent = s.parent;
    }
    if (s.heading !== null) chunks.push(s.heading);
    if (s.pre.length > 0) chunks.push(s.pre.join("\n"));
    if (s.units.length > 0) chunks.push(s.units.map((u) => u.lines.join("\n")).join(f.kind === "grammar" ? "\n\n" : "\n"));
  }
  return chunks.join("\n\n") + "\n";
}

/** A file whose trimmable sections were all emptied has nothing left worth uploading. */
export function isEmptied(f: BFile): boolean {
  const trimmable = f.sections.filter((s) => s.trimmable);
  return f.kind !== "overview" && f.kind !== "fixed" && trimmable.length > 0 && trimmable.every((s) => s.units.length === 0);
}

const ORDER: readonly TrimKind[] = ["grammar", "terminology", "overview", "apps", "rulings"];

interface Pick { file: BFile; section: BSection; unit: Unit }

const unitBytes = (u: Unit): number => byteLength(u.lines.join("\n")) + 1;

/** The next unit to drop in the file's kind, per the priority rules above. */
function nextUnit(file: BFile): Pick | undefined {
  const all = file.sections.flatMap((section) => section.units.map((unit) => ({ file, section, unit })));
  if (all.length === 0) return undefined;
  const oldest = (picks: Pick[]): Pick | undefined =>
    picks.reduce<Pick | undefined>((best, p) => (best === undefined || p.unit.since < best.unit.since ? p : best), undefined);
  switch (file.kind) {
    case "grammar": case "terminology": return all[all.length - 1];
    case "overview": return all[0];
    case "rulings": return oldest(all);
    case "apps": {
      const size = new Map<string, number>();
      for (const p of all) size.set(p.section.parent ?? "", (size.get(p.section.parent ?? "") ?? 0) + unitBytes(p.unit));
      const largest = [...size.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
      return oldest(all.filter((p) => (p.section.parent ?? "") === largest));
    }
    default: return undefined;
  }
}

export interface TrimResult {
  trimmed: TrimEntry[];
  /** False when every droppable unit is gone and the bundle is still over the budget. */
  reached: boolean;
}

/** Drop units in priority order until the bundle fits `budgetBytes`; mutates `files`. */
export function trimToBudget(files: BFile[], budgetBytes: number): TrimResult {
  const sizes = new Map(files.map((f) => [f.path, byteLength(renderBFile(f))]));
  const total = (): number => [...sizes.values()].reduce((a, b) => a + b, 0);
  const report = new Map<string, TrimEntry>();
  while (total() > budgetBytes) {
    const pick = ORDER.flatMap((kind) => files.filter((f) => f.kind === kind).flatMap((f) => nextUnit(f) ?? []))[0];
    if (pick === undefined) break;
    const before = sizes.get(pick.file.path) ?? 0;
    pick.section.units.splice(pick.section.units.indexOf(pick.unit), 1);
    const after = byteLength(renderBFile(pick.file));
    sizes.set(pick.file.path, after);
    const entry = report.get(pick.file.path) ?? { file: pick.file.path, rulesDropped: 0, bytesSaved: 0, ids: [] };
    entry.rulesDropped += pick.unit.weight;
    entry.bytesSaved += before - after;
    entry.ids.push(pick.unit.id);
    report.set(pick.file.path, entry);
  }
  return { trimmed: [...report.values()].sort((a, b) => a.file.localeCompare(b.file)), reached: total() <= budgetBytes };
}
