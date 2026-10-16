/**
 * DS Guidelines Pack — `components.md` from the sealed registry (pure, no fs).
 *
 * Per category: every component with its variants and states, written as explicit
 * `component:<name>` spans. Then the CONFUSABLE names — components a designer (or a
 * model) could mix up — each followed by a `QUESTION(<id>)` slot the host fills
 * with "which one when". The registry grouping/sorting reuses `buildDocsModel`.
 */
import { levenshtein } from "./flag-guard.js";
import { buildDocsModel } from "./ds-docs.js";
import type { DocComponent } from "./ds-docs.js";
import type { ComponentRecord } from "./registry-store.js";
import { blockPart, compareText, shortHash, slug, textPart, uniqueId } from "./ds-guidelines-model.js";
import type { FilePart, GuidelineFile, RuleEntry, SkippedSource } from "./ds-guidelines-model.js";
import { componentSpan } from "./ds-guidelines-render.js";

/** Two names this close (edit distance on the normalised form) read as the same thing. */
const NEAR_IDENTICAL_DISTANCE = 2;

/** Lowercase and drop the separators designers vary freely (`/ - _` and spaces). */
const normalise = (name: string): string => name.toLowerCase().replace(/[/\-_\s]+/g, "");

function splitName(name: string): { parent: string; leaf: string } {
  const segments = name.split("/");
  const leaf = normalise(segments.pop() ?? "");
  return { parent: normalise(segments.join("/")), leaf };
}

/** Why two distinct names may be confused, or null. */
function confusableReason(a: string, b: string): string | null {
  if (levenshtein(normalise(a), normalise(b)) <= NEAR_IDENTICAL_DISTANCE) return "near-identical names";
  const sa = splitName(a), sb = splitName(b);
  if (sa.leaf !== "" && sa.leaf === sb.leaf && sa.parent !== sb.parent) return `same leaf name '${sa.leaf}'`;
  return null;
}

export interface ConfusableCluster {
  /** Members, sorted by name. */
  names: string[];
  reasons: string[];
}

/** Connected groups of confusable names (union-find), ordered by their first member. */
export function findConfusableClusters(names: readonly string[]): ConfusableCluster[] {
  const sorted = [...new Set(names)].sort(compareText);
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] ?? i)));
  const reasons = new Map<number, Set<string>>();
  const pairReasons: [number, number, string][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const why = confusableReason(sorted[i] ?? "", sorted[j] ?? "");
      if (why === null) continue;
      parent[find(j)] = find(i);
      pairReasons.push([i, j, why]);
    }
  }
  for (const [i, , why] of pairReasons) {
    const root = find(i);
    reasons.set(root, (reasons.get(root) ?? new Set<string>()).add(why));
  }
  const groups = new Map<number, string[]>();
  sorted.forEach((n, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), n]));
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => ({ names: members, reasons: [...(reasons.get(root) ?? [])].sort() }))
    .sort((a, b) => compareText(a.names[0] ?? "", b.names[0] ?? ""));
}

const oneLine = (text: string): string => text.replace(/`/g, "'").replace(/\s+/g, " ").trim();

function componentRule(c: DocComponent, registryPath: string): RuleEntry {
  const variants = c.variants.length > 0 ? c.variants.join(", ") : "none";
  const states = c.states.length > 0 ? c.states.join(", ") : "none";
  const description = c.description !== undefined && oneLine(c.description) !== "" ? ` — ${oneLine(c.description)}` : "";
  return {
    id: `components.${slug(c.name)}`,
    text: `- ${componentSpan(c.name)} — variants: ${variants} · states: ${states}${description}`,
    sources: [{ path: registryPath, component: c.name }],
  };
}

export function buildComponentsFile(
  components: readonly ComponentRecord[],
  registryPath: string,
  skipped: SkippedSource[],
): GuidelineFile {
  const parts: FilePart[] = [textPart("# Components")];
  if (components.length === 0) {
    skipped.push({ path: registryPath, reason: "no components registered — components.md lists none" });
    parts.push(textPart("No components are registered in the design system yet."));
    return { path: "components.md", parts };
  }
  parts.push(textPart("Registered components by category. Use these names exactly; a component that is not listed does not exist."));

  const usedBlockIds = new Set<string>();
  const usedRuleIds = new Set<string>();
  // buildDocsModel orders with the machine's locale; re-sort in code-unit order so the pack is the same everywhere.
  const categories = [...buildDocsModel(components).categories]
    .sort((a, b) => compareText(a.name, b.name))
    .map((c) => ({ ...c, components: [...c.components].sort((a, b) => compareText(a.name, b.name)) }));
  for (const category of categories) {
    const rules = category.components.map((c) => {
      const rule = componentRule(c, registryPath);
      return { ...rule, id: uniqueId(rule.id, usedRuleIds) };
    });
    parts.push(textPart(`## ${category.name}`));
    parts.push(blockPart(uniqueId(`components.${slug(category.name)}`, usedBlockIds), rules.map((r) => r.text), rules));
  }

  const clusters = findConfusableClusters(components.map((c) => c.name));
  if (clusters.length > 0) {
    const usedSlotIds = new Set<string>();
    // The id covers the WHOLE member set: when the set changes the question changes, and the old answer is parked, not reused.
    const slotIds = clusters.map((cl) => uniqueId(`confusable.${slug(cl.names[0] ?? "")}-${shortHash(cl.names.join("\n"))}`, usedSlotIds));
    const rules: RuleEntry[] = clusters.map((cl, i) => ({
      id: `components.${slotIds[i]}`,
      text: `- ${cl.names.map(componentSpan).join(", ")} — look-alike names (${cl.reasons.join("; ")})`,
      sources: cl.names.map((n) => ({ path: registryPath, component: n })),
    }));
    parts.push(textPart("## Confusable names", "", "These names are easy to mix up. Answer each question with a clear recommendation, not a menu."));
    parts.push(blockPart("components.confusables", rules.map((r) => r.text), rules));
    const slots = clusters.map((cl, i) =>
      `> QUESTION(${slotIds[i]}): Which of ${cl.names.map(componentSpan).join(", ")} is used when?`);
    parts.push(textPart(...slots.flatMap((s, i) => (i === 0 ? [s] : ["", s]))));
  }
  return { path: "components.md", parts };
}
