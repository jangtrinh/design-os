/**
 * Apply origin attribution and a baseline to a finished GateResult, and decide
 * which findings still COUNT toward the exit code.
 *
 * Counting rule: an error counts unless it is baselined, and — in origin mode —
 * unless it is attributed to a kit, a framework or the tool's own convention. Nothing is dropped: every
 * finding stays in the result, labelled, and the totals per origin are reported,
 * so "the gate passed" never hides how much non-authored noise is still there.
 */
import type { GateFamily, GateResult } from "./gate.js";
import { GATE_FAMILIES } from "./gate.js";
import type { FloorFindingBase } from "./finding-schema.js";
import { createOriginAttributor, readSourceText } from "./gate-origin.js";
import { importedPackageCss } from "./gate-origin-packages.js";
import type { FindingOrigin } from "./gate-origin.js";
import { baselineMatcher, fingerprintOf, readBaseline, writeBaseline } from "./gate-baseline.js";

export interface OriginVerdictOptions {
  /** Count only authored errors (and label every finding). */
  originMode: boolean;
  /** Unmodified kit sources (files or folders). */
  kitPaths?: string[];
  /** Authored sources (files or folders); kit paths inside them are excluded. */
  srcPaths?: string[];
  baselinePath?: string;
  writeBaselinePath?: string;
  /** The page the findings' lines index. */
  html: string;
  file: string;
}

export type LabelledFinding = FloorFindingBase & { origin?: FindingOrigin; originReason?: string; baselined?: true };

type Tally = { errors: number; warnings: number };
export interface OriginSummary {
  mode: "authored" | "all";
  byOrigin?: Record<FindingOrigin, Tally>;
  /** Per `family/checkId` × origin, for the non-authored roll-up. */
  byRule?: Array<{ rule: string; origin: FindingOrigin; errors: number; warnings: number }>;
  baselined: Tally;
  /** Errors that decide the exit code. */
  countedErrors: number;
  baselineWritten?: { path: string; entries: number };
}

export function applyOriginVerdict(result: GateResult, opts: OriginVerdictOptions): { result: GateResult; summary: OriginSummary } {
  const attribute = opts.originMode
    ? createOriginAttributor({
      html: opts.html,
      ...(opts.srcPaths !== undefined && { authored: readSourceText(opts.srcPaths, opts.kitPaths ?? []) }),
      ...(opts.kitPaths !== undefined && { kit: readSourceText(opts.kitPaths) }),
      // CSS of the packages the project's own files import (node_modules), found by following imports.
      ...(opts.srcPaths !== undefined && { packages: importedPackageCss([...opts.srcPaths, ...(opts.kitPaths ?? [])]) }),
    })
    : undefined;

  const families: GateResult["families"] = { ...result.families };
  const all: Array<{ fam: GateFamily; f: LabelledFinding }> = [];
  for (const fam of GATE_FAMILIES) {
    const r = families[fam];
    if (r === undefined) continue;
    const labelled = r.findings.map((f): LabelledFinding => (attribute === undefined ? { ...f } : { ...f, ...attribute(f) }));
    families[fam] = { ...r, findings: labelled };
    for (const f of labelled) all.push({ fam, f });
  }

  let baselineWritten: OriginSummary["baselineWritten"];
  if (opts.writeBaselinePath !== undefined) {
    const fps = all.filter(({ f }) => f.severity !== "advisory").map(({ fam, f }) => fingerprintOf(fam, f));
    baselineWritten = { path: opts.writeBaselinePath, entries: writeBaseline(opts.writeBaselinePath, fps, opts.file) };
  }
  const baselinePath = opts.writeBaselinePath ?? opts.baselinePath;
  const take = baselinePath !== undefined ? baselineMatcher(readBaseline(baselinePath)) : undefined;

  const baselined: Tally = { errors: 0, warnings: 0 };
  const byOrigin: Record<FindingOrigin, Tally> = { authored: { errors: 0, warnings: 0 }, kit: { errors: 0, warnings: 0 }, framework: { errors: 0, warnings: 0 }, tool: { errors: 0, warnings: 0 } };
  const byRule = new Map<string, { rule: string; origin: FindingOrigin; errors: number; warnings: number }>();
  let countedErrors = 0;
  for (const { fam, f } of all) {
    if (f.severity === "advisory") continue;
    const isError = f.severity === "error";
    if (take !== undefined && take(fingerprintOf(fam, f))) {
      f.baselined = true;
      if (isError) baselined.errors++; else baselined.warnings++;
      continue;
    }
    if (f.origin !== undefined) {
      const t = byOrigin[f.origin];
      if (isError) t.errors++; else t.warnings++;
      const key = `${fam}/${f.checkId}|${f.origin}`;
      const row = byRule.get(key) ?? { rule: `${fam}/${f.checkId}`, origin: f.origin, errors: 0, warnings: 0 };
      if (isError) row.errors++; else row.warnings++;
      byRule.set(key, row);
    }
    if (isError && (!opts.originMode || f.origin === "authored")) countedErrors++;
  }

  const summary: OriginSummary = {
    mode: opts.originMode ? "authored" : "all",
    ...(opts.originMode && { byOrigin, byRule: [...byRule.values()].sort((a, b) => (b.errors - a.errors) || (b.warnings - a.warnings) || a.rule.localeCompare(b.rule)) }),
    baselined,
    countedErrors,
    ...(baselineWritten !== undefined && { baselineWritten }),
  };
  return { result: { ...result, families }, summary };
}
