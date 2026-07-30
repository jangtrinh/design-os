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
  /** Registry-integrity phase 03 fix round (MAJOR 2) — a SUBSET of
   *  `skipped_foreign_frames`: frames whose file identity resolved to the literal
   *  'unknown' bucket (a Figma-Free file with no name recorded, or a pre-P3 log line) —
   *  unreachable by any real `--file-slug`, so a separate, named drain
   *  (`--file-slug unknown`) is the only way past them; never auto-adopted. */
  skipped_legacy_frames?: number;
  /** Registry-integrity phase 04 (5.4), §2 — present only when the log rotated past this
   *  cursor: how many frames' worth of history became unreachable through the normal
   *  resume path (still archived in `<path>.N`, never destroyed). */
  rotated_away_lines?: number;
  /** Stage-4 MAJOR4 — a fallback with NO rotation marker to confirm it (hand-truncated
   *  file, corruption, or a rotation whose marker write itself failed); how far the stale
   *  cursor had claimed to be before it reset. */
  history_gap_lines?: number;
  /** Stage-4 N2 — shard files a corrupt-index recovery (MAJOR9) could not safely remove
   *  this apply; report-only, never auto-deleted. Apply-only (never present on a
   *  dry-run, which writes nothing). */
  orphan_shards?: string[];
  /** Stage-4 N4 — a running total of skipHistory entries the 500-cap has ever evicted
   *  (some may have been legacy-untagged-pruned audit records). Apply-only. */
  skip_history_truncated?: number;
  /** Stage-4 N6 — a FOREIGN artifact occupies `component-registry.json`; the kernel is
   *  using `registry_path` instead, never touching the foreign file. Present on both
   *  dry-run and apply (the resolution happens on every run, not just a write). */
  foreign_registry_at_default_path?: boolean;
  registry_path?: string;
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
  if (data.skipped_legacy_frames !== undefined && data.skipped_legacy_frames > 0) {
    lines.push(
      `  ! ${data.skipped_legacy_frames} frame(s) belong to no known file ('unknown') — run ` +
        "`ui figma reconcile --apply --file-slug unknown` once to drain them",
    );
  }
  if (data.rotated_away_lines !== undefined) {
    lines.push(`  ! log rotated — ${data.rotated_away_lines} frame(s) of history are no longer auto-resumable (still archived)`);
  }
  if (data.history_gap_lines !== undefined) {
    lines.push(`  ! history gap — the cursor could not verify ${data.history_gap_lines} prior frame(s) against this log (no rotation marker found) — reset and re-scanned from the start`);
  }
  if (data.foreign_registry_at_default_path === true) {
    lines.push(`  ! component-registry.json is a FOREIGN file (not this kernel's) — using ${safeText(data.registry_path ?? "the alternate registry path")} instead`);
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
  for (const c of report.cleanupFailed) {
    lines.push(`  ! could not remove orphaned sidecar ${safeText(c.path)} — ${safeText(c.reason, 120)}`);
  }
  if (data.orphan_shards !== undefined && data.orphan_shards.length > 0) {
    lines.push(`  ! ${data.orphan_shards.length} orphaned registry shard(s) found (corrupt-index recovery) — never auto-deleted:`);
    for (const s of data.orphan_shards) lines.push(`    · ${safeText(s)}`);
  }
  if (data.skip_history_truncated !== undefined && data.skip_history_truncated > 0) {
    lines.push(`  ! ${data.skip_history_truncated} skip-history record(s) evicted by the retention cap over this project's lifetime`);
  }
  return lines.join("\n") + "\n";
}
