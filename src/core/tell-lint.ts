/**
 * `tell` — the generated-UI tell family.
 *
 * `taste` judges whether a rubric law was broken. `tell` judges whether a habit
 * was revealed: an involuntary, machine-detectable sign that a surface was made
 * without design judgment. Different question, so a different family and a
 * different default severity — most tells are advisory and never fail a build.
 *
 * Rules read DesignFacts only, so the same 36 judge HTML, JSX, Swift and Dart.
 * A rule whose required fact kinds an extractor cannot supply is reported
 * NOT-EVALUATED, never passed: that is what stops a polyglot linter from turning
 * "I could not see it" into "it is clean".
 *
 * PAIRED with knowledge/design-tells.md (the standard) and with
 * tests/tell-lint.test.ts, which re-derives the roster from these modules and
 * checks it against CHECK_CATALOG in both directions.
 */
import type { DesignFact } from "./design-facts/index.js";
import { partition, coverageMatrix } from "./design-facts/index.js";
import type { ExtractorProfile, RuleRequirement } from "./design-facts/index.js";
import { countBySeverity } from "./finding-schema.js";
import type { SeverityCounts } from "./finding-schema.js";
import { checkComputedContrast } from "./a11y-checks-contrast.js";
import type { ContrastFinding, ContrastResult } from "./a11y-checks-contrast.js";
import { checkVoice } from "./content-checks-voice.js";
import type { VoiceFinding } from "./content-checks-voice.js";
import { indexFacts } from "./tell-rules.js";
import type { TellRule, TellFinding } from "./tell-rules.js";
import { SURFACE_RULES } from "./tell-rules-surface.js";
import { LABEL_RULES } from "./tell-rules-labels.js";
import { COLOR_RULES } from "./tell-rules-color.js";
import { TYPE_RULES } from "./tell-rules-type.js";
import { MOTION_RULES } from "./tell-rules-motion.js";
import { RENDERED_RULES } from "./tell-rules-rendered.js";

/** The whole roster, in one place. Order is normalised on output. */
export const TELL_RULES: readonly TellRule[] = [
  ...SURFACE_RULES,
  ...LABEL_RULES,
  ...COLOR_RULES,
  ...TYPE_RULES,
  ...MOTION_RULES,
];

/** Requirement view of the roster, for the coverage matrix and the gate. */
export const TELL_REQUIREMENTS: readonly RuleRequirement[] = TELL_RULES.map((r) => ({
  id: r.id,
  needs: r.needs,
}));

export interface NotEvaluatedRule {
  id: string;
  reason: string;
}

export interface TellLintResult extends SeverityCounts {
  findings: TellFinding[];
  /** Contrast findings — a11y family, computed only at `resolved` confidence. */
  contrast: ContrastFinding[];
  /** Text nodes whose background could not be resolved: a PARTIAL evaluation. */
  contrastNotComputable: ContrastResult["notComputable"];
  /** Voice findings — content family, advisory, readable in any language. */
  voice: VoiceFinding[];
  /** Rules that could not run here, and why. Never silently absent. */
  notEvaluated: NotEvaluatedRule[];
}

/**
 * Run the family against one artifact's facts.
 *
 * `profile` is the extractor that produced them: it decides which rules can run
 * at all. Passing facts from one extractor with another's profile would report
 * rules as evaluated that never saw their inputs.
 */
