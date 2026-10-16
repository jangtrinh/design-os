/**
 * DS Guidelines Pack — `rulings.md` (tier A) and `apps/<app>.md` (tier B) (pure, no fs).
 *
 * Tier C (process) and superseded rulings are never emitted; both are COUNTED in the
 * manifest with a pointer to the source file, so nothing vanishes silently.
 */
import { blockPart, slug, textPart, uniqueId } from "./ds-guidelines-model.js";
import type { FilePart, GuidelineFile, OptionalInput, RuleEntry, SkippedSource } from "./ds-guidelines-model.js";
import { classifyRuling, parseRulings } from "./ds-guidelines-rulings-reader.js";
import type { Ruling } from "./ds-guidelines-rulings-reader.js";

export interface RulingsStats {
  /** Every ruling read; total = tierA + tierAOther + tierB + tierC + superseded. */
  total: number;
  tierA: number;
  /** Global rulings outside the design categories (kept under "Other library-wide rulings"). */
  tierAOther: number;
  tierB: number;
  tierC: number;
  superseded: number;
  /** All rulings read, by category (sums to total). */
  byCategory: Record<string, number>;
  /** Where the excluded (tier C / superseded) rulings can still be read. */
  excludedSource: string;
}

export interface RulingsSections {
  files: GuidelineFile[];
  /** Rulings that reached the pack (tiers A, other library-wide, B), each once. */
  emitted: Ruling[];
  skipped: SkippedSource[];
  stats?: RulingsStats;
}

const byId = (a: Ruling, b: Ruling): number => a.id.localeCompare(b.id, "en", { numeric: true });
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/** `- **<id>** — <text> (since <date>; source: <first source>)` — the parenthesis only holds what exists. */
function rulingLine(r: Ruling): string {
  const meta = [r.since !== undefined ? `since ${r.since}` : "", r.source[0] !== undefined ? `source: ${oneLine(r.source[0])}` : ""].filter(Boolean);
  return `- **${r.id}** — ${oneLine(r.text)}${meta.length > 0 ? ` (${meta.join("; ")})` : ""}`;
}

function ruleOf(r: Ruling, rulingsPath: string, prefix: string, usedRuleIds: Set<string>): RuleEntry {
  return { id: uniqueId(`${prefix}.${slug(r.id) || "ruling"}`, usedRuleIds), text: rulingLine(r), sources: [{ path: rulingsPath, ruling: r.id }] };
}

/** One block per category, headed by it. `prefix` keeps rule ids unique across files. */
function categoryParts(rulings: readonly Ruling[], rulingsPath: string, prefix: string, usedRuleIds: Set<string>): FilePart[] {
  const byCategory = new Map<string, Ruling[]>();
  for (const r of rulings) byCategory.set(r.category, [...(byCategory.get(r.category) ?? []), r]);
  const parts: FilePart[] = [];
  const usedBlockIds = new Set<string>();
  for (const category of [...byCategory.keys()].sort((a, b) => a.localeCompare(b))) {
    const rules = (byCategory.get(category) ?? []).sort(byId).map((r) => ruleOf(r, rulingsPath, prefix, usedRuleIds));
    parts.push(textPart(`## ${category}`));
    parts.push(blockPart(uniqueId(`rulings.${slug(category) || "general"}`, usedBlockIds), rules.map((x) => x.text), rules));
  }
  return parts;
}

export function buildRulingsSections(input: OptionalInput): RulingsSections {
  if (input.text === undefined) {
    return { files: [], emitted: [], skipped: [{ path: input.path, reason: "file not found — rulings.md and apps/ omitted" }] };
  }
  const rulings = parseRulings(input.text, input.path);
  const tiers = { A: [] as Ruling[], AOther: [] as Ruling[], B: [] as Ruling[], C: [] as Ruling[], superseded: [] as Ruling[] };
  for (const r of rulings) tiers[classifyRuling(r)].push(r);

  const usedRuleIds = new Set<string>();
  const files: GuidelineFile[] = [];
  if (tiers.A.length + tiers.AOther.length > 0) {
    const other = [...tiers.AOther].sort(byId).map((r) => ruleOf(r, input.path, "rulings", usedRuleIds));
    files.push({
      path: "rulings.md",
      parts: [
        textPart("# Rulings", "", "Owner rulings that bind the whole library. Each one is a decision: follow it, do not re-litigate it."),
        ...categoryParts(tiers.A, input.path, "rulings", usedRuleIds),
        ...(other.length > 0
          ? [textPart("## Other library-wide rulings"), blockPart("rulings.other", other.map((x) => x.text), other)]
          : []),
      ],
    });
  }

  // A ruling scoped to several apps is repeated in each app's file (by design, not a duplicate).
  const byApp = new Map<string, { names: Set<string>; rulings: Ruling[] }>();
  for (const r of tiers.B) {
    if (r.scope === "global") continue;
    for (const app of r.scope.apps) {
      const key = slug(app) || "app";
      const entry = byApp.get(key) ?? { names: new Set<string>(), rulings: [] };
      entry.names.add(app);
      if (!entry.rulings.includes(r)) entry.rulings.push(r);
      byApp.set(key, entry);
    }
  }
  for (const key of [...byApp.keys()].sort()) {
    const entry = byApp.get(key);
    if (entry === undefined) continue;
    files.push({
      path: `apps/${key}.md`,
      parts: [
        textPart(`# Rulings — ${[...entry.names].sort().join(" / ")}`, "", "Owner rulings that bind this app only."),
        ...categoryParts(entry.rulings, input.path, `apps.${key}`, usedRuleIds),
      ],
    });
  }

  const byCategory: Record<string, number> = {};
  for (const r of rulings) byCategory[r.category] = (byCategory[r.category] ?? 0) + 1;
  return {
    files,
    emitted: [...tiers.A, ...tiers.AOther, ...tiers.B],
    skipped: [],
    stats: {
      total: rulings.length, tierA: tiers.A.length, tierAOther: tiers.AOther.length, tierB: tiers.B.length, tierC: tiers.C.length,
      superseded: tiers.superseded.length, byCategory, excludedSource: input.path,
    },
  };
}
