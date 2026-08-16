/**
 * `ui scrub-lint` command — the scrub-encode floor from
 * `knowledge/scroll-cinema-direction.md`, checked on the encoded clip.
 *
 * Pure kernel: src/core/scrub-lint.ts (fs-free). This command owns all IO — it
 * reads the file and hands bytes to the linter, which returns findings.
 *
 * SCOPE, and it matters: this lints a CLIP THAT WILL BE SCRUBBED. A playback
 * video — a demo recording, a trailer, anything a visitor presses play on — is
 * correctly encoded with long GOPs, and pointing this command at one reports a
 * violation of a floor that does not apply to it. That is a category error the
 * same way running taste-lint on a README would be, and no heuristic can tell
 * the two files apart: both are silent, both are faststart. The caller decides.
 *
 * Exit 1 iff any error-severity finding, mirroring taste-lint / validate-layout.
 */
import { readFileSync } from "node:fs";

import { errJson, errText, okJsonWithExit } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { lintScrub, probeScrub } from "../core/scrub-lint.js";
import type { ScrubFinding } from "../core/scrub-lint.js";

const CMD = "scrub-lint";

export const SCRUB_LINT_HELP = `ui scrub-lint — the scrub-encode floor, checked on the encoded clip

Usage:
  ui scrub-lint <file.mp4> [--json]

Checks a clip meant to be SCRUBBED (scroll drives currentTime) against the floor
in knowledge/scroll-cinema-direction.md. It walks the ISO-BMFF box tree — no
decoding, no ffmpeg — so it reads container facts only.

NOT for a playback video. A demo recording or trailer is correctly encoded with
long GOPs; this command would report a floor that does not apply to it.

Checks:
  scrub-no-faststart   (error) moov after mdat — seeking waits for the whole file
  scrub-has-audio      (error) an audio track survived the encode
  scrub-no-video       (error) no video track at all
  scrub-gop-too-long   (error) too few keyframes — seeks decode long runs

Options:
  --json  Emit {ok, command, data} JSON envelope
  -h, --help

Exit codes:
  0  No error-severity findings
  1  At least one error-severity finding

Error codes:
  BAD_ARG         Missing <file.mp4> argument or unexpected extra positionals
  UNKNOWN_FLAG    Unrecognised --flag
  FILE_NOT_FOUND  The file does not exist
  READ_ERROR      The file could not be read
  NOT_ISO_BMFF    The file is not an ISO-BMFF (mp4/mov) container
`;

function formatReport(filePath: string, findings: readonly ScrubFinding[]): string {
  const lines = [`scrub-lint: ${filePath}`];
  if (findings.length === 0) {
    lines.push("  Meets the scrub-encode floor.");
  } else {
    for (const f of findings) lines.push(`  ${f.checkId} (${f.severity}): ${f.message}`);
  }
  lines.push("");
  const errorCount = findings.filter((f) => f.severity === "error").length;
  lines.push(`${findings.length} finding(s) (${errorCount} error, ${findings.length - errorCount} warning)`);
  return lines.join("\n") + "\n";
}

export const scrubLintCommand = {
  name: CMD,
  summary: "The scrub-encode floor checked on an encoded clip (faststart / no audio / GOP length)",
  hasSubcommands: false,
  help: SCRUB_LINT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const err = (code: string, msg: string): CommandResult =>
      useJson ? errJson(CMD, code, msg) : errText(`ui: ${msg}\n`);

    const unknown = findUnknownFlag(parsed.flags, []);
    if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

    const filePath = parsed.positionals[0];
    if (filePath === undefined) return err("BAD_ARG", "ui scrub-lint requires a <file.mp4> argument");
    if (parsed.positionals.length > 1) {
      return err("BAD_ARG", `ui scrub-lint takes exactly one file argument; unexpected: ${parsed.positionals.slice(1).join(", ")}`);
    }

    let bytes: Uint8Array;
    try {
      bytes = readFileSync(filePath);
    } catch (e) {
      const notFound = e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
      return err(
        notFound ? "FILE_NOT_FOUND" : "READ_ERROR",
        notFound ? `file not found: '${filePath}'` : `cannot read file '${filePath}': ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    // A file whose box tree answers nothing is not a silent pass: reporting
    // "meets the floor" for a JPEG would be worse than refusing to answer.
    const probe = probeScrub(bytes);
    if (probe.faststart === null && probe.handlers.length === 0) {
      return err("NOT_ISO_BMFF", `'${filePath}' is not an ISO-BMFF container (no moov/mdat boxes found) — scrub-lint reads mp4/mov files`);
    }

    const findings = lintScrub(bytes);
    const errorCount = findings.filter((f) => f.severity === "error").length;
    const exitCode = errorCount > 0 ? 1 : 0;

    if (useJson) {
      return okJsonWithExit(CMD, {
        file: filePath,
        findings,
        errorCount,
        warningCount: findings.length - errorCount,
        probe: {
          faststart: probe.faststart,
          handlers: probe.handlers,
          videoSamples: probe.videoSamples,
          videoSyncSamples: probe.videoSyncSamples,
          gop: probe.gop,
        },
      }, exitCode);
    }
    return { exitCode, stdout: formatReport(filePath, findings) };
  },
};
