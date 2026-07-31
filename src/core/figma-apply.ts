/**
 * Figma live-sync APPLY core (spec 004 P4 + spec 005 P4, Tier 3 — deterministic, pure).
 *
 * Takes the P2 preview-delta (src/core/figma-reconcile.ts), the current registry, and —
 * since spec 005 P4 — an optional MIRROR INDEX of node specs already captured from the
 * live plugin (figma-mirror-capture.ts). Returns the NEXT registry, the sidecar writes to
 * perform, and a report of what actually landed. No fs, no network, no LLM: the command
 * layer (figma-reconcile-run.ts) owns all IO and the cursor advance, and the live scan
 * happens outside the kernel entirely (Art I.2). Zero fabrication: apply writes only what
 * the log + the captured specs can faithfully imply.
 *
 * What apply writes:
 *   - deprecated (a DELETE)  → set `deprecated: true` on the existing record.
 *   - updated (a re-touch)   → refresh `scope`, clear any `deprecated` (it is live again),
 *                              and — with a capture — replace the node sidecar 1:1 and
 *                              point the record at it.
 *   - added (a NEW component) → WITH a capture, materialize the record around the captured
 *                              node spec (that spec IS the component's definition; `markup`
 *                              stays "" because HTML is one-way design→code, the same
 *                              convention `ingest-figma-ds` already writes for a Figma
 *                              scan). WITHOUT a capture the log alone carries no content,
 *                              so the component stays `pending` for `ui ingest-figma-ds` —
 *                              materializing a stub would fabricate content (spec 004 note).
 *
 * Degrade explicitly: when the plugin is down the capture pass yields nothing, and apply
 * still commits everything the log alone implies (scope refresh, deprecation) while
 * reporting each un-mirrored component in `mirrorSkipped`. Never a crash, never a silent
 * half-sync.
 *
 * Because deprecate ↔ un-deprecate are both derivable from the log, replaying the WHOLE
 * log over a base registry reproduces the correct final lifecycle state — a later
 * CREATE/UPDATE of a deleted component un-deprecates it. That is the "replayable view over
 * the log" undo path the spec asks for.
 */
import {
  RegistryError,
  type ComponentRecord,
  type ComponentScope,
  type Registry,
} from "./registry-store.js";
import type { PreviewDelta } from "./figma-reconcile.js";
import { figmaNodeRelPath, type FigmaNodeSpec } from "./figma-node-reader.js";
import { captureFor, materialize, type MirrorSkip } from "./figma-apply-mirror.js";
import type { MirrorIndex } from "./figma-mirror-capture.js";

/** A sidecar the caller must write (figma-node-reader.writeFigmaNode) before saving the registry. */
export interface SidecarWrite {
  name: string;
  node: FigmaNodeSpec;
}

/** What `applyDelta` actually did, by component name (all arrays sorted by the delta order). */
export interface ApplyReport {
  /** NEW records materialized from a captured node spec (spec 005 P4). */
  added: string[];
  /** Existing records set `deprecated: true` (a DELETE landed). */
  deprecated: string[];
  /** Existing records whose `scope`, `deprecated` and/or sidecar pointer refreshed. */
  updated: string[];
  /** Components whose node sidecar was captured and replaced 1:1 (⊇ added, overlaps updated). */
  mirrored: string[];
  /** ADD/EDIT components with no usable capture — the mirror did not run or the scan failed. */
  mirrorSkipped: MirrorSkip[];
  /** New components neither the log nor a capture can materialize — need `ui ingest-figma-ds`. */
  pending: { name: string; reason: string }[];
  /** A deprecate/update whose target name is not in the registry — nothing to write. */
  skipped: { name: string; reason: string }[];
  /** Registry-integrity phase 03 fix round (F6) — an orphaned flat sidecar the command
   *  layer tried and failed to delete after its flat→nested move (permissions, already
   *  gone, etc). Always empty from `applyDelta` itself (pure, no fs); the command layer
   *  fills this in as an honest record of a best-effort cleanup that did not land — never
   *  a reason to fail the apply that already committed. */
  cleanupFailed: { path: string; reason: string }[];
}

