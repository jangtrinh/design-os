/**
 * `ui scrub-lint` core — the scrub-encode floor from
 * `knowledge/scroll-cinema-direction.md`, checked on the encoded file.
 *
 * The floor was declared in prose with no check because "the binary does not
 * read mp4" — which was wrong. These are CONTAINER facts, not picture facts:
 * an ISO-BMFF file is a tree of length-prefixed boxes, and every rule below is
 * answerable by walking that tree. No decoding, no ffmpeg, no dependency.
 *
 *   scrub-no-faststart   error    `moov` sits after `mdat`, so playback must
 *                                 wait for the whole file before it can seek
 *   scrub-has-audio      error    an audio track survived the encode
 *   scrub-gop-too-long   error    too few sync samples: seeks decode long runs
 *   scrub-no-video       error    no video track at all
 *
 * Pure and FS-free (Art I.2): bytes in, findings out. Same input → same bytes.
 * The command layer owns all IO.
 */

import { SCRUB_ENCODE_FLOOR } from "./scrub-encode-floor.js";

export interface ScrubFinding {
  checkId: string;
  severity: "error" | "warning";
  message: string;
}

/** What the box walk recovered. Every field is optional — a truncated or foreign
 *  file yields what it yields, and the checks decide what a gap means. */
export interface ScrubProbe {
  /** True when `moov` precedes `mdat` at the top level (the faststart layout). */
  readonly faststart: boolean | null;
  /** Handler types found across all tracks, e.g. `vide`, `soun`. */
  readonly handlers: readonly string[];
  /** Video track sample count from `stsz`, when present. */
  readonly videoSamples: number | null;
  /** Video track sync-sample (keyframe) count from `stss`. Absent `stss` means
   *  EVERY sample is a sync sample — the all-intra case, not a missing value. */
  readonly videoSyncSamples: number | null;
  /** Average samples per keyframe — the GOP length in frames. */
  readonly gop: number | null;
}

// The floor lives in one place so the emitter and this linter cannot drift apart.
const MAX_GOP = SCRUB_ENCODE_FLOOR.maxGopFrames;

/** Read a 32-bit big-endian unsigned int. */
function u32(b: Uint8Array, at: number): number {
  return ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!;
}

function boxType(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at]!, b[at + 1]!, b[at + 2]!, b[at + 3]!);
}

/**
 * Walk one level of boxes between `start` and `end`, calling `visit` for each.
 * Returning `true` from `visit` descends into that box's payload.
 *
 * Guards the two ways a malformed length ends a naive walk badly: a size of 0
 * means "to end of file", and any size below the 8-byte header would loop
 * forever. Both stop the walk rather than throwing — a foreign file should
 * produce no findings, not a crash.
 */
function walk(
  b: Uint8Array,
  start: number,
  end: number,
  visit: (type: string, payloadStart: number, payloadEnd: number) => boolean,
): void {
  let at = start;
  while (at + 8 <= end) {
    let size = u32(b, at);
    const type = boxType(b, at + 4);
    let header = 8;
    if (size === 1) {
      // 64-bit size: the high word must be zero for anything we can address.
      if (at + 16 > end || u32(b, at + 8) !== 0) return;
      size = u32(b, at + 12);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header || at + size > end) return;
    if (visit(type, at + header, at + size)) {
      // handled by the visitor
    }
    at += size;
  }
}

/** Probe an ISO-BMFF file. Returns nulls for anything the tree does not answer. */
export function probeScrub(bytes: Uint8Array): ScrubProbe {
  let moovAt: number | null = null;
  let mdatAt: number | null = null;
  const handlers: string[] = [];
  let videoSamples: number | null = null;
  let videoSyncSamples: number | null = null;

  walk(bytes, 0, bytes.length, (type, ps, pe) => {
    if (type === "moov" && moovAt === null) moovAt = ps;
    if (type === "mdat" && mdatAt === null) mdatAt = ps;
    if (type !== "moov") return false;

    walk(bytes, ps, pe, (t2, s2, e2) => {
      if (t2 !== "trak") return false;
      // One track: find its handler, then its sample tables.
      let handler = "";
      let samples: number | null = null;
      let sync: number | null = null;
      let sawStss = false;

      const descend = (from: number, to: number): void => {
        walk(bytes, from, to, (t3, s3, e3) => {
          if (t3 === "hdlr" && e3 - s3 >= 12) handler = boxType(bytes, s3 + 8);
          else if (t3 === "stsz" && e3 - s3 >= 12) samples = u32(bytes, s3 + 8);
          else if (t3 === "stss" && e3 - s3 >= 8) { sawStss = true; sync = u32(bytes, s3 + 4); }
          else if (t3 === "mdia" || t3 === "minf" || t3 === "stbl") descend(s3, e3);
          return false;
        });
      };
      descend(s2, e2);

      if (handler !== "") handlers.push(handler);
      if (handler === "vide") {
        videoSamples = samples;
        // No stss means every sample is a sync sample (all-intra), which is a
        // value, not a gap — conflating the two would report a missing table
        // as "unknown GOP" on exactly the files that seek best.
        videoSyncSamples = sawStss ? sync : samples;
      }
      return false;
    });
    return false;
  });

  const gop =
    videoSamples !== null && videoSyncSamples !== null && videoSyncSamples > 0
      ? videoSamples / videoSyncSamples
      : null;

  return {
    faststart: moovAt === null || mdatAt === null ? null : moovAt < mdatAt,
    handlers,
    videoSamples,
    videoSyncSamples,
    gop,
  };
}

/** Sort: errors before warnings, then by checkId — deterministic output. */
function sortFindings(f: ScrubFinding[]): ScrubFinding[] {
  return f.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1) ||
      a.checkId.localeCompare(b.checkId),
  );
}

/**
 * Check an encoded clip against the scrub floor. A file whose tree answers
 * nothing (not ISO-BMFF, or truncated before `moov`) yields NO findings rather
 * than a pile of false ones — the command layer reports that as a read problem.
 */
export function lintScrub(bytes: Uint8Array): ScrubFinding[] {
  const p = probeScrub(bytes);
  const findings: ScrubFinding[] = [];
  if (p.handlers.length === 0 && p.faststart === null) return findings;

  if (p.faststart === false) {
    findings.push({
      checkId: "scrub-no-faststart",
      severity: "error",
      message: "moov comes after mdat — a player must read the whole file before it can seek, so scrubbing stalls until the clip fully downloads. Re-encode with -movflags +faststart",
    });
  }
  if (p.handlers.includes("soun")) {
    findings.push({
      checkId: "scrub-has-audio",
      severity: "error",
      message: "an audio track survived the encode — a scrubbed clip never plays sound, and the track is bytes every visitor downloads for nothing. Re-encode with -an",
    });
  }
  if (!p.handlers.includes("vide")) {
    findings.push({
      checkId: "scrub-no-video",
      severity: "error",
      message: "no video track found — this file cannot be scrubbed",
    });
  }
  if (p.gop !== null && p.gop > MAX_GOP) {
    findings.push({
      checkId: "scrub-gop-too-long",
      severity: "error",
      message: `about ${p.gop.toFixed(1)} frames per keyframe (${p.videoSamples} samples, ${p.videoSyncSamples} sync) — every seek decodes forward from the previous keyframe, so long runs are what makes a scrub feel stuck. Re-encode with -g 8 -keyint_min 8 -sc_threshold 0 (limit is ${MAX_GOP})`,
    });
  }
  return sortFindings(findings);
}
