/**
 * Reuse-plan rules — parsed plan + registry names + tokens in, findings and per-screen
 * numbers out. Pure and deterministic: no I/O, no clock, no model.
 *
 * A finding is a thing the plan got wrong or left unsaid; a screen that measures nothing
 * (no slots) or a plan with no screens is a finding too, never a quiet pass.
 */
import type { ParsedPlan, PlanRow, PlanScreen } from "./reuse-plan-parse.js";
import type { NameIndex } from "./reuse-plan-names.js";
import { didYouMean, splitComposition, splitTokenPaths, splitVariantUse, stripTicks } from "./reuse-plan-names.js";
import { tokenExistsInTree } from "./registry-token-check.js";
import type { TokenTree } from "./token-model.js";

export interface Finding { code: string; line: number; screen: string | null; slot: string | null; message: string }
export interface ScreenSummary { name: string; line: number; pattern: string | null; reuse: number; total: number; skipped: number }
export interface DsNewItem { name: string; reason: string; screen: string; slot: string; line: number }
export interface CheckResult { findings: Finding[]; screens: ScreenSummary[]; dsNew: DsNewItem[] }

export interface CheckContext {
  names: NameIndex;
  /** Lazy: only a plan with a rung-6 row ever reads the token file. A string = why it is unavailable. */
  tokens: () => TokenTree | string;
}

const DS_NEW_RE = /^ds-new\s*:\s*(.*)$/i;
const EMPTY_REASON_RE = /^[\s—–-]*$/;
const NONE_RE = /^none\b\s*(?:—|–|--|-|:)?\s*(.*)$/i;
const isEmptyReason = (s: string): boolean => EMPTY_REASON_RE.test(s);

export function checkReusePlan(plan: ParsedPlan, ctx: CheckContext): CheckResult {
  const findings: Finding[] = [];
  const dsNew: DsNewItem[] = [];
  const screens: ScreenSummary[] = [];

  for (const row of plan.strayRows) {
    findings.push({ code: "ROW_OUTSIDE_SCREEN", line: row.line, screen: null, slot: null,
      message: "slot row sits outside any '## Screen: <name>' section — it is not measured; move it under its screen" });
  }
  if (plan.screens.length === 0) {
    findings.push({ code: "EMPTY_PLAN", line: 1, screen: null, slot: null,
      message: "no '## Screen: <name>' section found — a reuse plan with no screens measures nothing" });
  }
  for (const screen of plan.screens) screens.push(checkScreen(screen, ctx, findings, dsNew));

  findings.sort((a, b) => a.line - b.line);
  return { findings, screens, dsNew };
}

function checkScreen(screen: PlanScreen, ctx: CheckContext, findings: Finding[], dsNew: DsNewItem[]): ScreenSummary {
  const push = (code: string, line: number, slot: string | null, message: string): void => {
    findings.push({ code, line, screen: screen.name, slot, message });
  };
  const pattern = checkPattern(screen, ctx, push);

  if (screen.rows.length === 0) {
    push("EMPTY_SCREEN", screen.line, null, "screen has no slot rows — nothing is planned, so nothing can be checked");
  }
  let reuse = 0;
  let skipped = 0;
  for (const row of screen.rows) {
    const before = findings.length;
    const rung = checkRow(row, screen, ctx, push, dsNew);
    if (rung === 1) skipped++;
    if (rung !== null && rung >= 2 && rung <= 6 && findings.length === before) reuse++;
  }
  return { name: screen.name, line: screen.line, pattern, reuse, total: screen.rows.length, skipped };
}

type Push = (code: string, line: number, slot: string | null, message: string) => void;

/** Validate the Pattern line; returns the registered template name, or null for `none`/invalid. */
function checkPattern(screen: PlanScreen, ctx: CheckContext, push: Push): string | null {
  const p = screen.pattern;
  if (p === null || p.value.length === 0) {
    push("MISSING_PATTERN", p?.line ?? screen.line, null,
      "no Pattern line — name the registry template this screen follows, or 'Pattern: none — <reason>'");
    return null;
  }
  const none = NONE_RE.exec(p.value);
  if (none !== null) {
    if (isEmptyReason(none[1] ?? "")) {
      push("PATTERN_NONE_NO_REASON", p.line, null, "'Pattern: none' needs a reason — write 'none — <why no registry template fits>'");
    }
    return null;
  }
  const whole = stripTicks(p.value);
  const name = ctx.names.has(whole) ? whole : stripTicks(p.value.split(/\s+(?:—|–|--)\s+/)[0] ?? "");
  if (!ctx.names.has(name)) {
    push("UNKNOWN_PATTERN", p.line, null, `Pattern '${name}' is not in the registry${didYouMean(ctx.names.suggest(name))}`);
    return null;
  }
  if (ctx.names.hasPatternNamespace && !name.startsWith("Pattern/")) {
    push("PATTERN_NOT_TEMPLATE", p.line, null,
      `'${name}' is registered but is not a Pattern/* template, and this registry declares Pattern/* templates — use one, or 'none — <reason>'`);
    return null;
  }
  return name;
}

