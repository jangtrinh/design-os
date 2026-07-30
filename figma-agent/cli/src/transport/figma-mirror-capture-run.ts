// Scoped mirror capture (spec 005 P4) — the LIVE half of a sync-apply.
//
// This is where the plugin call lives, and deliberately NOT in the `ui` kernel: scanning a
// node means asking the open Figma file over the broker socket, and the kernel is pure by
// constitution (Art I.2 — no network, ever). So the flow is:
//
//   ui figma reconcile --dry-run  →  which components changed (+ their nodeIds)
//   figma-agent scan-node <id>    →  each one's FigmaExportNode spec   ← live, here
//   <capture file>                →  ui figma reconcile --apply --mirror-file …
//
// The kernel then does the deterministic part (sidecar + registry pointer) from a plain
// file. Best-effort by design: every scan failure becomes a named `failed` entry, so an
// apply with the plugin down still commits what the log implies and reports the rest as
// un-mirrored. Nothing here ever throws at the broker.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selfBundlePath } from './broker-discovery.ts';

/**
 * Must equal the kernel's MIRROR_CAPTURE_VERSION (src/core/figma-mirror-capture.ts).
 * Bumped to 2 (registry-integrity phase 02, §3) — the payload now names every dropped
 * target, not just a count, so the kernel can bound the apply cursor by what was
 * actually processed instead of trusting the raw log length.
 */
const MIRROR_CAPTURE_VERSION = 2;
/** Per-node scan budget. scan-node bundles the walker + round-trips the plugin. */
const SCAN_TIMEOUT_MS = 30_000;
/** Cap on components scanned in one sync — a huge batch must not hang the panel. */
const MAX_SCANS = 40;

/** One component the mirror should capture, from the reconcile dry-run delta. */
export interface MirrorTarget {
  nodeId: string;
  name: string;
}

export interface MirrorCaptureResult {
  /** Path of the capture file to hand `--mirror-file`, or undefined when nothing was scanned. */
  file?: string;
  captured: number;
  failed: number;
  /** Count of targets dropped by MAX_SCANS — reported, never silently truncated. */
  dropped: number;
  /**
   * The SAME drops, named (registry-integrity phase 02, §3) — written into the capture
   * file's own `dropped` list so the kernel can bound the apply cursor by them instead of
   * advancing past a target it never even attempted.
   */
  droppedTargets: MirrorTarget[];
}

/** Read the ADD/EDIT targets out of a `ui figma reconcile --dry-run --json` envelope. */
export function targetsFromDelta(data: unknown): MirrorTarget[] {
  const d = data as { delta?: { added?: unknown; updated?: unknown } } | null;
  const out: MirrorTarget[] = [];
  for (const group of [d?.delta?.added, d?.delta?.updated]) {
    if (!Array.isArray(group)) continue;
    for (const e of group) {
      const item = e as { nodeId?: unknown; name?: unknown };
      if (typeof item?.nodeId === 'string' && item.nodeId && typeof item.name === 'string' && item.name) {
        out.push({ nodeId: item.nodeId, name: item.name });
      }
    }
  }
  return out;
}

/**
 * Read the kernel's retry queue (`pending`, registry-integrity phase 02 §4) out of the
 * SAME dry-run envelope `targetsFromDelta` reads — one round trip, two projections.
 *
 * Fix round (finding 1): sorted least-recently-attempted first (`lastAttemptedAt`
 * ascending, absent = 0 = most eager to go first). Without this, `mergeTargetsPendingFirst`
 * would hand `captureMirror` the SAME first `MAX_SCANS` names every run in their original
 * (roughly nodeId-sorted) order — if those keep failing, anything past them in the queue
 * is never even attempted. Rotating chronically-failing entries BEHIND never-attempted
 * ones is what lets the queue actually drain instead of starving past position 40.
 */
export function pendingTargetsFromEnvelope(data: unknown): MirrorTarget[] {
  const d = data as { pending?: unknown } | null;
  if (!Array.isArray(d?.pending)) return [];
  const entries: (MirrorTarget & { lastAttemptedAt: number })[] = [];
  for (const e of d.pending) {
    const item = e as { nodeId?: unknown; name?: unknown; lastAttemptedAt?: unknown };
    if (typeof item?.nodeId === 'string' && item.nodeId && typeof item.name === 'string' && item.name) {
      entries.push({
        nodeId: item.nodeId,
        name: item.name,
        lastAttemptedAt: typeof item.lastAttemptedAt === 'number' ? item.lastAttemptedAt : 0,
      });
    }
  }
  entries.sort((a, b) => a.lastAttemptedAt - b.lastAttemptedAt);
  return entries.map(({ nodeId, name }) => ({ nodeId, name }));
}

/**
 * Merge queued (pending) targets AHEAD of freshly-discovered ones, de-duplicated by
 * nodeId — the queue starves otherwise: the same first `MAX_SCANS` names would win
 * every run if new targets could crowd out a target still waiting from a prior run
 * (registry-integrity phase 02 §4). Pending wins both position and identity: a nodeId
 * appearing in both lists is scanned once, from its queued slot.
 */
