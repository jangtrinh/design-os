/**
 * Text rendering for `ui figma reconcile` (spec 004 P2/P4 + spec 005 P4).
 *
 * Split out of figma-reconcile-run.ts when the mirror report pushed it past the
 * ~200-line ceiling (Art IX). The JSON envelope is the authoritative form — this is the
 * human surface over the same data, and it must not claim more than the envelope does
 * (Art VIII): the applied line counts records that CHANGED, never raw log events.
 */
import type { ApplyReport } from "../core/figma-apply.js";
import type { PendingTarget } from "../core/figma-sync-state.js";

/** The shared preview fields both renders read (a projection of the JSON envelope). */
export interface DeltaText {
  cursor_from: number;
  cursor_to: number;
  /** Registry-integrity phase 03 (5.2), §2 — present only when `--file-slug` narrowed the
   *  run; `cursor_to` then reports THAT file's own per-file cursor, not the shared log's. */
  file_slug?: string;
  skipped_foreign_frames?: number;
  delta: {
    added: { name: string; scope: string }[];
    updated: { name: string; scope: string; fields: string[] }[];
    deprecated: { name: string; scope: string }[];
  };
  scope_summary: { local: number; global: number };
  caps?: { unresolved: { nodeId: string; reason: string }[] };
  /** The retry queue (registry-integrity phase 02, §4) — the cursor stopped short of the
   *  log's end exactly when this is non-empty. */
  pending?: PendingTarget[];
}

/** "3 targets waiting, 1 skipped — see `ui figma reconcile --skip <nodeId>`". */
function pendingSummaryLine(pending: readonly PendingTarget[]): string | null {
  if (pending.length === 0) return null;
  const blocking = pending.filter((t) => t.skipped !== true);
  const skipped = pending.length - blocking.length;
  const parts = [`${pending.length} target${pending.length === 1 ? "" : "s"} waiting`];
  if (skipped > 0) parts.push(`${skipped} skipped`);
  const hint = blocking.length > 0 ? " — see `ui figma reconcile --skip <nodeId>`" : "";
  return `  · ${parts.join(", ")}${hint}`;
}

/** Strip control chars / collapse newlines so untrusted node names can't spoof text output. */
export function safeText(s: string, max = 80): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = s.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? cleaned.slice(0, max - 1) + "…" : cleaned;
}

function renderDeltaLines(data: DeltaText, header: string): string[] {
  const lines: string[] = [];
  lines.push(header);
  if (data.file_slug !== undefined) {
    lines.push(`  · file ${safeText(data.file_slug)} — ${data.skipped_foreign_frames ?? 0} foreign frame(s) filtered`);
  }
  lines.push(
    `  ${data.delta.added.length} added · ${data.delta.updated.length} updated · ${data.delta.deprecated.length} deprecated ` +
      `(scope: ${data.scope_summary.local} local, ${data.scope_summary.global} global)`,
  );
  for (const e of data.delta.added) lines.push(`  + ${safeText(e.name)} (${e.scope})`);
  for (const e of data.delta.updated) {
    const fields = e.fields.length > 0 ? ` [${e.fields.join(", ")}]` : "";
    lines.push(`  ~ ${safeText(e.name)} (${e.scope})${fields}`);
  }
  for (const e of data.delta.deprecated) lines.push(`  - ${safeText(e.name)} (${e.scope}) deprecated`);
  if (data.caps !== undefined) lines.push(`  ! ${data.caps.unresolved.length} unresolved (no component name)`);
  const pendingLine = data.pending !== undefined ? pendingSummaryLine(data.pending) : null;
  if (pendingLine !== null) lines.push(pendingLine);
  return lines;
}

export function renderDryRun(data: DeltaText): string {
  const lines = renderDeltaLines(data, `figma reconcile (dry-run) — cursor ${data.cursor_from}..${data.cursor_to}`);
  return lines.join("\n") + "\n";
}

export function renderApply(data: DeltaText, report: ApplyReport): string {
  const lines = renderDeltaLines(data, `figma reconcile (applied) — cursor ${data.cursor_from}..${data.cursor_to}`);
  lines.push(
    `  → ${report.added.length} added · ${report.updated.length} updated · ${report.deprecated.length} deprecated · ` +
      `${report.mirrored.length} mirrored · ${report.pending.length} pending re-ingest · ${report.skipped.length} skipped`,
  );
  for (const m of report.mirrorSkipped) lines.push(`  ! ${safeText(m.name)} — ${safeText(m.reason, 120)}`);
  for (const p of report.pending) lines.push(`  · pending ${safeText(p.name)} — ${p.reason}`);
  return lines.join("\n") + "\n";
}
