/**
 * `ui scroll-story <frames-dir>` — reads the ordered PNG frames of a scroll
 * capture (`~/.claude/skills/es-designer/scripts/scroll-frames.mjs`'s output:
 * f0001.png, f0002.png, …) and reports whether the sequence looks ACTIVE
 * (content moves/changes independent of plain scroll reveal) or FLAT (a
 * static document scrolled past). Informational for a critic, never a gate:
 * exit 0 for any readable directory regardless of the verdict.
 *
 * IO lives here (read the dir, decode each PNG); src/core/scroll-story-kernel.ts
 * is the pure grid/diff/verdict math, reused by r8's evidence check.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { isEvidenceDir } from "../core/build-evidence-rules-shared.js";
import { decodePng } from "../core/png-codec.js";
import type { RgbaImage } from "../core/png-codec.js";
import { analyzeFrames, REPORT_MARKERS, type ScrollStoryReport } from "../core/scroll-story-kernel.js";

const CMD = "scroll-story";
const FRAME_RE = /^f(\d+)\.png$/i;

export const SCROLL_STORY_HELP = `ui scroll-story — reads a scroll capture's ordered frames and reports ACTIVE or FLAT

Usage:
  ui scroll-story <frames-dir> [--json]

Reads every "f<NNNN>.png" frame directly inside <frames-dir> (scroll-frames.mjs's
output), in capture order, decodes each PNG with node:zlib only (no dependency),
downsamples to a 32xN grey grid, and reports:
  frames          frame count
  changeRatios    mean abs grey diff / 255 between each adjacent frame pair
  staticRun       longest run of adjacent pairs whose changeRatio is below the
                  static threshold (frames literally repeating)
  layoutVariance  variance of the row-energy profile across the whole sequence
  story: ACTIVE | FLAT  informational verdict — not a gate

Options:
  --json  Emit {ok, command, data} JSON envelope
  -h, --help

Exit codes:
  0  <frames-dir> was readable (any verdict, including zero frames)
  2  <frames-dir> does not exist or is not a directory

Error codes:
  BAD_ARG        Missing <frames-dir>, or unexpected extra positionals
  UNKNOWN_FLAG   Unrecognised --flag
  DIR_NOT_FOUND  <frames-dir> does not exist or is not readable (exit 2)
`;

function findFrameFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => FRAME_RE.test(name))
    .sort((a, b) => Number(FRAME_RE.exec(a)?.[1]) - Number(FRAME_RE.exec(b)?.[1]));
}

function formatReport(dir: string, report: ScrollStoryReport, unreadable: string[]): string {
  const pairs = report.changeRatios.length;
  const lines = [
    `scroll-story: ${dir} — ${report.frames} frames, ${pairs} pair(s), grid ${report.grid.cols}x${report.grid.rows}`,
    `  changeRatios: [${report.changeRatios.map((r) => r.toFixed(4)).join(", ")}]`,
    `  ${REPORT_MARKERS.staticRun}${report.staticRun}/${pairs} (threshold changeRatio<0.02, run-ratio>=0.5)`,
    `  ${REPORT_MARKERS.layoutVariance}${report.layoutVariance.toFixed(2)} (threshold >=40)`,
    `  story: ${report.verdict}`,
  ];
  if (unreadable.length > 0) lines.push(`  unreadable frame(s), skipped: ${unreadable.join(", ")}`);
  return lines.join("\n") + "\n";
}

export const scrollStoryCommand = {
  name: CMD,
  summary: "Reads a scroll capture's ordered frames and reports ACTIVE or FLAT (informational, not a gate)",
  hasSubcommands: false,
  help: SCROLL_STORY_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const err = (code: string, msg: string): CommandResult => (useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`));

    const unknown = findUnknownFlag(parsed.flags, []);
    if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

    const dir = parsed.positionals[0];
    if (dir === undefined) return err("BAD_ARG", "ui scroll-story requires a <frames-dir> argument");
    if (parsed.positionals.length > 1) {
      return err("BAD_ARG", `ui scroll-story takes exactly one directory argument; unexpected: ${parsed.positionals.slice(1).join(", ")}`);
    }

    if (!isEvidenceDir(dir)) {
      const msg = `frames directory not found: '${dir}'`;
      return useJson ? { ...errJson(CMD, "DIR_NOT_FOUND", msg), exitCode: 2 } : { exitCode: 2, stderr: `ui: ${msg}\n` };
    }

    let frameNames: string[];
    try {
      frameNames = findFrameFiles(dir);
    } catch (e) {
      const msg = `cannot read frames directory '${dir}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? { ...errJson(CMD, "DIR_NOT_FOUND", msg), exitCode: 2 } : { exitCode: 2, stderr: `ui: ${msg}\n` };
    }

    const images: RgbaImage[] = [];
    const unreadable: string[] = [];
    for (const name of frameNames) {
      try {
        images.push(decodePng(readFileSync(join(dir, name))));
      } catch {
        unreadable.push(name);
      }
    }

    const report = analyzeFrames(images);
    if (useJson) return okJsonWithExit(CMD, { dir, ...report, unreadable }, 0);
    return { exitCode: 0, stdout: formatReport(dir, report, unreadable) };
  },
};