/** Empty apply report (also the "nothing changed" shape). */
function emptyReport(): ApplyReport {
  return {
    added: [], deprecated: [], updated: [], mirrored: [], mirrorSkipped: [], pending: [], skipped: [],
    cleanupFailed: [],
  };
}

/** Count of registry records this report actually changed — the honest "synced" number. */
export function landedCount(r: ApplyReport): number {
  return r.added.length + r.updated.length + r.deprecated.length;
}

/**
 * Apply a preview-delta to a registry, returning the next registry, the sidecars to
 * write, and a report. Pure: the input registry is never mutated. Idempotent —
 * re-applying the same delta over the result is a no-op (an unchanged record
 * short-circuits; an identical sidecar is content-guarded by the writer).
 *
 * Registry-integrity phase 04 (5.4), §5 — every lookup and upsert goes through ONE
 * `Map<name, ComponentRecord>` built once (O(N)), replacing the old per-target
 * `findByName` (a linear scan) + `registerComponent` (ANOTHER linear scan, plus a full
 * array copy) round trip. The registry is reconstructed from the map's values exactly
 * once, at the end (O(N) total, not O(N) per target) — turning a 200-target apply into a
 * 10k-record registry from the old O(delta × N) cost into O(N + delta). `touched` names
 * every record this call actually added/updated/deprecated, so the caller
 * (`figma-reconcile-run.ts`) can hand it straight to `saveRegistry`'s optional touched-set
 * parameter — §4's shards then skip diffing anything NOT in this set, rather than
 * content-guard-diffing all 10k on every save.
 *
 * A `Map` preserves EXISTING keys' iteration position on `.set()` (only a brand-new key is
 * appended at the end) — the exact same ordering `registerComponent` always produced
 * (replace in place / append new), so this refactor changes no observable output shape,
 * only how it gets there (the golden test in `tests/figma-apply-map.test.ts` proves it).
 *
 * @param mirror Captured node specs keyed by change-log nodeId. Omitted = the capture
 *               pass did not run (no plugin / a plain CLI apply) → mirror-less degrade.
 * @param fileSlug Registry-integrity phase 03 (5.2), §3 — the bound file's identity, when
 *               this apply came from a `--file-slug`-filtered run (every entry in `delta`
 *               already belongs to it, by construction). Threaded to every new sidecar
 *               pointer so it lands in that file's own partitioned path. Omitted = the
 *               unfiltered, whole-log escape hatch — sidecars keep today's flat layout
 *               exactly (partitioning only ever applies to a run that actually resolved
 *               one bound file's identity).
 */
