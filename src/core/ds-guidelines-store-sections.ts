/**
 * DS Guidelines Pack — overview + vocabulary from the sealed store (pure, no fs).
 *
 * Vocabulary maps the baked colour ROLES to the project's OWN token names (never
 * renaming them), lists the declared pairs that fail AA, and lists every non-colour
 * scale. Optional inputs that are absent (no baked roles, no measurable pairs, no
 * components) are recorded as skipped sources — never an error.
 */
import { checkTokenContrast } from "./ds-a11y.js";
import { summarizeRoles } from "./ds-context-roles.js";
import { buildComponentsFile } from "./ds-guidelines-components.js";
import { blockPart, slug, textPart, uniqueId } from "./ds-guidelines-model.js";
import type {
  FilePart, GuidelineFile, RuleEntry, SkippedSource, StoreSections, StoreSourcePaths,
} from "./ds-guidelines-model.js";
import { tokenSpan } from "./ds-guidelines-render.js";
import type { DesignSystem } from "./design-system.js";
import type { ResolvedToken } from "./token-model.js";

const byNumericName = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

function displayValue(v: ResolvedToken["value"]): string {
  if (Array.isArray(v)) return v.join(", ");
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

function rolesParts(ds: DesignSystem, src: StoreSourcePaths, skipped: SkippedSource[]): FilePart[] {
  const summary = summarizeRoles(ds.tokens);
  if (summary === null) {
    skipped.push({
      path: src.tokens,
      reason: "no baked design-os.role annotations — colour roles omitted (run 'ui ds import' or 'ui ds set-role')",
    });
    return [];
  }
  const values = new Map(ds.resolved.map((t) => [t.path, displayValue(t.value)]));
  const rules: RuleEntry[] = summary.roles.map(({ role, paths }) => ({
    id: `vocabulary.role.${role}`,
    text: `- ${role} → ${paths.map(tokenSpan).join(", ")} (${paths.map((p) => values.get(p) ?? "?").join(", ")})`,
    sources: paths.map((token) => ({ path: src.tokens, token })),
  }));
  const lines = rules.map((r) => r.text);
  if (summary.gaps.length > 0) lines.push("", `Roles no token carries yet: ${summary.gaps.join(", ")}.`);
  return [
    textPart("## Colour roles", "", "Each role is played by the project's own token. Use the token, never a raw colour."),
    blockPart("vocabulary.roles", lines, rules),
  ];
}

function pairsParts(ds: DesignSystem, src: StoreSourcePaths, skipped: SkippedSource[]): FilePart[] {
  const result = checkTokenContrast(ds.resolved);
  if (!result.measured || result.mode === "inferred") {
    skipped.push({
      path: src.tokens,
      reason: result.measured
        ? "contrast pairs could only be guessed from token names — forbidden pairs omitted"
        : "no {role}/{role}-foreground token pairs to measure — forbidden pairs omitted",
    });
    return [];
  }
  const rules: RuleEntry[] = result.failures.map((p) => ({
    id: `vocabulary.pair.${slug(p.text)}.on.${slug(p.surface)}`,
    text: `- ${tokenSpan(p.text)} on ${tokenSpan(p.surface)} — ${p.ratio}:1 (needs 4.5:1)`,
    sources: [{ path: src.tokens, token: p.text }, { path: src.tokens, token: p.surface }],
  }));
  const head = textPart("## Forbidden colour pairs", "", "Measured on declared token pairs only, not on rendered screens.");
  if (rules.length === 0) return [head, textPart("No declared foreground/surface pair falls below AA.")];
  return [head, blockPart("vocabulary.pairs", rules.map((r) => r.text), rules)];
}

function scaleParts(ds: DesignSystem, src: StoreSourcePaths): FilePart[] {
  const byCategory = new Map<string, ResolvedToken[]>();
  for (const t of ds.resolved) {
    const category = t.path.split(".")[0] ?? t.path;
    byCategory.set(category, [...(byCategory.get(category) ?? []), t]);
  }
  const parts: FilePart[] = [];
  const usedIds = new Set<string>();
  const usedBlockIds = new Set<string>();
  for (const category of [...byCategory.keys()].sort(byNumericName)) {
    const tokens = (byCategory.get(category) ?? []).sort((a, b) => byNumericName(a.path, b.path));
    if (tokens.every((t) => t.type === "color")) continue;
    const types = [...new Set(tokens.map((t) => t.type))].sort().join(", ");
    const rules: RuleEntry[] = tokens.map((t) => ({
      id: uniqueId(`vocabulary.scale.${slug(t.path)}`, usedIds),
      text: `- ${tokenSpan(t.path)} → ${displayValue(t.value)}`,
      sources: [{ path: src.tokens, token: t.path }],
    }));
    if (parts.length === 0) parts.push(textPart("## Scales", "", "Pick values from these scales; do not invent in-between values."));
    parts.push(textPart(`### ${category} (${types})`));
    parts.push(blockPart(uniqueId(`vocabulary.scale.${slug(category)}`, usedBlockIds), rules.map((r) => r.text), rules));
  }
  return parts;
}

function buildVocabularyFile(ds: DesignSystem, src: StoreSourcePaths, skipped: SkippedSource[]): GuidelineFile {
  return {
    path: "vocabulary.md",
    parts: [textPart("# Vocabulary"), ...rolesParts(ds, src, skipped), ...pairsParts(ds, src, skipped), ...scaleParts(ds, src)],
  };
}

const FILE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "vocabulary.md": "colour roles mapped to this project's own token names, forbidden colour pairs, scales",
  "components.md": "registered components by category with variants and states, confusable names",
  "rulings.md": "owner rulings that bind the whole library",
  "terminology.md": "canonical terms with definitions and the synonyms to avoid",
  "grammar.md": "measured house style: DO/DON'T lines with counts",
};

function describeFile(path: string): string {
  return FILE_DESCRIPTIONS[path] ?? (path.startsWith("apps/") ? "owner rulings that bind one app only" : "guideline file");
}

/** `otherPaths` = every other pack file, so the index always matches what was actually written. */
export function buildOverviewFile(ds: DesignSystem, otherPaths: readonly string[], extraParts: readonly FilePart[] = []): GuidelineFile {
  const { name, generation, persona } = ds.manifest;
  return {
    path: "overview.md",
    parts: [
      textPart("# Design guidelines"),
      blockPart("overview.identity", [
        `- Design system: ${name} (generation ${generation})`,
        `- Persona: ${persona.slug} / ${persona.family}`,
        "- Files:",
        ...[...otherPaths].sort().map((p) => `  - ${p} — ${describeFile(p)}`),
      ]),
      ...extraParts,
      textPart("## How to read this pack"),
      blockPart("overview.how-to-read", [
        "Every name written in backticks with a token:, component: or term: prefix is a literal name in this design system.",
        "Use it exactly as written and never invent one; the linter rejects a name that does not exist.",
        "Text between the generated-block markers is a fact compiled from the design system: do not edit it, rebuild instead.",
        "A line starting with > QUESTION( is an open slot: answer it with Do, Don't and Why lines, in your own words, using only real names.",
      ]),
    ],
  };
}

/** The store-derived files (vocabulary, components). The overview is built last, by the pack. */
export function buildStoreSections(ds: DesignSystem, src: StoreSourcePaths): StoreSections {
  const skipped: SkippedSource[] = [];
  const vocabulary = buildVocabularyFile(ds, src, skipped);
  const components = buildComponentsFile(ds.registry.components, src.registry, skipped);
  return { files: [vocabulary, components], skipped };
}
