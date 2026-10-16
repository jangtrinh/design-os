/**
 * DS Guidelines Pack — assemble the Figma bundle from a checked canonical pack (pure, no fs).
 *
 *   - components.md keeps only the look-alike names (with their answers) and the component rulings:
 *     Figma's agent reads the component inventory from the library itself (D13). The canonical
 *     pack is untouched.
 *   - rulings of the component categories move from rulings.md into components.md (never repeated).
 *   - apps/*.md merge into apps.md, one `## <app> (<n>)` heading each.
 *   - The "How to read this pack" note is dropped; the overview's file index is rewritten to match.
 *   - Only files the manifest lists are used: stale files in the pack folder are ignored.
 */
import { trimToBudget, renderBFile, byteLength, isEmptied } from "./ds-guidelines-budget.js";
import type { BFile, BSection, TrimEntry } from "./ds-guidelines-budget.js";
import { fixedSection, listSection, splitSections, wholeSection } from "./ds-guidelines-figma-sections.js";
import type { RawSection } from "./ds-guidelines-figma-sections.js";

/** Ruling categories that guide component use; their rulings live in the bundle's components.md. */
export const COMPONENT_RULING_CATEGORIES: readonly string[] = ["component-reuse", "tables", "forms-inputs"];

export interface PackText {
  path: string;
  text: string;
}

export interface BundleFile {
  path: string;
  content: string;
  bytes: number;
}

export interface FigmaBundle {
  files: BundleFile[];
  trimmed: TrimEntry[];
  /** Undefined when no budget was asked for. */
  budgetReached?: boolean;
}

const DESCRIPTIONS: Readonly<Record<string, string>> = {
  "vocabulary.md": "colour roles mapped to this project's own token names, forbidden colour pairs, scales",
  "components.md": "look-alike component names and component rulings",
  "rulings.md": "owner rulings that bind the whole library",
  "apps.md": "owner rulings that bind one app only",
  "terminology.md": "canonical terms with definitions and the synonyms to avoid",
  "grammar.md": "measured house style: DO/DON'T lines with counts",
  "anti-patterns.md": "scenarios (Do/Don't/Why) and measured gaps with the knowledge that answers them",
};

const sectionsOf = (files: ReadonlyMap<string, string>, path: string): RawSection[] => splitSections(files.get(path) ?? "");
const fixedFile = (path: string, raws: RawSection[]): BFile => ({ path, kind: "fixed", sections: raws.map((r) => fixedSection(r)) });
const statements = (body: readonly string[]): number => body.filter((l) => /\*\*(DO|DON'T)\b/.test(l)).length;

/** Rewrite the `- Files:` index of the overview so it lists exactly the bundle's files. */
function reindexOverview(file: BFile, otherPaths: readonly string[]): void {
  const pre = file.sections[0]?.pre;
  if (pre === undefined) return;
  const start = pre.findIndex((l) => l === "- Files:");
  if (start < 0) return;
  let end = start + 1;
  while (end < pre.length && (pre[end] ?? "").startsWith("  - ")) end++;
  const index = [...otherPaths].sort().map((p) => `  - ${p} — ${DESCRIPTIONS[p] ?? "guideline file"}`);
  pre.splice(start + 1, end - start - 1, ...index);
}

function buildOverview(files: ReadonlyMap<string, string>): BFile | undefined {
  if (!files.has("overview.md")) return undefined;
  const sections: BSection[] = [];
  for (const raw of sectionsOf(files, "overview.md")) {
    if (raw.heading === "## How to read this pack") continue;
    sections.push(raw.heading === "## Design stance" ? wholeSection(raw, "overview:stance", 1) : fixedSection(raw));
  }
  return { path: "overview.md", kind: "overview", sections };
}

function buildApps(files: ReadonlyMap<string, string>): BFile | undefined {
  const sections: BSection[] = [{
    heading: null, trimmable: false, units: [],
    pre: ["# Apps", "", "Owner rulings that bind a single app. One heading per app, with its number of rulings."],
  }];
  for (const path of [...files.keys()].filter((p) => p.startsWith("apps/")).sort()) {
    const raws = sectionsOf(files, path);
    const app = /^# Rulings — (.+)$/m.exec(raws[0]?.body.join("\n") ?? "")?.[1] ?? path.slice(5, -3);
    for (const raw of raws.slice(1)) {
      sections.push({ ...listSection(raw, raw.heading?.replace(/^## /, "### ") ?? null), parent: app });
    }
  }
  return sections.length > 1 ? { path: "apps.md", kind: "apps", sections } : undefined;
}

export function buildFigmaBundle(packFiles: readonly PackText[], budgetBytes?: number): FigmaBundle {
  const files = new Map(packFiles.map((f) => [f.path, f.text]));
  const bundle: BFile[] = [];
  const add = (f: BFile | undefined): void => { if (f !== undefined) bundle.push(f); };

  // rulings.md: component categories move to components.md; the rest stays trimmable.
  const moved: RawSection[] = [];
  const rulingSections: BSection[] = [];
  for (const raw of sectionsOf(files, "rulings.md")) {
    const category = raw.heading?.replace(/^## /, "");
    if (category !== undefined && COMPONENT_RULING_CATEGORIES.includes(category)) moved.push(raw);
    else rulingSections.push(raw.heading === null ? fixedSection(raw) : listSection(raw));
  }
  if (rulingSections.some((s) => s.trimmable)) add({ path: "rulings.md", kind: "rulings", sections: rulingSections });

  // components.md: look-alike names (with answers) + the component rulings; no inventory.
  const confusables = sectionsOf(files, "components.md").filter((r) => r.blockIds.includes("components.confusables"));
  if (confusables.length > 0 || moved.length > 0) {
    const sections: BSection[] = [{
      heading: null, trimmable: false, units: [],
      pre: ["# Components", "", "Components live in the library itself. This file keeps what the library cannot show: look-alike names and component rulings."],
    }, ...confusables.map((r) => fixedSection(r))];
    if (moved.length > 0) {
      sections.push({ heading: "## Component rulings", pre: [], units: [], trimmable: false });
      for (const raw of moved) sections.push(fixedSection(raw, raw.heading?.replace(/^## /, "### ") ?? null));
    }
    add({ path: "components.md", kind: "fixed", sections });
  }

  add(buildApps(files));
  if (files.has("terminology.md")) add({ path: "terminology.md", kind: "terminology", sections: sectionsOf(files, "terminology.md").map((r) => listSection(r)) });
  if (files.has("grammar.md")) {
    add({
      path: "grammar.md", kind: "grammar",
      sections: sectionsOf(files, "grammar.md").map((r) => (r.heading === null ? fixedSection(r) : wholeSection(r, `grammar:${r.heading.slice(3)}`, statements(r.body)))),
    });
  }
  for (const path of ["vocabulary.md", "anti-patterns.md"]) if (files.has(path)) add(fixedFile(path, sectionsOf(files, path)));
  const overview = buildOverview(files);

  const all = overview !== undefined ? [overview, ...bundle] : bundle;
  const trim = budgetBytes !== undefined ? trimToBudget(all, budgetBytes) : undefined;
  const kept = all.filter((f) => !isEmptied(f));
  if (overview !== undefined) reindexOverview(overview, kept.filter((f) => f !== overview).map((f) => f.path));
  const out = kept.map((f) => { const content = renderBFile(f); return { path: f.path, content, bytes: byteLength(content) }; })
    .sort((a, b) => a.path.localeCompare(b.path));
  return { files: out, trimmed: trim?.trimmed ?? [], ...(trim !== undefined ? { budgetReached: trim.reached } : {}) };
}
