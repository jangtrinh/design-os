/**
 * DS Guidelines Pack — `terminology.md` from CONTEXT.md + ontology/glossary.yaml (pure, no fs).
 *
 * CONTEXT.md wins when a term is in both; every disagreement is recorded in the manifest.
 * A glossary the flat reader cannot read is skipped with its line and cause, never half-read; the build goes on.
 */
import { mergeTerminology, parseContextTerms } from "./ds-guidelines-glossary-reader.js";
import type { GlossaryTerm, TermConflict } from "./ds-guidelines-glossary-reader.js";
import { formatGlossaryRefusal, parseGlossaryYaml } from "./ds-guidelines-glossary-yaml-reader.js";
import { blockPart, slug, textPart, uniqueId } from "./ds-guidelines-model.js";
import type { GuidelineFile, OptionalInput, RuleEntry, SkippedSource } from "./ds-guidelines-model.js";

export interface Terminology {
  terms: GlossaryTerm[];
  conflicts: TermConflict[];
  skipped: SkippedSource[];
  /** Entries each source contributed to the merged glossary. */
  fromContext: number;
  fromGlossary: number;
}

/** Read both glossary sources (either may be absent or unreadable-as-flat). Shared by build and check. */
export function loadTerminology(context: OptionalInput, glossary: OptionalInput): Terminology {
  const skipped: SkippedSource[] = [];
  let contextTerms: GlossaryTerm[] = [];
  let glossaryTerms: GlossaryTerm[] = [];

  if (context.text === undefined) {
    skipped.push({ path: context.path, reason: "file not found — product glossary terms omitted" });
  } else {
    contextTerms = parseContextTerms(context.text, context.path);
    if (contextTerms.length === 0) skipped.push({ path: context.path, reason: "no '**Term**:' entries found in the Language section" });
  }
  if (glossary.text === undefined) {
    skipped.push({ path: glossary.path, reason: "file not found — ontology terms omitted" });
  } else {
    const parsed = parseGlossaryYaml(glossary.text, glossary.path);
    if (parsed.ok) glossaryTerms = parsed.terms;
    else skipped.push({ path: glossary.path, reason: `${formatGlossaryRefusal(parsed)} — glossary skipped` });
  }

  const { terms, conflicts } = mergeTerminology(contextTerms, glossaryTerms);
  return {
    terms, conflicts, skipped,
    fromContext: terms.filter((t) => t.source === context.path).length,
    fromGlossary: terms.filter((t) => t.source === glossary.path).length,
  };
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

/** `- \`term:Road\` — definition · vi: … · _Avoid_: a, b` (parts that do not exist are left out). */
function termLine(t: GlossaryTerm): string {
  const parts = [
    t.def !== "" ? ` — ${oneLine(t.def)}` : "",
    t.vi !== undefined ? ` · vi: ${oneLine(t.vi)}` : "",
    t.avoid.length > 0 ? ` · _Avoid_: ${t.avoid.join(", ")}` : "",
  ];
  return `- \`term:${t.term}\`${parts.join("")}`;
}

/** The terminology file, or null when no source yielded a term. */
export function buildTerminologyFile(terminology: Terminology): GuidelineFile | null {
  if (terminology.terms.length === 0) return null;
  const used = new Set<string>();
  const rules: RuleEntry[] = terminology.terms.map((t) => ({
    id: uniqueId(`terminology.${slug(t.term) || "term"}`, used),
    text: termLine(t),
    sources: [{ path: t.source, term: t.term }],
  }));
  return {
    path: "terminology.md",
    parts: [
      textPart("# Terminology", "", "Use these terms exactly. A word listed as avoided is a rejected synonym: say the canonical term instead."),
      blockPart("terminology.terms", rules.map((r) => r.text), rules),
    ],
  };
}

/** Lowercased avoided word → the canonical term(s) to use instead. Words that are themselves canonical are never avoided. */
export function avoidedWords(terms: readonly GlossaryTerm[]): Map<string, string[]> {
  const canonical = new Set(terms.map((t) => t.term.toLowerCase()));
  const out = new Map<string, string[]>();
  for (const t of terms) {
    for (const word of t.avoid) {
      const key = word.toLowerCase();
      if (canonical.has(key)) continue;
      out.set(key, [...new Set([...(out.get(key) ?? []), t.term])].sort());
    }
  }
  return out;
}
