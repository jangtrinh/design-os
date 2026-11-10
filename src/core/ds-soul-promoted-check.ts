/**
 * ds-soul-promoted-check.ts - what `ui ds soul check` says about the harvest's side of a soul.
 *
 *   - A promoted ban that was never moved: `ui ds harvest-bans --accept <NS-id>` writes the machine rule and
 *     leaves soul.md to the owner. A rule in `_adherence.rules.json` whose id no line under the binding
 *     `## Never` names is a ban the gates enforce and the declared stance does not state (warning).
 *   - A rules file that exists and cannot be parsed is said once, naming the file (warning).
 *   - A harvest region that is not under `## Never (proposed)` (error): the tool writes only there, and
 *     generated bullets must never stand in for the binding stance.
 */
import { existsSync, readFileSync } from "node:fs";

import type { SoulCheckResult, SoulFinding } from "./ds-soul.js";
import { bindingNeverIds, misplacedRegion, PROPOSED_NEVER_HEADING } from "./ds-soul-proposed-region.js";
import { NEGATIVE_SPACE_PROBES } from "./negative-space-probes.js";
import { bindingRulesPath } from "./negative-space-rule-files.js";

/** Ids of the harvest's own probes (`NS-nn`) that the binding rules file holds, or the reason it could not be read. */
function promotedProbeIds(path: string): { ids: string[] } | { unreadable: string } {
  if (!existsSync(path)) return { ids: [] };
  try {
    const doc = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as { rules?: { id?: unknown }[] };
    const ids = (Array.isArray(doc.rules) ? doc.rules : []).map((r) => r.id);
    return { ids: NEGATIVE_SPACE_PROBES.map((p) => p.id).filter((id) => ids.includes(id)) };
  } catch (e) { return { unreadable: e instanceof Error ? e.message : String(e) }; }
}

/** `result` plus the harvest findings (promoted-but-unplaced rules, an unreadable rules file, a misplaced region). */
export function withHarvestFindings(result: SoulCheckResult, soulText: string, designDir: string): SoulCheckResult {
  const rulesPath = bindingRulesPath(designDir);
  const promoted = promotedProbeIds(rulesPath);
  const named = new Set(bindingNeverIds(soulText));
  const extra: SoulFinding[] = [];
  const misplaced = misplacedRegion(soulText);
  if (misplaced !== null) {
    extra.push({
      checkId: "soul-harvest-region-misplaced", severity: "error", line: misplaced.line,
      message: `the ds-harvest-bans region sits under '${misplaced.heading === "" ? "no heading" : misplaced.heading}', not under '${PROPOSED_NEVER_HEADING}' — put the heading back above the begin marker, or delete both markers and the lines between them`,
    });
  }
  if ("unreadable" in promoted) {
    extra.push({ checkId: "soul-rules-unreadable", severity: "warning", message: `${rulesPath} exists but cannot be parsed (${promoted.unreadable}) — promoted bans cannot be checked against '## Never'; fix or remove the file` });
  } else {
    for (const id of promoted.ids.filter((x) => !named.has(x))) {
      extra.push({
        checkId: "soul-promoted-rule-unplaced", severity: "warning",
        message: `${id} is promoted (its rule is in design/rules/_adherence.rules.json) but no line under '## Never' names it — move its bullet from '${PROPOSED_NEVER_HEADING}' under '## Never'`,
      });
    }
  }
  if (extra.length === 0) return result;
  const errors = extra.filter((f) => f.severity === "error").length;
  return { findings: [...result.findings, ...extra].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1)), errorCount: result.errorCount + errors, warningCount: result.warningCount + extra.length - errors };
}
