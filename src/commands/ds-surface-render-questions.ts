/** The text lines of the registration questions of `ui ds surface --register`: source changed (D18) and lint refused (D17), and the ledger. */
import type { RegisterPreview } from "../core/ds-surface/register-plan.js";
import { codeCounts } from "../core/owner-rulings/kind-component-lint-refused.js";

/** One number form for every sentence of the register output: "2 component(s)". */
export const count = (n: number, noun: string): string => `${n} ${noun}(s)`;
const list = (names: readonly string[]): string => (names.length === 0 ? "none" : names.join(", "));

/** What to do about a `stop` ruling: the one wording, shared by the refusal `SURFACE_LINT_STOPPED` and the closing line of the text. */
export const LINT_STOPPED_NEXT = 'fix the component so its markup passes, or add the token it needs to design/design.tokens.json and adopt it with ui ds reseal --apply --reason "<text>", then run ui ds surface --register --apply again';

/** Why a source-changed member differs from its record: its content, or only its place in the file. */
const whatDiffers = (c: { contentChanged: boolean }): string => (c.contentChanged ? "content changed" : "moved, content unchanged");
const changedLine = (c: { name: string; heldRef: string; nowRef: string; contentChanged: boolean }): string => `    ${c.name}  registered ${c.heldRef}, tree ${c.nowRef}; ${whatDiffers(c)}`;

/** The closing `next:` line: the command that works now, or what holds the write, or that there is nothing to write. */
export function nextLine(r: RegisterPreview, questionOpen: boolean): string {
  if (questionOpen) return "  next: ui onboard questions --format claude; nothing is written until the open questions are answered";
  if (r.lintStopped.length > 0) return `  next: ${LINT_STOPPED_NEXT}`;
  if (r.wouldRefuse.count > 0) return "  next: nothing is written while the records listed under 'would be refused' are refused; change their source or the design system";
  if (r.separateNameHeld.length > 0) return "  next: nothing is written until the held names are free (listed under 'separate name held')";
  if (r.records.length + r.links.length + r.refreshes.length === 0) return "  next: nothing to write: the registry already holds what the tree says";
  return "  next: ui ds surface --register --apply writes these records";
}

export function renderQuestionLines(r: RegisterPreview, applied = false): string[] {
  const lines: string[] = [];
  if (r.awaitingSourceChanged.length > 0) {
    lines.push(`  awaiting a ruling: ${count(r.awaitingSourceChanged.length, "component")} are registered from a source that has changed since; should their records be refreshed? They are in .design-os/onboard/pending.json. Next: ui onboard questions --format claude`);
    for (const c of r.awaitingSourceChanged) lines.push(changedLine(c));
  }
  if (r.refreshes.length > 0) {
    lines.push(`  refreshes: ${count(r.refreshes.length, "record")} would be rewritten from the source as it is now (a code record: its source, markup and tokens; a linked record: its code reference, and the tokens read from code are added)`);
    for (const f of r.refreshes) {
      lines.push(`    ${f.name}  ${f.sourceRef}  tokens added: ${list(f.tokensAdded)}${f.linked ? `; no longer referenced by the code, kept (a linked record does not say which door a token came from): ${list(f.tokensKept)}` : `; removed: ${list(f.tokensRemoved)}`}`);
    }
  }
  if (r.staleByRuling.length > 0) {
    lines.push(`  stale by ruling: ${count(r.staleByRuling.length, "component")} registered from a source that is not what the tree holds now; you ruled to keep them as registered, so nothing is written for them until their source changes again`);
    for (const c of r.staleByRuling) lines.push(changedLine(c));
  }
  if (r.awaitingLintRuling.length > 0) {
    lines.push(`  awaiting a ruling: ${r.awaitingLintRuling.length} of ${r.ledger.planned} components fail the design-system lint (${codeCounts(r.awaitingLintRuling)}); what should happen to them? They are in .design-os/onboard/pending.json. Next: ui onboard questions --format claude`);
    for (const c of r.awaitingLintRuling) lines.push(`    ${c.name}  ${c.code}  ${c.file}`);
  }
  if (r.leftOutByRuling.length > 0) {
    lines.push(`  left out by ruling: ${count(r.leftOutByRuling.length, "component")} fail the design-system lint and are not registered (${codeCounts(r.leftOutByRuling)})`);
    for (const c of r.leftOutByRuling) lines.push(`    ${c.name}  ${c.code}  ${c.file}`);
  }
  if (r.lintStopped.length > 0) {
    lines.push(`  stopped by ruling: ${count(r.lintStopped.length, "component")} fail the design-system lint (${codeCounts(r.lintStopped)}); --apply writes nothing until they pass`);
    for (const c of r.lintStopped) lines.push(`    ${c.name}  ${c.code}  ${c.file}`);
  }
  const l = r.ledger;
  const [write, link, refresh] = applied ? ["written", "linked", "refreshed"] : ["to write", "to link", "to refresh"];
  lines.push(`  ledger: ${l.planned} planned = ${l.written} ${write} + ${l.linked} ${link} + ${l.refreshed} ${refresh} + ${l.unchanged} unchanged + ${l.staleByRuling} stale by ruling + ${l.leftOutByRuling} left out by ruling + ${l.stopped} stopped + ${l.separateNameHeld} name held + ${l.awaitingRuling} awaiting a ruling`);
  return lines;
}
