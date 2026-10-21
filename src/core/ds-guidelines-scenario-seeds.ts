/**
 * DS Guidelines Pack — `anti-patterns.md`: scenario slots + measured gaps (pure, no fs).
 *
 * Slots are seeded deterministically from evidence, and their ids come from that evidence — never
 * from a counter, a line number or the order things arrive in — so a rebuild keeps each answer
 * attached to the right slot:
 * and are ALWAYS `<kind>-<short readable prefix>-<hash of the full raw evidence>`:
 *   ruling text with never / always / do not   → ap-ruling-<ruling id>-<hash of the raw id>
 *   CONVENTIONS.md DON'T line                  → ap-conv-<section>-<hash of the raw heading line + the DON'T line>
 *   persona anti-pattern from the manifest     → ap-persona-<text start>-<hash of the whole text>
 *   a measured gap that needs a decision       → ap-<gap id>
 * Identical evidence gives the same id, which is ONE slot listing every place the evidence came from.
 * (Confusable component names are seeded by components.md.) The host fills a slot with
 * **Do:** / **Don't:** / **Why:** lines; the binary never writes an answer.
 */
import { blockPart, compareNumeric, hashedSlug, textPart } from "./ds-guidelines-model.js";
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

/**
 * DON'T bullets and labels of CONVENTIONS.md: the section, the label, the evidence the id is hashed
 * from (the raw heading line + the DON'T line) and the 1-based line.
 *
 * es-debt: the DON'T line is hashed with its digits, `%` and `*` removed and whitespace collapsed. The
 * counts in a measured line are rescanned data that change on every `synthesize-conventions` run; hashing
 * them would orphan an answer each time. Two lines that differ only in their numbers, in one section,
 * are the same question. Upgrade trigger: a convention whose meaning lives in a number.
 */
function conventionDonts(text: string): { section: string; label: string; evidence: string; line: number }[] {
  const out: { section: string; label: string; evidence: string; line: number }[] = [];
  let section = "";
  let heading = "";
  text.split(/\r?\n/).forEach((raw, idx) => {
    const h = /^##\s+(.+?)\s*$/.exec(raw);
    if (h !== null) { section = h[1] ?? ""; heading = raw.trimEnd(); return; }
    const bullet = /^- \*\*DON'T\*\*\s*[—-]\s*(.*)$/.exec(raw);
    const label = /^\*\*DON'T\s*[—-]\s*(.*?):?\*\*:?\s*$/.exec(raw);
    const body = bullet?.[1] ?? label?.[1];
    if (body === undefined || section === "") return;
    out.push({
      section, label: oneLine(body.split(":")[0] ?? body), line: idx + 1,
      evidence: `${heading}\u0000${raw.replace(/[0-9%*]/g, "").replace(/\s+/g, " ").trim()}`,
    });
  });
  return out;
}

export function seedScenarios(opts: {
  rulings: readonly Ruling[];
  conventions: OptionalInput;
  persona: { slug: string; antiPatterns?: readonly string[] };
  gaps: readonly Gap[];
}): Scenario[] {
  const out: Scenario[] = [];
  // One slot per id: identical evidence is not asked twice, it just lists every place it came from.
  const add = (s: Scenario): void => {
    const same = out.find((o) => o.id === s.id);
    if (same === undefined) out.push(s);
    else for (const e of s.evidence) if (!same.evidence.includes(e)) same.evidence.push(e);
  };

  for (const r of [...opts.rulings].sort((a, b) => compareNumeric(a.id, b.id))) {
    if (!NORMATIVE.test(r.text)) continue;
    add({
      id: `ap-ruling-${hashedSlug(r.id, "ruling")}`,
      title: `Ruling ${r.id} — ${clip(oneLine(r.category))}`,
      prompt: "When does this ruling apply, and what should designers do instead?",
      evidence: [r.id],
    });
  }
  if (opts.conventions.text !== undefined) {
    for (const d of conventionDonts(opts.conventions.text)) {
      add({
        id: `ap-conv-${hashedSlug(d.section, "section", d.evidence)}`,
        title: `Convention (${d.section}): ${clip(d.label)}`,
        prompt: "What causes this measured deviation, and what should designers do instead?",
        evidence: [`${opts.conventions.path}:L${d.line}`],
      });
    }
  }
  for (const text of opts.persona.antiPatterns ?? []) {
    add({
      id: `ap-persona-${hashedSlug(text, "pattern")}`,
      title: `Persona anti-pattern: ${clip(oneLine(text))}`,
      prompt: "What does this anti-pattern look like in this product, and what replaces it?",
      evidence: [`persona:${opts.persona.slug}`],
    });
  }
  for (const g of opts.gaps) {
    if (g.scenario === undefined) continue;
    add({ id: `ap-${g.id}`, title: g.scenario.title, prompt: g.scenario.prompt, evidence: [g.id] });
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
