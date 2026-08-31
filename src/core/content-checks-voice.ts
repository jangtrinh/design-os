/**
 * Voice tells: the four LLM-prose habits `content-lint` never covered.
 *
 * `content-lint` owns lorem, placeholders, punctuation — copy that is WRONG.
 * These four are copy that is *generated*: the buzzword stack, the em-dash
 * habit, the "not X, but Y" cadence, the theatrical intensifier. All advisory,
 * because a buzzword is a smell and not a defect.
 *
 * They read only the `text` fact, so they work on Swift and Dart too — the
 * prototype fired marketing-buzzword on both before any of this existed.
 *
 * Phrase lists are deliberately conservative. A false positive on legitimate
 * technical prose is what makes a writer stop reading the output, and every list
 * here is short enough to read in one pass and argue with.
 */
import type { DesignFact } from "./design-facts/index.js";
import type { FloorFindingBase } from "./finding-schema.js";
import { thr } from "./tell-thresholds.js";

export type VoiceFinding = FloorFindingBase;

/** Generic SaaS filler. Each one says nothing a specific verb would not say better. */
const BUZZWORDS = [
  "world-class", "enterprise-grade", "next-generation", "cutting-edge", "best-in-class",
  "supercharge", "streamline", "empower", "unlock the power", "game-changing",
  "seamlessly", "revolutionize", "state-of-the-art", "industry-leading", "robust solution",
];

/** Theatrical intensifiers that promise a feeling instead of describing a thing. */
const THEATER = [
  "breathtaking", "stunning", "jaw-dropping", "mind-blowing", "unparalleled",
  "effortlessly beautiful", "simply magical", "absolutely gorgeous",
];

/** "Not just X — it's Y", the shape a model reaches for when it has no claim. */
const APHORISM = /\bnot\s+(?:just|only|merely)\s+[^.—-]{3,60}[—-]\s*(?:it['’]s|but|it is)\b/i;

const wordsOf = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * All PROSE text facts joined into one document view, keeping the first line of each.
 *
 * Head metadata is excluded: a `<title>` is document chrome, never copy the reader
 * reads, and one real page's `<title>` held a 9,334-character generation prompt whose
 * em dash was counted against its visible word budget. The fact still exists and the
 * census still counts it — these checks simply do not judge it as writing.
 *
 * This moves a RATE's denominator, so it was measured rather than assumed. Across 747
 * real pages it took em-dash-overuse from 75 findings to 74: two pages went silent
 * because their only dashes were IN the title (nobody reads those), and one page
 * crossed the line — `examples/diagrams/it-state.html`, 8 dashes in 317 visible words
 * = 2.50, where the old denominator's 321 words put it at 2.49. That page is a true
 * positive at the corrected rate; the old number was masking it with words no reader
 * sees. Every other page kept its verdict and only shifted in the third digit.
 */
function textRuns(facts: readonly DesignFact[]): Array<{ content: string; line: number }> {
  return facts
    .filter((f): f is Extract<DesignFact, { kind: "text" }> => f.kind === "text")
    .filter((f) => f.role !== "metadata")
    .map((f) => ({ content: f.content, line: f.at.line }));
}

function finding(checkId: string, message: string, line: number, actual: string, fixHint: string): VoiceFinding {
  return { checkId, severity: "advisory", message, line, actual, fixHint };
}

export function checkMarketingBuzzword(facts: readonly DesignFact[]): VoiceFinding[] {
  const out: VoiceFinding[] = [];
  for (const run of textRuns(facts)) {
    const hits = BUZZWORDS.filter((w) => run.content.toLowerCase().includes(w));
    if (hits.length === 0) continue;
    out.push(
      finding(
        "marketing-buzzword",
        `${hits.length} generic SaaS phrase(s): ${hits.map((h) => `"${h}"`).join(", ")} — say what the product literally does`,
        run.line,
        hits.join(", "),
        "replace each with the specific verb and noun it is standing in for",
      ),
    );
  }
  return out;
}

/**
 * Em-dash OVERUSE, measured as a rate, not a count.
 *
 * One em dash is punctuation. A page averaging one every twenty words has a
 * habit, and it is the single most reliable prose tell there is. Counting raw
 * occurrences would flag a long, well-written page and miss a short saturated one.
 */
export function checkEmDashOveruse(facts: readonly DesignFact[]): VoiceFinding[] {
  // Every prose run, heading and body alike — a deliberate NON-change, recorded
  // because the obvious alternative was tried and measured.
  //
  // Restricting the rate to role "body" (the theory: a dash in a kicker like
  // "Color — paired roles" is a separator, not cadence) was measured across 747
  // real pages. It silenced 8 findings and CREATED 1: a page whose five kickers
  // are `<div>` rather than `<h2>` crossed the threshold once heading words left
  // the denominator. Identical content, opposite verdict, decided by which tag the
  // author happened to reach for. That is a tag lottery, not a rule about prose,
  // so the cut was rejected and the rate still spans all visible copy.
  const runs = textRuns(facts);
  const words = runs.reduce((n, r) => n + wordsOf(r.content), 0);
  const dashes = runs.reduce((n, r) => n + (r.content.match(/—/g) ?? []).length, 0);
  if (words < thr("EM_DASH_MIN_WORDS") || dashes < thr("EM_DASH_MIN_COUNT")) return [];
  const perHundred = (dashes / words) * 100;
  if (perHundred < thr("EM_DASH_MAX_RATE")) return [];
  return [
    finding(
      "em-dash-overuse",
      `${dashes} em dashes in ${words} words (${perHundred.toFixed(1)} per 100) — a rate, not a choice`,
      runs[0]?.line ?? 1,
      `${perHundred.toFixed(1)} per 100 words`,
      "keep the dashes that earn the pause; make the rest commas or full stops",
    ),
  ];
}

export function checkTheaterSlopPhrase(facts: readonly DesignFact[]): VoiceFinding[] {
  const out: VoiceFinding[] = [];
  for (const run of textRuns(facts)) {
    const hits = THEATER.filter((w) => run.content.toLowerCase().includes(w));
    if (hits.length === 0) continue;
    out.push(
      finding(
        "theater-slop-phrase",
        `theatrical intensifier(s): ${hits.map((h) => `"${h}"`).join(", ")} — promises a feeling instead of describing the thing`,
        run.line,
        hits.join(", "),
        "describe what it does; let the reader decide how to feel about it",
      ),
    );
  }
  return out;
}

export function checkAphoristicCadence(facts: readonly DesignFact[]): VoiceFinding[] {
  const out: VoiceFinding[] = [];
  for (const run of textRuns(facts)) {
    const m = APHORISM.exec(run.content);
    if (m === null) continue;
    out.push(
      finding(
        "aphoristic-cadence",
        `"not just … it's …" construction — the shape reached for when there is no claim to make`,
        run.line,
        m[0].slice(0, 60),
        "state the claim directly, or cut the sentence",
      ),
    );
  }
  return out;
}

/** All four, in a stable order. */
export const VOICE_CHECKS = [
  checkMarketingBuzzword,
  checkEmDashOveruse,
  checkTheaterSlopPhrase,
  checkAphoristicCadence,
] as const;

export function checkVoice(facts: readonly DesignFact[]): VoiceFinding[] {
  const out: VoiceFinding[] = [];
  for (const check of VOICE_CHECKS) out.push(...check(facts));
  return out.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || a.checkId.localeCompare(b.checkId));
}
