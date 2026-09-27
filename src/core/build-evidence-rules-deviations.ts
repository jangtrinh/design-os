/**
 * `ui evidence lint` rule r5 — deviations.md exists and every entry (a "- "
 * bullet, a "**D<n>" paragraph, or a table row) names a real measurement.
 * Also exports the deviations.md finder/reader shared with r4/r7, which cross-
 * reference its text (does it account for a gate failure / a fallback face).
 */
import { readFileSync } from "node:fs";
import { fail, pass, type RuleResult, type WalkedFile } from "./build-evidence-rules-shared.js";

/**
 * px / ms / pt / em / rem with a leading number, an N% (no \b after '%' — it
 * is a non-word char, so a boundary there never matches the following space),
 * or an N:1 ratio.
 */
const NUMBER_UNIT_RE = /\d+(?:[.,]\d+)*\s*%|\d+(?:[.,]\d+)*\s*(px|ms|pt|em|rem)\b|\d+(?:\.\d+)?\s*:\s*1\b/i;

export function findDeviationsFile(files: WalkedFile[]): WalkedFile | undefined {
  const matches = files.filter((f) => f.rel.toLowerCase().endsWith("deviations.md"));
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => a.rel.split("/").length - b.rel.split("/").length)[0];
}

/** deviations.md's raw text, or undefined when the folder has none. */
export function readDeviationsText(files: WalkedFile[]): string | undefined {
  const f = findDeviationsFile(files);
  return f ? readFileSync(f.abs, "utf8") : undefined;
}

function isTableSeparator(line: string): boolean {
  if (!/^\|.*\|$/.test(line)) return false;
  return line.split("|").slice(1, -1).every((cell) => /^\s*:?-+:?\s*$/.test(cell));
}

/**
 * Split deviations.md into individually-checkable entries: each "- " list
 * line is its own entry; a "**D<n>" paragraph is checked whole (its number is
 * often in the body, not the heading line); each non-header table row is its
 * own entry. Plain prose paragraphs (section intros, "## " headings) are not
 * entries — they carry no PASS/FAIL claim of their own.
 */
export function splitDeviationEntries(text: string): string[] {
  const entries: string[] = [];
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  for (const para of paragraphs) {
    if (/^\*\*D\d+/i.test(para)) {
      entries.push(para);
      continue;
    }
    // A heading ("## Shared deviations") often sits in the same blank-line
    // block as the bullets under it — pull out just the bullet/table lines,
    // rather than requiring the whole paragraph to be one or the other.
    const lines = para.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const bulletLines = lines.filter((l) => /^-\s+\S/.test(l));
    if (bulletLines.length > 0) {
      entries.push(...bulletLines);
      continue;
    }
    const pipeLines = lines.filter((l) => /^\|.*\|$/.test(l));
    if (pipeLines.length > 0) {
      let rows = pipeLines;
      if (rows.length >= 2 && isTableSeparator(rows[1] as string)) rows = rows.slice(2);
      else if (isTableSeparator(rows[0] as string)) rows = rows.slice(1);
      entries.push(...rows.filter((r) => !isTableSeparator(r)));
    }
  }
  return entries;
}

const truncate = (s: string, max = 90): string => (s.length > max ? s.slice(0, max - 1) + "…" : s);

export function ruleR5(files: WalkedFile[]): RuleResult {
  const id = "r5";
  const title = "deviations.md exists and every entry carries a measurement";
  const text = readDeviationsText(files);
  if (text === undefined) return fail(id, title, "deviations.md not found");
  const entries = splitDeviationEntries(text);
  if (entries.length === 0) return fail(id, title, "deviations.md has no bullet ('- '), '**D<n>' or table-row entries to check");
  const bad = entries.filter((e) => !NUMBER_UNIT_RE.test(e));
  return bad.length === 0
    ? pass(id, title, entries.map((e) => truncate(e, 60)))
    : fail(id, title, `entr${bad.length === 1 ? "y" : "ies"} without a number+unit/ratio (px, %, :1, ms): ${bad.map((e) => `"${truncate(e)}"`).join(" | ")}`);
}
