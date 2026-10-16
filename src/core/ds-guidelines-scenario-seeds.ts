/**
 * DS Guidelines Pack — `anti-patterns.md`: scenario slots + measured gaps (pure, no fs).
 *
 * Slots are seeded deterministically from evidence, and their ids come from that evidence
 * (never from a running counter) so a rebuild keeps each answer attached to the right slot:
 *   ruling text with never / always / do not   → ap-ruling-<ruling id>
 *   CONVENTIONS.md DON'T line                  → ap-conv-<section>-<n>   (cites CONVENTIONS.md:L<line>)
 *   persona anti-pattern from the manifest     → ap-persona-<text>
 *   a measured gap that needs a decision       → ap-<gap id>
 * (Confusable component names are seeded by components.md.) The host fills a slot with
 * **Do:** / **Don't:** / **Why:** lines; the binary never writes an answer.
 */
import { blockPart, slug, textPart, uniqueId } from "./ds-guidelines-model.js";
import type { FilePart, GuidelineFile, OptionalInput, RuleEntry } from "./ds-guidelines-model.js";
import type { Gap } from "./ds-guidelines-gap-knowledge.js";
import type { Ruling } from "./ds-guidelines-rulings-reader.js";

export interface Scenario {
  id: string;
  title: string;
  prompt: string;
  evidence: string[];
}

const NORMATIVE = /\b(never|always|do not)\b/i;
const TITLE_MAX = 80;
const oneLine = (t: string): string => t.replace(/[`*]/g, "").replace(/\s+/g, " ").trim();
const clip = (t: string): string => (t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1).trimEnd()}…` : t);

/** DON'T bullets and labels of CONVENTIONS.md, with the section they sit in and their 1-based line. */
function conventionDonts(text: string): { section: string; n: number; label: string; line: number }[] {
  const out: { section: string; n: number; label: string; line: number }[] = [];
  let section = "";
  const count = new Map<string, number>();
  text.split(/\r?\n/).forEach((raw, idx) => {
    const h = /^##\s+(.+?)\s*$/.exec(raw);
    if (h !== null) { section = h[1] ?? ""; return; }
    const bullet = /^- \*\*DON'T\*\*\s*[—-]\s*(.*)$/.exec(raw);
    const label = /^\*\*DON'T\s*[—-]\s*(.*?):?\*\*:?\s*$/.exec(raw);
    const body = bullet?.[1] ?? label?.[1];
    if (body === undefined || section === "") return;
    const n = (count.get(section) ?? 0) + 1;
    count.set(section, n);
    out.push({ section, n, label: oneLine(body.split(":")[0] ?? body), line: idx + 1 });
  });
  return out;
}

export function seedScenarios(opts: {
  rulings: readonly Ruling[];
  conventions: OptionalInput;
  persona: { slug: string; antiPatterns?: readonly string[] };
  gaps: readonly Gap[];
}): Scenario[] {
  const used = new Set<string>();
  const out: Scenario[] = [];

  for (const r of [...opts.rulings].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))) {
    if (!NORMATIVE.test(r.text)) continue;
    out.push({
      id: uniqueId(`ap-ruling-${slug(r.id) || "ruling"}`, used),
      title: `Ruling ${r.id} — ${clip(oneLine(r.category))}`,
      prompt: "When does this ruling apply, and what should designers do instead?",
      evidence: [r.id],
    });
  }
  if (opts.conventions.text !== undefined) {
    for (const d of conventionDonts(opts.conventions.text)) {
      out.push({
        id: uniqueId(`ap-conv-${slug(d.section) || "section"}-${d.n}`, used),
        title: `Convention (${d.section}): ${clip(d.label)}`,
        prompt: "What causes this measured deviation, and what should designers do instead?",
        evidence: [`${opts.conventions.path}:L${d.line}`],
      });
    }
  }
  for (const text of opts.persona.antiPatterns ?? []) {
    out.push({
      id: uniqueId(`ap-persona-${slug(text).slice(0, 48) || "pattern"}`, used),
      title: `Persona anti-pattern: ${clip(oneLine(text))}`,
      prompt: "What does this anti-pattern look like in this product, and what replaces it?",
      evidence: [`persona:${opts.persona.slug}`],
    });
  }
  for (const g of opts.gaps) {
    if (g.scenario === undefined) continue;
    out.push({ id: uniqueId(`ap-${g.id}`, used), title: g.scenario.title, prompt: g.scenario.prompt, evidence: [g.id] });
  }
  return out;
}

/** The anti-patterns file, or null when there is neither a scenario nor a gap to show. */
export function buildAntiPatternsFile(scenarios: readonly Scenario[], gaps: readonly Gap[]): GuidelineFile | null {
  if (scenarios.length === 0 && gaps.length === 0) return null;
  const parts: FilePart[] = [
    textPart("# Anti-patterns", "", "Scenarios are answered in your own words with **Do:**, **Don't:** and **Why:** lines under each question. Use only names that exist."),
  ];
  if (scenarios.length > 0) {
    parts.push(textPart("## Scenarios"));
    for (const s of scenarios) {
      parts.push(textPart(`### ${s.title}`, `> QUESTION(${s.id}): ${s.prompt} — evidence: ${s.evidence.join(", ")}`));
    }
  }
  if (gaps.length > 0) {
    const rules: RuleEntry[] = gaps.map((g) => ({ id: g.id, text: `- **${g.id}** — ${g.line}`, sources: g.sources }));
    parts.push(textPart("## Measured gaps", "", "Each gap was measured in this design system. Knowledge is cited only as the answer to one."));
    parts.push(blockPart("anti-patterns.gaps", rules.map((r) => r.text), rules));
  }
  return { path: "anti-patterns.md", parts };
}
