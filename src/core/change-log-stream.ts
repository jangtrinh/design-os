/**
 * Registry-integrity phase 04 (5.4), §1 — read the change-log tail from a byte offset
 * instead of the whole file. Today (`figma-reconcile-run.ts`, pre-phase-04): a full
 * `readFileSync` + `parseChangeLog` validates every line EVER written, then
 * `frames.slice(cursorFrom)` throws most of it away — cost is O(total log) per run,
 * forever, to read an O(new) slice. This module makes that cost proportional to the
 * UNREAD TAIL: `readRemainingBytes` opens the file once and reads only from `fromByte`
 * onward via `fs.readSync` with an explicit `position` (a single bounded read sized to the
 * unread tail, not a chunked stream loop — same asymptotic win as `createReadStream`
 * without forcing this command's synchronous IO boundary to become async; see the phase
 * report for why).
 *
 * The seek hint is VERIFIED, never trusted: `fromByte` must be 0 or sit immediately after
 * a real newline, and must not exceed the file's current size — a stale byte offset
 * silently skipping history is exactly the class of bug this wave exists to remove, so
 * either check failing falls back to a full scan from byte 0, reporting why. (A THIRD
 * check — "does the first parsed line from there validate" — is not needed on top of
 * these two: every `\n` in a well-formed JSONL file is, by construction, a genuine line
 * boundary, so once a byte offset is confirmed to sit on one, parsing from there always
 * agrees with what a full scan would parse at that same position — if that line is
 * genuinely malformed, a full-scan fallback would hit the exact same line and correctly
 * THROW, not silently recover. A stale/rotated file failing this way is precisely §2's
 * `.rotated.json` marker's job, not this module's — see the phase report.)
 *
 * Strictness is unchanged: a malformed line inside the range actually being read still
 * throws `BAD_CHANGE_LOG` via `parseChangeLogLine` (figma-reconcile.ts) — the SAME
 * per-line validation the whole-file parse uses. Streaming changes *when* lines are read,
 * never *whether* they are validated.
 *
 * Frame indexing matches `parseChangeLog`'s output exactly: `lineIndex` counts PARSED
 * frames (blank lines are skipped without incrementing it, same as `parseChangeLog`), not
 * raw file lines — this is the same absolute index `coalesceFrames`'s `baseIndex + i`
 * arithmetic (registry-integrity phase 02) already depends on, so a stream-based resume
 * numbers frames identically to a whole-file parse would have.
 */
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { parseChangeLogLine, type ChangeFrame } from "./figma-reconcile.js";

/** One frame read from the log, with its absolute frame index and the byte position in
 *  the raw file immediately after the line (including its trailing newline) that produced
 *  it — the next run's seek hint. */
export interface StreamedFrame {
  frame: ChangeFrame;
  lineIndex: number;
  byteEnd: number;
}

export interface StreamResult {
  frames: StreamedFrame[];
  /** Byte offset the RETURNED `frames` slice begins at — `fromByte` on the trusted-hint
   *  fast path, or the derived position of `fromLine`'s own frame boundary on a full-scan
   *  fallback. The caller's next persisted byte hint for `fromLine` itself (when nothing
   *  new landed this run) or any index within the slice (via each frame's own `byteEnd`). */
  sliceStartByte: number;
  /** Total frame count as of THIS read — only known precisely when a full scan ran
   *  (byte 0). Undefined when the trusted-hint fast path was taken (the caller already
   *  knows its own prior cursor was valid; it does not need to re-derive the total). */
  totalFrames?: number;
  /** True when the seek hint could not be trusted and a full scan ran instead. */
  fellBackToFullScan: boolean;
  /** Present only when fellBackToFullScan is true — human-readable why. */
  fallbackReason?: string;
  /**
   * Present only when fellBackToFullScan is true — a structured discriminant so a caller
   * (figma-reconcile-run.ts §2) can react WITHOUT string-matching `fallbackReason`.
   * `byte-past-size` is the ONE signature rotation produces (the live file is now shorter
   * than the persisted byte hint) — `not-a-newline` and `file-missing` indicate a
   * different kind of staleness/corruption unrelated to rotation.
   */
  fallbackKind?: "byte-past-size" | "not-a-newline" | "file-missing";
}

/** Read every byte from `fromByte` to EOF in one bounded read (absent file → empty). */
function readRemainingBytes(path: string, fromByte: number): { text: string; size: number } {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { text: "", size: 0 };
    throw e;
  }
  try {
    const size = fstatSync(fd).size;
    if (fromByte >= size) return { text: "", size };
    const buf = Buffer.alloc(size - fromByte);
    // Stage-4 MINOR11 — `readSync`'s return is the ACTUAL bytes read, which can be LESS
    // than requested (a short read); the previous code discarded it and always decoded
    // the WHOLE allocated buffer, so a short read would silently include trailing
    // zero-bytes (`Buffer.alloc` zero-fills) as if they were real file content. Slicing to
    // `bytesRead` decodes exactly what was actually read, never more.
    const bytesRead = readSync(fd, buf, 0, buf.length, fromByte);
    return { text: buf.subarray(0, bytesRead).toString("utf8"), size };
  } finally {
    closeSync(fd);
  }
}