export function lintTell(
  facts: readonly DesignFact[],
  profile: ExtractorProfile,
): TellLintResult {
  const { runnable, notEvaluated } = partition(TELL_REQUIREMENTS, profile);
  const runnableIds = new Set(runnable);
  const index = indexFacts(facts);

  const findings: TellFinding[] = [];
  for (const rule of TELL_RULES) {
    if (!runnableIds.has(rule.id)) continue;
    findings.push(...rule.run(index));
  }

  // One CSS rule matching N elements yields N identical facts. A rule that is
  // genuinely about the element keeps them apart by nodeRef; one that is about
  // the declaration collapses to a single finding. Printing the same sentence
  // eight times for one stylesheet line is how a linter earns being ignored.
  const seen = new Set<string>();
  const deduped = findings.filter((f) => {
    const key = `${f.checkId}\u0000${f.line ?? ""}\u0000${f.nodeRef ?? ""}\u0000${f.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Then COLLAPSE what is one decision reported many times.
  //
  // Dedupe removes literal duplicates; this removes the other shape. One CSS
  // declaration paints every element its selector matches, so a single authored
  // mistake arrives as N findings that differ only by locator. Measured on real
  // projects: 54 identical `cramped-padding` lines in one file, 210 identical
  // contrast lines in another. The author has ONE thing to change, so they get
  // one finding — with the count and an example node, so nothing is hidden.
  findings.length = 0;
  findings.push(...collapseRepeated(deduped));

  findings.sort(
    (a, b) =>
      (a.line ?? 0) - (b.line ?? 0) ||
      a.checkId.localeCompare(b.checkId) ||
      a.message.localeCompare(b.message),
  );

  // low-contrast is an a11y check and the voice tells are content checks: they
  // ride along here because this is where the facts are, but they keep their own
  // family so `ui gate` attributes them correctly.
  const contrastResult = checkComputedContrast(facts, profile.supplies.color);
  const voice = checkVoice(facts);

  const contrast = collapseRepeated(contrastResult.findings);
  const collapsedVoice = collapseRepeated(voice);

  return {
    findings,
    contrast,
    contrastNotComputable: contrastResult.notComputable,
    voice: collapsedVoice,
    ...countBySeverity([...findings, ...contrast, ...collapsedVoice]),
    notEvaluated: notEvaluated.map((n) => ({ id: n.id, reason: n.reason })),
  };
}

/**
 * Collapse findings that are one authored decision reported many times.
 *
 * Dedupe removes literal duplicates; this removes the other shape. One CSS
 * declaration paints every element its selector matches, so a single authored
 * mistake arrives as N findings differing only by locator. Measured on real
 * projects: 54 identical `cramped-padding` lines in one file, 210 identical
 * contrast lines in another.
 *
 * Keyed on (checkId, message) because the message carries the VALUE — the author
 * has one thing to change, so they get one finding, with the count and an
 * example node so nothing is hidden.
 *
 * Shared by all three families for the reason this repo learned the hard way: a
 * blind spot fixed where it surfaced comes back in the next consumer.
 */
export function collapseRepeated<T extends { checkId: string; message: string; nodeRef?: string; line?: number }>(
  findings: readonly T[],
): T[] {
  const byMessage = new Map<string, { finding: T; count: number }>();
  for (const f of findings) {
    const key = `${f.checkId}\u0000${f.message}`;
    const seen = byMessage.get(key);
    if (seen === undefined) byMessage.set(key, { finding: f, count: 1 });
    else seen.count++;
  }
  return [...byMessage.values()].map(({ finding: f, count }) =>
    count === 1
      ? f
      : ({ ...f, message: `${f.message} — ${count} elements, first at ${f.nodeRef ?? `line ${f.line}`}` } as T),
  );
}

/**
 * The rule x extractor matrix behind `ui tell-lint --coverage`.
 *
 * Includes the rendered rules, which run only against `rendered-cdp`. Listing
 * only the 36 fact rules would leave the other seven invisible — and a rule
 * nobody can see is a rule nobody notices has stopped running.
 */
export function tellCoverage(profiles: readonly ExtractorProfile[]) {
  const rendered: RuleRequirement[] = RENDERED_RULES.map((r) => ({
    id: r.id,
    needs: ["structure"],
    minConfidence: "rendered",
  }));
  return coverageMatrix([...TELL_REQUIREMENTS, ...rendered], profiles);
}
