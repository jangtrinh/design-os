/**
 * ds-usage-gate.ts — the `ds-usage` family of `ui gate` (spec 031 FR-006).
 *
 * The family judges one page against the project's design system with two instruments:
 *   - `lintDsUsageOnMarkup`: undeclared-token / off-system-token / hardcoded-color / off-system-font,
 *     whenever the project's DTCG tokens are available;
 *   - the owner-PROMOTED `token-ban` rules of `design/rules/_adherence.rules.json`. The proposed file
 *     (`_adherence.proposed.json`) is evidence, never law, and is not read here.
 * Either instrument alone is enough to run the family; with neither there is nothing to judge against
 * and the gate prints a skip reason (gate.ts), it does not pass the family silently.
 *
 * Severity: an `error` finding fails the gate. `off-system-token` is a warning and does not.
 * Rule findings carry the rule's own severity, and their checkId is `token-ban/<rule id>` so a
 * promoted rule can never collide with a built-in check.
 */
import { readFileSync } from "node:fs";

import type { FloorFindingBase } from "./finding-schema.js";
import { lintDsUsageOnMarkup } from "./ds-usage-lint.js";
import type { DsUsageLintOptions } from "./ds-usage-lint.js";
import { fontTokenModel } from "./ds-usage-font-check.js";
import { evaluateTokenBansDetailed, loadAdherenceRules } from "./adherence-rules.js";
import type { TokenBanRule } from "./adherence-rules.js";
import { parseTokenFile } from "./token-model.js";
import { resolveTokens } from "./token-resolve.js";
import { declaredCssVarNames } from "./token-emit.js";

export interface DsUsageGateInput {
  /** The project's declared tokens and fonts; absent = only the promoted rules run. */
  lint?: DsUsageLintOptions;
  /** Promoted `token-ban` rules, already validated. */
  rules: readonly TokenBanRule[];
}

export const DS_USAGE_SKIP_REASON =
  "no design.tokens.json and no promoted design/rules/_adherence.rules.json — pass --tokens <file>, or --dir <project> with a design system";

export interface DsUsageFamilyOutput {
  findings: FloorFindingBase[];
  /** Checks of the family that did not run, as `ds-usage/<check>: <why>`; the gate reports them in its `skipped` list. */
  skipped: string[];
  /** Printed under the family: what the rules kept out of the findings. */
  notes: string[];
}

/**
 * Read what the family needs from disk. `tokensPath` must already be known readable (the gate fails
 * loudly on an unreadable token file before this runs); `designDir` is the `design/` folder whose
 * `rules/_adherence.rules.json` is the binding rule list. Throws the loader's named error on an
 * invalid rules file. Returns undefined when there is nothing to judge against.
 */
export function loadDsUsageGateInput(o: { tokensPath?: string; designDir?: string }): DsUsageGateInput | undefined {
  let lint: DsUsageLintOptions | undefined;
  if (o.tokensPath !== undefined) {
    const resolved = resolveTokens(parseTokenFile(JSON.parse(readFileSync(o.tokensPath, "utf8"))));
    lint = { declaredVars: declaredCssVarNames(resolved), fonts: fontTokenModel(resolved) };
  }
  const rules = o.designDir === undefined ? [] : loadAdherenceRules(o.designDir).binding.map((l) => l.rule);
  return lint === undefined && rules.length === 0 ? undefined : { lint, rules };
}

export function runDsUsageFamily(html: string, input: DsUsageGateInput): DsUsageFamilyOutput {
  const findings: FloorFindingBase[] = [];
  const notes: string[] = [];
  const skipped: string[] = [];
  if (input.lint !== undefined) {
    const linted = lintDsUsageOnMarkup(html, { ...input.lint, file: "page.html" });
    for (const f of linted.findings) findings.push({ checkId: f.checkId, severity: f.severity, message: f.message, line: f.line });
    for (const s of linted.skippedChecks) skipped.push(`ds-usage/${s}`);
  }
  if (input.rules.length > 0) {
    const { findings: hits, excluded } = evaluateTokenBansDetailed(input.rules, html);
    for (const h of hits) {
      findings.push({ checkId: `token-ban/${h.ruleId}`, severity: h.severity, message: `${h.message} (banned '${h.token}', rule ${h.ruleId})`, line: h.line });
    }
    const groups = new Map<string, number[]>();
    for (const x of excluded) {
      const key = `${x.ruleId}\u0000${x.element}`;
      groups.set(key, [...(groups.get(key) ?? []), x.line]);
    }
    for (const [key, lines] of groups) {
      const [ruleId, element] = key.split("\u0000");
      notes.push(`${ruleId}: ${lines.length} occurrence(s) excluded inside <${element}> (line ${lines.join(", ")}) — counted, not hidden`);
    }
  }
  findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { findings, skipped, notes };
}
