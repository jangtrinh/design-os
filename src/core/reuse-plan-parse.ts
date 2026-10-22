/**
 * Reuse-plan Markdown reader — text in, structure out, no judgment.
 *
 * A reuse plan is one `## Screen: <name>` section per screen: a `Pattern:` line and a
 * four-column table (Slot | Rung | Use | Reason). This module only locates those pieces
 * and their 1-based line numbers; every rule about what they MEAN lives in
 * reuse-plan-check.ts, so a parsing quirk can never masquerade as a design finding.
 *
 * Tolerated on purpose, because plans are written by a model and edited by people:
 * CRLF, a UTF-8 BOM, extra spaces and tabs, alignment colons, rows without outer pipes,
 * `\|` inside a cell, bold/underscored/bulleted `Pattern:` labels, and fenced code blocks
 * (skipped, so a plan can quote the format).
 */

export interface PlanRow {
  /** 1-based line in the file. */
  line: number;
  /** Trimmed cells, `\|` already unescaped. */
  cells: string[];
}

export interface PlanScreen {
  name: string;
  line: number;
  /** First `Pattern:` line of the screen; value is the text after the colon, trimmed. */
  pattern: { line: number; value: string } | null;
  rows: PlanRow[];
}

export interface ParsedPlan {
  screens: PlanScreen[];
  /** Slot rows found outside any Screen section. */
  strayRows: PlanRow[];
}

const FENCE_RE = /^\s*(```|~~~)/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const SCREEN_RE = /^Screen\s*:\s*(.*)$/i;
const PATTERN_RE = /^(?:[-*+]\s+)?(?:\*\*|__)?\s*Pattern\s*(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.*)$/i;
const SEPARATOR_CELL_RE = /^:?-+:?$/;

/** Split one table line into trimmed cells; `\|` is a literal pipe, outer pipes are optional. */
export function splitTableRow(line: string): string[] {
  const t = line.trim();
  const cells: string[] = [];
  let cur = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "\\" && t[i + 1] === "|") { cur += "|"; i++; }
    else if (ch === "|") { cells.push(cur); cur = ""; }
    else cur += ch;
  }
  cells.push(cur);
  if (t.startsWith("|")) cells.shift();
  if (t.endsWith("|") && !t.endsWith("\\|")) cells.pop();
  return cells.map((c) => c.trim());
}

/** A table-looking line: starts with a pipe, or has at least two unescaped pipes. */
function looksLikeRow(line: string): boolean {
  const t = line.trim();
  if (t.startsWith("|")) return true;
  return (t.replace(/\\\|/g, "").match(/\|/g) ?? []).length >= 2;
}

const isSeparator = (cells: string[]): boolean => cells.length > 0 && cells.every((c) => SEPARATOR_CELL_RE.test(c));
const isHeader = (cells: string[]): boolean => cells.length >= 2 && cells[1]?.toLowerCase() === "rung";

export function parseReusePlan(text: string): ParsedPlan {
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/);
  const screens: PlanScreen[] = [];
  const strayRows: PlanRow[] = [];
  let current: PlanScreen | null = null;
  let currentLevel = 0;
  let fenced = false;

  lines.forEach((raw, idx) => {
    const line = idx + 1;
    if (FENCE_RE.test(raw)) { fenced = !fenced; return; }
    if (fenced) return;

    const heading = HEADING_RE.exec(raw);
    if (heading !== null) {
      const level = (heading[1] ?? "").length;
      const screenMatch = SCREEN_RE.exec(heading[2] ?? "");
      if (screenMatch !== null) {
        current = { name: (screenMatch[1] ?? "").trim(), line, pattern: null, rows: [] };
        currentLevel = level;
        screens.push(current);
      } else if (current !== null && level <= currentLevel) {
        current = null;
      }
      return;
    }

    const pattern = raw.trim().startsWith("|") ? null : PATTERN_RE.exec(raw.trim());
    if (pattern !== null) {
      if (current !== null && current.pattern === null) {
        current.pattern = { line, value: (pattern[1] ?? "").replace(/(\*\*|__)\s*$/, "").trim() };
      }
      return;
    }

    if (looksLikeRow(raw)) {
      const cells = splitTableRow(raw);
      if (isSeparator(cells) || isHeader(cells)) return;
      (current === null ? strayRows : current.rows).push({ line, cells });
    }
  });

  return { screens, strayRows };
}