/** Check one slot row; returns its rung when the row parsed into a valid 1-7 rung. */
function checkRow(row: PlanRow, screen: PlanScreen, ctx: CheckContext, push: Push, dsNew: DsNewItem[]): number | null {
  const slot = row.cells[0] ?? "";
  if (row.cells.length !== 4) {
    push("BAD_ROW", row.line, slot || null, `slot row has ${row.cells.length} cell(s), expected 4 (Slot | Rung | Use | Reason)`);
    return null;
  }
  const [, rungRaw = "", useRaw = "", reasonRaw = ""] = row.cells;
  const rungText = stripTicks(rungRaw);
  const rung = /^[1-7]$/.test(rungText) ? Number(rungText) : null;
  if (rung === null) {
    push("BAD_RUNG", row.line, slot, `rung '${rungText}' is not a ladder rung — use an integer 1-7`);
    return null;
  }
  const use = useRaw.trim();
  const flag = (code: string, message: string): void => push(code, row.line, slot, message);
  const newMatch = DS_NEW_RE.exec(use);

  if (rung === 1) {
    if (isEmptyReason(reasonRaw)) flag("SKIP_WITHOUT_REASON", "rung 1 (the UI need not exist) needs a reason — say why this slot is dropped");
    return rung;
  }
  if (rung === 7) {
    checkNew(newMatch, use, reasonRaw, ctx, flag, (name) => dsNew.push({ name, reason: reasonRaw.trim(), screen: screen.name, slot, line: row.line }));
    return rung;
  }
  if (newMatch !== null) {
    flag("NEW_AT_WRONG_RUNG", `'ds-new:' belongs at rung 7, not rung ${rung} — a new component is the last rung`);
    return rung;
  }
  if (use.length === 0) { flag("EMPTY_USE", `rung ${rung} needs a Use — name what is reused`); return rung; }

  const requireRegistered = (name: string): void => {
    if (!ctx.names.has(name)) flag("UNKNOWN_COMPONENT", `'${name}' is not in the registry (exact name required)${didYouMean(ctx.names.suggest(name))}`);
  };
  if (rung === 2 || rung === 3) requireRegistered(stripTicks(use));
  else if (rung === 4) {
    const v = splitVariantUse(use);
    if (v === null) flag("BAD_VARIANT", "rung 4 needs 'Name (Axis=Value)' — a variant or state of a registered component");
    else requireRegistered(v.name);
  } else if (rung === 5) {
    const members = splitComposition(use);
    if (members.length < 2 || members.some((m) => m.length === 0)) flag("BAD_COMPOSITION", "rung 5 needs two or more registered names joined by '+'");
    else members.forEach(requireRegistered);
  } else {
    checkTokens(use, ctx, flag);
  }
  return rung;
}

function checkNew(
  match: RegExpExecArray | null, use: string, reason: string, ctx: CheckContext,
  flag: (code: string, message: string) => void, record: (name: string) => void,
): void {
  if (match === null) {
    flag("NEW_MISSING_PREFIX", `rung 7 is a new component: write 'ds-new: ${stripTicks(use) || "<Name>"}' so it is listed for the owner`);
    return;
  }
  const name = stripTicks(match[1] ?? "");
  if (name.length === 0) { flag("NEW_WITHOUT_NAME", "'ds-new:' has no component name after it"); return; }
  const registered = ctx.names.has(name) ? name : ctx.names.normalisedMatch(name);
  if (registered !== undefined) {
    flag("NOT_NEW", `'${name}' is already registered${registered === name ? "" : ` as '${registered}'`} — it is rung 3, not a new component`);
    return;
  }
  if (isEmptyReason(reason)) { flag("NEW_WITHOUT_REASON", `new component '${name}' needs a reason — say why nothing in the registry fits`); return; }
  record(name);
}

function checkTokens(use: string, ctx: CheckContext, flag: (code: string, message: string) => void): void {
  const paths = splitTokenPaths(use);
  if (paths.length === 0) { flag("EMPTY_USE", "rung 6 needs token paths, e.g. 'spacing.4, colors.surface'"); return; }
  const tree = ctx.tokens();
  for (const path of paths) {
    if (typeof tree === "string") flag("UNRESOLVED_TOKEN", `token '${path}' cannot be checked — ${tree}`);
    else if (!tokenExistsInTree(tree, path)) flag("UNRESOLVED_TOKEN", `token '${path}' does not exist in the design system tokens`);
  }
}
