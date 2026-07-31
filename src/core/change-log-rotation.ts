/**
 * Registry-integrity phase 04 (5.4), §2 — the KERNEL's read-only view of a rotation
 * marker. figma-agent's `log-rotate.ts` (its own transport layer) is the ONLY writer —
 * only the broker ever rotates a log, on its own append path — so this module never
 * writes one; it duplicates just the marker's on-disk shape + parse logic, the same
 * cross-package boundary this whole wave already draws for `ChangeFrame`/`safeSlug` (a
 * separate package/bundle outside this tsconfig; the marker FILE is the contract, not a
 * shared type).
 *
 * A rotated file resets both byte AND line numbering to 0 for the fresh live file. The
 * marker records how many lines/bytes existed in the file the INSTANT it rotated (what
 * became `<path>.1`) — the ONLY way `figma-reconcile-run.ts` can recognize that a
 * persisted cursor's absolute numbering no longer corresponds to anything in the live
 * file, rather than either silently stalling (filtering by a line number the fresh file
 * will never reach) or misreading the new file's own line 0 as wherever the old cursor
 * thought it was.
 */
import { existsSync, readFileSync } from "node:fs";

export interface RotateMarker {
  atLine: number;
  /**
   * Stage-4 MINOR16 — the kernel's ONLY consumer of a marker (`figma-reconcile-run.ts`)
   * never reads `atByte`: a confirmed rotation always resets to a full scan from byte 0,
   * never seeks by this value. Demoted to OPTIONAL (never required for a marker to
   * validate) rather than deleted outright: the writer (figma-agent's `log-rotate.ts`,
   * a separate package) still records it as useful metadata (the pre-rotation byte
   * total), and every marker already on disk has it — dropping the field from the TYPE
   * entirely would be a needless breaking shape change for zero behavioral gain. Choosing
   * "optional, passthrough" over "read it": there is no rotation-reset feature today that
   * would use a byte-precise resume into the archived generation, and inventing one here
   * would be scope creep beyond this fix round.
   */
  atByte?: number;
  ts: number;
}

function markerPath(path: string): string {
  return `${path}.rotated.json`;
}

/** Read the rotation marker for `path`, or `undefined` when none exists or it is
 *  malformed (a corrupt marker degrades to "no rotation known" — never crashes reconcile,
 *  and never fabricates a `rotatedAwayLines` figure from garbage). */
export function readRotateMarker(path: string): RotateMarker | undefined {
  const p = markerPath(path);
  if (!existsSync(p)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8")) as Partial<RotateMarker>;
    // Stage-4 MINOR16 — `atByte` is optional now (see the interface doc): present-and-
    // valid is preserved, absent is fine, present-and-INVALID still rejects the whole
    // marker (a malformed field, even an unused one, is still a sign of a corrupt file).
    const atByteOk = parsed.atByte === undefined
      || (typeof parsed.atByte === "number" && Number.isInteger(parsed.atByte) && parsed.atByte >= 0);
    if (
      typeof parsed.atLine === "number" && Number.isInteger(parsed.atLine) && parsed.atLine >= 0
      && atByteOk
      && typeof parsed.ts === "number" && Number.isFinite(parsed.ts)
    ) {
      return { atLine: parsed.atLine, ...(parsed.atByte !== undefined && { atByte: parsed.atByte }), ts: parsed.ts };
    }
    return undefined;
  } catch {
    return undefined;
  }
}
