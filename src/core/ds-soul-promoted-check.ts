/**
 * ds-soul-promoted-check.ts - the `ui ds soul check` warning for a promoted ban that was never moved into the soul.
 *
 * `ui ds harvest-bans --accept <NS-id>` writes the machine rule and leaves soul.md to the owner. A rule in
 * `_adherence.rules.json` whose id no line under the binding `## Never` names is a ban the gates enforce and
 * the declared stance does not state. Reads the rules file tolerantly: an unreadable file is the business of
 * the commands that enforce it, not of a structure lint.
 */
import { existsSync, readFileSync } from "node:fs";

import type { SoulCheckResult, SoulFinding } from "./ds-soul.js";
import { bindingNeverIds } from "./ds-soul-proposed-region.js";
import { NEGATIVE_SPACE_PROBES } from "./negative-space-probes.js";
import { bindingRulesPath } from "./negative-space-rule-files.js";

/** Ids of the harvest's own probes (`NS-nn`) that the binding rules file holds, in file order. */
function promotedProbeIds(designDir: string): string[] {
  const path = bindingRulesPath(designDir);
  if (!existsSync(path)) return [];
  try {
    const doc = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")) as { rules?: { id?: unknown }[] };
    const ids = (Array.isArray(doc.rules) ? doc.rules : []).map((r) => r.id);
    return NEGATIVE_SPACE_PROBES.map((p) => p.id).filter((id) => ids.includes(id));
  } catch { return []; }
}

/** `result` plus one warning per promoted probe rule with no line under `## Never` naming it. */
export function withPromotedRuleWarnings(result: SoulCheckResult, soulText: string, designDir: string): SoulCheckResult {
  const named = new Set(bindingNeverIds(soulText));
  const extra: SoulFinding[] = promotedProbeIds(designDir).filter((id) => !named.has(id)).map((id) => ({
    checkId: "soul-promoted-rule-unplaced",
    severity: "warning",
    message: `${id} is promoted (its rule is in design/rules/_adherence.rules.json) but no line under '## Never' names it — move its bullet from '## Never (proposed)' under '## Never'`,
  }));
  if (extra.length === 0) return result;
  return { findings: [...result.findings, ...extra], errorCount: result.errorCount, warningCount: result.warningCount + extra.length };
}
