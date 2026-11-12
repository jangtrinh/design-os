/**
 * The extractor of the agents walker: from a text the tool printed, every `ui ...` command the text tells the reader to
 * run, as the arguments after `ui`. A command is told after "Next:" or "Then:", after "run", after "with:" or
 * "regenerate it:", on an indented line of a "Ways out" list, or between backticks. The query command with its
 * placeholder is a template, not a command: it is recognised by the placeholder and skipped by name.
 */
import { shellWords } from "./ontology-query-helpers.js";

/** The placeholder the area block puts in the query command it describes. */
export const QUERY_PLACEHOLDER = "<your task>";

const CODE_SUFFIX = /\s*\([A-Z][A-Z_]+\)\s*$/;
const clean = (raw: string): string => (raw.split(/\.\s+(?=[A-Z])/)[0] as string).trim().replace(CODE_SUFFIX, "").replace(/[.;,]+$/, "").trim();

const PROSE = new Set(["again", "to", "then", "and", "so", "it", "for", "before", "after", "which", "when"]);
/** An unquoted "run ui ..." in a sentence: the words that look like a command, up to the first word of prose. */
function untilProse(text: string): string {
  const kept: string[] = [];
  for (const word of text.split(" ")) {
    if (PROSE.has(word)) break;
    kept.push(word);
    if (/[,;:]$/.test(word)) break;
  }
  return kept.join(" ");
}

/** The raw `ui ...` strings of one text, in reading order. */
function rawCommands(text: string): string[] {
  const found: string[] = [];
  let ways = false;
  for (const line of text.split("\n")) {
    if (/^\s*Ways out:\s*$/.test(line)) { ways = true; continue; }
    if (ways) { const m = /^\s+(ui \S.*)$/.exec(line); if (m !== null) { found.push(m[1] as string); continue; } ways = false; }
    for (const m of line.matchAll(/`(ui [^`]+)`/g)) found.push(m[1] as string);
    for (const m of line.matchAll(/(?:Next|Then):\s+(ui [^\n`]+)/g)) found.push(m[1] as string);
    for (const m of line.matchAll(/\b(?:with|regenerate it|regenerate them):\s+(ui [^\n`]+)/g)) found.push(m[1] as string);
    for (const m of line.matchAll(/\brun\s+'(ui [^']+)'/g)) found.push(m[1] as string);
    for (const m of line.matchAll(/\bhint:.*?'(ui [^']+)'/g)) found.push(m[1] as string);
    for (const m of line.matchAll(/\brun\s+(ui [^\n`']+)/g)) found.push(untilProse(m[1] as string));
  }
  return found;
}

/**
 * Commands the walker recognises and never runs: they write outside the temp project. `ui ds soul init --studio` writes
 * the studio soul under the home directory.
 */
const NEVER_RUN: readonly (readonly string[])[] = [["ds", "soul", "init"]];
const neverRun = (argv: readonly string[]): boolean => NEVER_RUN.some((n) => n.every((w, i) => argv[i] === w));

/** The commands a text names that the walker skips by name. */
export function skippedByName(text: string): string[][] {
  return rawCommands(text).map((raw) => shellWords(clean(raw)).slice(1)).filter(neverRun);
}

/** Every distinct command the text tells the reader to run, as argv after `ui`; templates and skipped-by-name commands are left out. */
export function extractCommands(text: string): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const raw of rawCommands(text)) {
    const line = clean(raw);
    if (line.includes(QUERY_PLACEHOLDER) || /<[a-z -]+>/.test(line)) continue;
    const argv = shellWords(line).slice(1);
    const key = argv.join("\u0000");
    if (argv.length === 0 || seen.has(key) || neverRun(argv)) continue;
    seen.add(key);
    out.push(argv);
  }
  return out;
}