export function mergeTargetsPendingFirst(
  pending: readonly MirrorTarget[],
  fresh: readonly MirrorTarget[],
): MirrorTarget[] {
  const queued = new Set(pending.map((t) => t.nodeId));
  return [...pending, ...fresh.filter((t) => !queued.has(t.nodeId))];
}

/**
 * Scan one node via the CLI's own `scan-node` command, in a child process.
 *
 * A child (rather than an in-broker socket call) reuses the exact transport every other
 * command is proven on — this code runs INSIDE the broker daemon, and a self-connection
 * would be a second, untested path to the plugin. Resolves `null` + a reason on any
 * failure; never rejects.
 *
 * `fileName` (registry-integrity phase 03, §2) pins the child to the BOUND file via the
 * existing global `--file` flag (figma-agent.ts's `setExpectedFile`, wired since the
 * routing wave — no new flag needed here): without it the broker may route the scan to
 * whichever plugin instance is most recently active, silently undoing the file filter one
 * layer down from `ui figma reconcile --file-slug`.
 */
function scanNode(nodeId: string, fileName?: string): Promise<{ node?: unknown; reason?: string }> {
  return new Promise((resolve) => {
    let child;
    try {
      const args = [selfBundlePath(), 'scan-node', nodeId, '--timeout', String(SCAN_TIMEOUT_MS)];
      if (fileName !== undefined) args.push('--file', fileName);
      child = spawn(process.execPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ reason: `cannot launch scan-node: ${(err as Error).message}` });
      return;
    }
    let out = '';
    let err = '';
    child.stdout?.on('data', (d) => { out += String(d); });
    child.stderr?.on('data', (d) => { err += String(d); });
    child.on('error', (e) => resolve({ reason: `scan-node not runnable: ${e.message}` }));
    child.on('close', () => resolve(parseScan(out, err)));
  });
}

/** `scan-node` prints one JSON object: the EXEC_JS result `{result, console, ms}` or `{error}`. */
function parseScan(out: string, err: string): { node?: unknown; reason?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(out.trim());
  } catch {
    return { reason: err.trim() || 'scan-node produced no JSON (is the plugin open?)' };
  }
  const p = parsed as { result?: unknown; error?: { code?: unknown; message?: unknown } } | null;
  if (p?.error) return { reason: String(p.error.message ?? p.error.code ?? 'scan failed') };
  if (p?.result === undefined || p.result === null) return { reason: 'scan-node returned no node spec' };
  return { node: p.result };
}

/**
 * Pure MAX_SCANS boundary split — exported so the cap/drop-naming contract is unit
 * testable without spawning a single `scan-node` child (registry-integrity phase 02 §3;
 * the rest of `captureMirror` needs a live broker + plugin, per this file's own header).
 */
export function splitAtScanCap(
  targets: readonly MirrorTarget[],
): { scanned: MirrorTarget[]; dropped: MirrorTarget[] } {
  return { scanned: targets.slice(0, MAX_SCANS), dropped: targets.slice(MAX_SCANS) };
}

/**
 * Scan every target and write the capture file. Sequential on purpose: the plugin main
 * thread is single-threaded, and a burst of parallel EXEC_JS would queue there anyway
 * while making a timeout impossible to attribute.
 *
 * `fileName` (registry-integrity phase 03, §2) — the bound file's own name, threaded to
 * every scan so the broker routes each one to the RIGHT plugin instance rather than
 * whichever is currently active. Undefined (a caller with no bound file yet) preserves
 * today's behaviour exactly.
 */
export async function captureMirror(
  targets: readonly MirrorTarget[],
  fileName?: string,
): Promise<MirrorCaptureResult> {
  const { scanned, dropped: droppedTargets } = splitAtScanCap(targets);
  const dropped = droppedTargets.length;
  if (scanned.length === 0) return { captured: 0, failed: 0, dropped, droppedTargets };

  const captured: { nodeId: string; name: string; node: unknown }[] = [];
  const failed: { nodeId: string; name: string; reason: string }[] = [];
  for (const t of scanned) {
    const r = await scanNode(t.nodeId, fileName);
    if (r.node !== undefined) captured.push({ nodeId: t.nodeId, name: t.name, node: r.node });
    else failed.push({ nodeId: t.nodeId, name: t.name, reason: r.reason ?? 'scan failed' });
  }

  const payload = {
    v: MIRROR_CAPTURE_VERSION, captured, failed,
    dropped: droppedTargets.map((t) => ({ nodeId: t.nodeId, name: t.name })),
  };
  try {
    const dir = mkdtempSync(join(tmpdir(), 'figma-mirror-'));
    const file = join(dir, 'capture.json');
    writeFileSync(file, JSON.stringify(payload), 'utf8');
    return { file, captured: captured.length, failed: failed.length, dropped, droppedTargets };
  } catch {
    // Cannot stage the capture → apply still runs, just without a mirror.
    return { captured: 0, failed: failed.length + captured.length, dropped, droppedTargets };
  }
}