export function applyDelta(
  reg: Registry,
  delta: PreviewDelta,
  mirror?: MirrorIndex,
  fileSlug?: string,
): {
  registry: Registry;
  report: ApplyReport;
  sidecarWrites: SidecarWrite[];
  /** Registry-integrity phase 03 fix round (F6, generalized MINOR12) — a sidecar pointer
   *  made obsolete by a repartitioning move THIS call (a corresponding write for the SAME
   *  name is always present in `sidecarWrites`). Stage-4 N1 — carries BOTH the old and
   *  the NEW path (not just the old) so the command layer can guard against deleting a
   *  path that turns out to be the SAME PHYSICAL FILE as the one just written (a
   *  case-insensitive filesystem can make a pre-F5 lowercased dir and F5's new
   *  case-preserving dir the same inode) before removing anything. */
  orphanedSidecarPaths: { oldPath: string; newPath: string }[];
  changed: boolean;
  touched: Set<string>;
} {
  const byName = new Map(reg.components.map((c) => [c.name, c] as const));
  let changed = false;
  const report = emptyReport();
  const sidecarWrites: SidecarWrite[] = [];
  const orphanedSidecarPaths: { oldPath: string; newPath: string }[] = [];
  const touched = new Set<string>();

  // ── DELETE → soft-deprecate the existing record (never mirrored: it is gone) ──
  for (const e of delta.deprecated) {
    const existing = byName.get(e.name);
    if (existing === undefined) {
      report.skipped.push({ name: e.name, reason: "delete of a component not in the registry" });
      continue;
    }
    if (existing.deprecated === true) continue; // already deprecated — idempotent no-op
    byName.set(e.name, { ...existing, deprecated: true });
    touched.add(e.name);
    report.deprecated.push(e.name);
    changed = true;
  }

  // ── UPDATE → refresh scope, clear deprecation, replace the sidecar from the capture ──
  for (const e of delta.updated) {
    const existing = byName.get(e.name);
    if (existing === undefined) {
      // Should not happen (updated ⇒ prior existed), but stay defensive.
      report.skipped.push({ name: e.name, reason: "update of a component not in the registry" });
      continue;
    }
    const node = captureFor(e, mirror, report.mirrorSkipped);
    const nextScope = e.scope as ComponentScope;
    const pointer = node === undefined ? existing.figmaNode : figmaNodeRelPath(e.name, fileSlug);
    const recordChanged =
      (existing.scope ?? "local") !== nextScope ||
      existing.deprecated === true ||
      existing.figmaNode !== pointer;

    if (node !== undefined) {
      // Always re-write on a capture: the record can be identical while the node changed
      // (padding, fills…) — that is exactly the mirror this phase exists to keep 1:1.
      sidecarWrites.push({ name: e.name, node });
      report.mirrored.push(e.name);
      // F6 (generalized, stage-4 MINOR12) — ANY time this capture's write repartitions
      // the pointer to a DIFFERENT path (flat→nested, nested→flat via the unfiltered
      // escape hatch, or nested→nested on a file re-identification), the OLD file is dead
      // weight, never read again (the record's pointer no longer names it) — schedule it
      // for deletion once the new write above lands. Originally scoped to flat→nested
      // only; there is no reason the OTHER pointer-move shapes should leak the same way.
      if (existing.figmaNode !== undefined && pointer !== undefined && pointer !== existing.figmaNode) {
        orphanedSidecarPaths.push({ oldPath: existing.figmaNode, newPath: pointer });
      }
    }
    if (!recordChanged) continue; // nothing the log + capture can faithfully change on the record
    const next: ComponentRecord = { ...existing, scope: nextScope };
    delete next.deprecated; // un-deprecate — Figma still has (and just touched) it
    if (pointer !== undefined) next.figmaNode = pointer;
    byName.set(e.name, next);
    touched.add(e.name);
    report.updated.push(e.name);
    changed = true;
  }

  // ── ADD → materialize from the capture, else stay pending for re-ingest ───────
  for (const e of delta.added) {
    const node = captureFor(e, mirror, report.mirrorSkipped);
    if (node === undefined) {
      report.pending.push({
        name: e.name,
        reason: "new component — run `ui ingest-figma-ds` to materialize markup/tokens",
      });
      continue;
    }
    let rec: ComponentRecord;
    try {
      rec = materialize(e, fileSlug);
    } catch (err) {
      // A Figma node name the registry cannot key (not `Category/Variant`) — say so and
      // stay pending rather than inventing a name the designer never chose.
      if (!(err instanceof RegistryError)) throw err;
      report.pending.push({ name: e.name, reason: `captured but not registrable — ${err.message}` });
      continue;
    }
    byName.set(rec.name, rec);
    touched.add(rec.name);
    sidecarWrites.push({ name: e.name, node });
    report.added.push(e.name);
    report.mirrored.push(e.name);
    changed = true;
  }

  const registry: Registry = { version: reg.version, components: [...byName.values()] };
  return { registry, report, sidecarWrites, orphanedSidecarPaths, changed, touched };
}