/** Confirm `fromByte` sits immediately after a newline (0 is trivially valid — start of
 *  file). Also refuses a `fromByte` past the file's current size (the log was truncated
 *  or rotated out from under this cursor — never silently re-derive from wherever that
 *  lands). */
type ByteHintVerification =
  | { ok: true }
  | { ok: false; reason: string; kind: NonNullable<StreamResult["fallbackKind"]> };

function verifyByteHint(path: string, fromByte: number): ByteHintVerification {
  if (fromByte === 0) return { ok: true };
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, reason: "change-log file does not exist at the hinted byte offset", kind: "file-missing" };
    }
    throw e;
  }
  try {
    const size = fstatSync(fd).size;
    if (fromByte > size) {
      return {
        ok: false, kind: "byte-past-size",
        reason: `byte offset ${fromByte} is past the file's current size ${size} (truncated or rotated?)`,
      };
    }
    const buf = Buffer.alloc(1);
    const read = readSync(fd, buf, 0, 1, fromByte - 1);
    if (read !== 1 || buf[0] !== 0x0a) {
      return {
        ok: false, kind: "not-a-newline",
        reason: `byte ${fromByte - 1} is not a newline — the stored offset no longer lines up with the file`,
      };
    }
    return { ok: true };
  } finally {
    closeSync(fd);
  }
}

/**
 * Parse `text` (already read starting at `startByte`) into frames, starting frame
 * numbering at `startFrameIndex`. A malformed line always throws `BAD_CHANGE_LOG` —
 * exactly like a whole-file parse; there is no "graceful" swallow here (see the module
 * header for why a parse failure is never the fallback trigger).
 */
function parseLines(text: string, startByte: number, startFrameIndex: number): StreamedFrame[] {
  const frames: StreamedFrame[] = [];
  let byteCursor = startByte;
  let frameIndex = startFrameIndex;
  const rawLines = text.split("\n");
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i] ?? "";
    const isLastRawLine = i === rawLines.length - 1;
    // Every raw line consumed a trailing '\n' EXCEPT possibly the last (a file with no
    // trailing newline, or the empty tail split() produces after one) — byte accounting
    // must advance by exactly what was actually on disk, blank or not.
    const consumedBytes = Buffer.byteLength(line, "utf8") + (isLastRawLine ? 0 : 1);
    if (line.trim().length === 0) {
      byteCursor += consumedBytes;
      continue;
    }
    const frame = parseChangeLogLine(line, frameIndex + 1);
    byteCursor += consumedBytes;
    frames.push({ frame, lineIndex: frameIndex, byteEnd: byteCursor });
    frameIndex += 1;
  }
  return frames;
}

/**
 * Read change-log frames from `fromLine` (an absolute frame index) onward, seeking to
 * `fromByte` first when it can be trusted (`fromByte === 0` skips seeking entirely — the
 * whole-file case, byte-identical cost to today's `parseChangeLog`, used whenever no
 * persisted byte hint exists yet). `fromLine` filters the byte-0 fallback path to the
 * requested resume point when the byte hint itself was not trustworthy.
 */
export function streamChangeLog(path: string, fromByte: number, fromLine: number): StreamResult {
  if (fromByte > 0) {
    const verify = verifyByteHint(path, fromByte);
    if (verify.ok) {
      const { text } = readRemainingBytes(path, fromByte);
      return { frames: parseLines(text, fromByte, fromLine), sliceStartByte: fromByte, fellBackToFullScan: false };
    }
    return fullScan(path, fromLine, verify.reason, verify.kind);
  }
  return fullScan(path, fromLine);
}

function fullScan(
  path: string, fromLine: number, fallbackReason?: string, fallbackKind?: StreamResult["fallbackKind"],
): StreamResult {
  const { text } = readRemainingBytes(path, 0);
  const allFrames = parseLines(text, 0, 0);
  const totalFrames = allFrames.length;
  const frames = allFrames.filter((f) => f.lineIndex >= fromLine);
  // The byte position `fromLine` itself begins at: the byteEnd of the frame right before
  // it (0 when fromLine is 0 or the file has fewer frames than that — nothing to resume
  // from, so the "start" is wherever the text actually ends).
  const sliceStartByte = fromLine <= 0
    ? 0
    : (allFrames[fromLine - 1]?.byteEnd ?? Buffer.byteLength(text, "utf8"));
  return {
    frames, totalFrames, sliceStartByte,
    fellBackToFullScan: fallbackReason !== undefined,
    ...(fallbackReason !== undefined && { fallbackReason }),
    ...(fallbackKind !== undefined && { fallbackKind }),
  };
}
