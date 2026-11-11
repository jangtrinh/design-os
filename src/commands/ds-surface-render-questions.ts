/** The text lines of the registration questions of `ui ds surface --register`: source changed (D18) and lint refused (D17), and the ledger. */
import type { RegisterPreview } from "../core/ds-surface/register-plan.js";
import { codeCounts } from "../core/owner-rulings/kind-component-lint-refused.js";

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const list = (names: readonly string[]): string => (names.length === 0 ? "none" : names.join(", "));

export function renderQuestionLines(r: RegisterPreview): string[] {
  const lines: string[] = [];
  if (r.awaitingSourceChanged.length > 0) {
    lines.push(`  awaiting a ruling: ${plural(r.awaitingSourceChanged.length, "component")} are registered from a source that has changed since; should their records be refreshed? They are in .design-os/onboard/pending.json. Next: ui onboard questions --format claude`);
    for (const c of r.awaitingSourceChanged) lines.push(`    ${c.name}  registered ${c.heldRef}, tree ${c.nowRef}`);
  }
  if (r.refreshes.length > 0) {
    lines.push(`  refreshes: ${plural(r.refreshes.length, "record")} would be rewritten from the source as it is now (a code record: its source, markup and tokens; a linked record: its code reference, and the tokens read from code are added)`);
    for (const f of r.refreshes) {
      lines.push(`    ${f.name}  ${f.sourceRef}  tokens added: ${list(f.tokensAdded)}${f.linked ? `; no longer referenced by the code, kept (a linked record does not say which door a token came from): ${list(f.tokensKept)}` : `; removed: ${list(f.tokensRemoved)}`}`);
    }
  }
  if (r.staleByRuling.length > 0) {
    lines.push(`  stale by ruling: ${plural(r.staleByRuling.length, "component")} registered from a source that is not what the tree holds now; you ruled to keep them as registered, so nothing is written for them until their source changes again`);
    for (const c of r.staleByRuling) lines.push(`    ${c.name}  registered ${c.heldRef}, tree ${c.nowRef}`);
  }
  if (r.awaitingLintRuling.length > 0) {
    lines.push(`  awaiting a ruling: ${r.awaitingLintRuling.length} of ${r.ledger.planned} components fail the design-system lint (${codeCounts(r.awaitingLintRuling)}); what should happen to them? They are in .design-os/onboard/pending.json. Next: ui onboard questions --format claude`);
    for (const c of r.awaitingLintRuling) lines.push(`    ${c.name}  ${c.code}  ${c.file}`);
  }
  if (r.leftOutByRuling.length > 0) {
    lines.push(`  left out by ruling: ${plural(r.leftOutByRuling.length, "component")} fail the design-system lint and are not registered (${codeCounts(r.leftOutByRuling)})`);
    for (const c of r.leftOutByRuling) lines.push(`    ${c.name}  ${c.code}  ${c.file}`);
  }
  if (r.lintStopped.length > 0) {
    lines.push(`  stopped by ruling: ${plural(r.lintStopped.length, "component")} fail the design-system lint (${codeCounts(r.lintStopped)}); --apply writes nothing until they pass`);
    for (const c of r.lintStopped) lines.push(`    ${c.name}  ${c.code}  ${c.file}`);
  }
  const l = r.ledger;
  lines.push(`  ledger: ${l.planned} planned = ${l.written} written + ${l.linked} linked + ${l.refreshed} refreshed + ${l.unchanged} unchanged + ${l.staleByRuling} stale by ruling + ${l.leftOutByRuling} left out by ruling + ${l.stopped} stopped + ${l.separateNameHeld} name held + ${l.awaitingRuling} awaiting a ruling`);
  return lines;
}
