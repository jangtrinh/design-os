/**
 * What `ui ds import` says about the members it was asked about (spec 033 FR-012): one count per skip reason, the
 * items named, the roles applied. Emitted only when the file held something to ask about, so the output of an import
 * with nothing to ask is the output it always was.
 */
import { IMPORT_REASONS } from "../core/ds-import-plan.js";
import type { ImportResult } from "../core/ds-import-plan.js";
import { reasonLabel } from "../core/owner-rulings/kind-untypeable-tokens.js";

/** Names listed per reason in the text summary before it points at `--json`. */
export const NAMES_PER_REASON = 10;

/** True when the file raised a question: a skipped member or an ambiguous role. */
export const hadQuestions = (r: ImportResult): boolean =>
  r.ledger.excluded.total > 0 || r.ledger.written.keptRaw > 0 || r.roles.length + r.rolesLeftUnassigned.length > 0;

export interface RoleOutcome { path: string; role: string; changed: boolean }

/** The extra fields of the JSON summary. */
export function extraSummary(r: ImportResult, applied: readonly RoleOutcome[]): Record<string, unknown> {
  return {
    ledger: r.ledger,
    ...(r.ledger.excluded.total > 0 ? { excluded: r.excludedItems } : {}),
    ...(r.keptRawItems.length > 0 ? { keptRaw: r.keptRawItems } : {}),
    ...(r.roles.length + r.rolesLeftUnassigned.length > 0 ? { roles: { applied, leftUnassigned: r.rolesLeftUnassigned } } : {}),
  };
}

function named(items: readonly { name: string }[]): string {
  const shown = items.slice(0, NAMES_PER_REASON).map((i) => i.name).join(", ");
  return items.length > NAMES_PER_REASON ? `${shown}, +${items.length - NAMES_PER_REASON} more (full list with --json)` : shown;
}

/** The text lines that replace the old "skipped N" line. */
export function ledgerLines(r: ImportResult, applied: readonly RoleOutcome[]): string[] {
  const l = r.ledger;
  const reasons = IMPORT_REASONS.filter((x) => l.excluded[x] !== undefined);
  return [
    `  ledger: in ${l.in} = written ${l.written.total} (${l.written.typed} typed, ${l.written.keptRaw} kept raw) + excluded ${l.excluded.total} + pending ${l.pending}`,
    ...(reasons.length > 0 ? [`  excluded by reason: ${reasons.map((x) => `${x} ${l.excluded[x]}`).join(", ")}`] : []),
    ...reasons.map((x) => `    ${reasonLabel(x)}: ${named(r.excludedItems[x] ?? [])}`),
    ...(r.keptRawItems.length > 0 ? [`  kept raw: ${named(r.keptRawItems)}`] : []),
    ...(r.roles.length + r.rolesLeftUnassigned.length > 0
      ? [`  roles: ${applied.filter((a) => a.changed).length} applied through ui ds set-role${applied.length > 0 ? ` (${applied.map((a) => `${a.path} → ${a.role}`).join(", ")})` : ""}, ${r.rolesLeftUnassigned.length} left without a role${r.rolesLeftUnassigned.length > 0 ? ` (${r.rolesLeftUnassigned.join(", ")})` : ""}`]
      : []),
  ];
}
