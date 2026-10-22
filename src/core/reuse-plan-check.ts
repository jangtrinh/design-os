/**
 * Reuse-plan rules — parsed plan + registry names + tokens in, findings and per-screen
 * numbers out. Pure and deterministic: no I/O, no clock, no model.
 *
 * A finding is a thing the plan got wrong or left unsaid; a screen that measures nothing
 * (no slots) or a plan with no screens is a finding too, never a quiet pass. Row-level
 * rules live in reuse-plan-check-row.ts, rung 7 in reuse-plan-check-new.ts.
 */
import type { ParsedPlan, PlanScreen } from "./reuse-plan-parse.js";
import type { CheckContext, CheckResult, DsNewItem, Finding, ScreenSummary, Sink } from "./reuse-plan-types.js";
import type { PatternSource } from "./reuse-plan-names.js";
import { didYouMean, stripTicks } from "./reuse-plan-names.js";
import { isPlaceholderReason } from "./reuse-plan-reason.js";
import { lifecycleOf } from "./lifecycle-name.js";
import { checkRow, NO_TEMPLATES_MESSAGE } from "./reuse-plan-check-row.js";

export type { CheckContext, CheckResult, DsNewItem, Finding, ScreenSummary } from "./reuse-plan-types.js";

const NONE_RE = /^none\b\s*(?:—|–|--|-|:)?\s*(.*)$/i;

export function checkReusePlan(plan: ParsedPlan, ctx: CheckContext): CheckResult {
  const findings: Finding[] = [];
  const warnings: Finding[] = [];
  const dsNew: DsNewItem[] = [];
  const top = (code: string, line: number, message: string): void => {
    findings.push({ code, line, screen: null, slot: null, message });
  };

  for (const row of plan.strayRows) {
    top("ROW_OUTSIDE_SCREEN", row.line, "slot row sits outside any '## Screen: <name>' section — it is not measured; move it under its screen");
  }
  for (const h of plan.malformedHeadings) {
    top("SCREEN_HEADING_MALFORMED", h.line, `heading '${h.text}' mentions a screen but is not '## Screen: <name>' — it opens no screen, so its rows are not measured`);
  }
  for (const line of plan.strayHtmlTableLines) {
    top("UNSUPPORTED_TABLE", line, "an HTML <table> is not read — write the slots as a Markdown table under a '## Screen:' heading");
  }
  if (plan.screens.length === 0) {
    top("EMPTY_PLAN", 1, "no '## Screen: <name>' section found — a reuse plan with no screens measures nothing");
  }
  const onceWarned = new Set<string>();
  const screens = plan.screens.map((s) => checkScreen(s, ctx, findings, warnings, dsNew, onceWarned));

  findings.sort((a, b) => a.line - b.line);
  warnings.sort((a, b) => a.line - b.line);
  return { findings, warnings, screens, dsNew };
}

function checkScreen(screen: PlanScreen, ctx: CheckContext, findings: Finding[], warnings: Finding[], dsNew: DsNewItem[], onceWarned: Set<string>): ScreenSummary {
  const at = (list: Finding[]) => (code: string, line: number, slot: string | null, message: string): void => {
    list.push({ code, line, screen: screen.name, slot, message });
  };
  const warn = at(warnings);
  const sink: Sink = {
    error: at(findings),
    warn,
    warnOnce: (code, line, slot, message) => { if (!onceWarned.has(code)) { onceWarned.add(code); warn(code, line, slot, message); } },
    errors: () => findings.length,
  };

  const { pattern, source } = checkPattern(screen, ctx, sink);
  for (const line of screen.duplicatePatternLines) {
    sink.error("DUPLICATE_PATTERN", line, null, "a second Pattern line in this screen — keep one; the first line is the one that is checked");
  }
  for (const line of screen.htmlTableLines) {
    sink.error("UNSUPPORTED_TABLE", line, null, "an HTML <table> is not read — write the slots as a Markdown table");
  }
  if (screen.rows.length === 0) {
    sink.error("EMPTY_SCREEN", screen.line, null, "screen has no slot rows — nothing is planned, so nothing can be checked");
  }

  let reuse = 0;
  let skipped = 0;
  for (const row of screen.rows) {
    const before = sink.errors();
    const rung = checkRow(row, screen.name, ctx, sink, dsNew);
    if (rung === 1) skipped++;
    if (rung !== null && rung >= 2 && rung <= 6 && sink.errors() === before) reuse++;
  }
  return { name: screen.name, line: screen.line, pattern, patternSource: source, reuse, total: screen.rows.length - skipped, skipped };
}

/** Validate the Pattern line; returns the resolved template and where it came from, or nulls. */
function checkPattern(screen: PlanScreen, ctx: CheckContext, sink: Sink): { pattern: string | null; source: PatternSource | null } {
  const none = { pattern: null, source: null };
  const p = screen.pattern;
  if (p === null || p.value.length === 0) {
    sink.error("MISSING_PATTERN", p?.line ?? screen.line, null,
      "no Pattern line — name the pattern file or registry template this screen follows, or 'Pattern: none — <reason>'");
    return none;
  }
  const noneMatch = NONE_RE.exec(p.value);
  if (noneMatch !== null) {
    if (isPlaceholderReason(noneMatch[1] ?? "")) {
      sink.error("PATTERN_NONE_NO_REASON", p.line, null, "'Pattern: none' needs a real reason — write 'none — <why no pattern or template fits>'");
    }
    return none;
  }
  const whole = stripTicks(p.value);
  const known = (n: string): boolean => ctx.names.patternFiles.has(n) || ctx.names.has(n);
  const name = known(whole) ? whole : stripTicks(p.value.split(/\s+(?:—|–|--)\s+/)[0] ?? "");
  if (!known(name)) {
    const among = ctx.names.hasTemplates ? "templates" : "all";
    sink.error("UNKNOWN_PATTERN", p.line, null, `Pattern '${name}' is neither a design/patterns file nor a registered name${didYouMean(ctx.names.suggest(name, among))}`);
    return none;
  }
  if (ctx.names.patternFiles.has(name)) return { pattern: name, source: "design/patterns" };
  const life = lifecycleOf(name);
  if (life === "retired") {
    sink.error("LIFECYCLE_NAME", p.line, null, `Pattern '${name}' is marked archived/deprecated in the registry — pick its replacement`);
    return none;
  }
  if (ctx.names.hasTemplates && ctx.names.templateSource(name) === null) {
    sink.error("PATTERN_NOT_TEMPLATE", p.line, null,
      `'${name}' is registered but is not a declared template (a design/patterns file, a Pattern/* entry, or a page/template-category record) — use one, or 'none — <reason>'`);
    return none;
  }
  if (!ctx.names.hasTemplates) sink.warnOnce("NO_TEMPLATES_DECLARED", p.line, null, NO_TEMPLATES_MESSAGE);
  if (life === "review") sink.warn("REVIEW_NAME", p.line, null, `Pattern '${name}' is still marked [REVIEW] — confirm it is approved before building on it`);
  return { pattern: name, source: "registry" };
}
