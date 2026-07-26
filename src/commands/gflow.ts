/**
 * `ui gflow i2v` — a narrow Architecture-A adapter around the external gflow
 * hand. It deliberately exposes only i2v (never `gflow video chain`), verifies
 * that a new video was downloaded, then extracts its actual last frame with
 * ffmpeg so callers can use it as the next leg's initial frame.
 */
import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, ok, okJson } from "../core/output.js";

const ROOT_CMD = "gflow";
const CMD = "gflow i2v";

export const GFLOW_HELP = `ui gflow — safe envelope adapter for Architecture-A video generation

Usage:
  ui gflow i2v <prompt> --initial-frame <image> --out-dir <dir> [options] [--json]

The adapter always runs gflow video i2v --json, verifies a newly downloaded MP4,
and uses ffmpeg to extract that video's actual last frame. It never invokes
'gflow video chain' and never supplies --end-frame.

Options:
  --initial-frame <image>  Required seed image for this leg
  --out-dir <dir>          Required directory where gflow downloads the MP4
  --seed-out <png>         Exact next-leg seed path (default derived uniquely from video)
  --model <name>           gflow model (default veo-fast; veo-fast | veo-quality)
  --aspect <ratio>         Video aspect ratio (default 16:9; 16:9 | 9:16)
  --duration <seconds>     Video duration passed to gflow (default 6)
  --profile <name>         Optional gflow auth profile
  --json                   Emit {ok, command, data} JSON envelope
  -h, --help               Show this help

Error codes:
  BAD_ARG              Missing/invalid arguments or unsupported subcommand
  UNKNOWN_FLAG         Unrecognized command-line option
  FILE_NOT_FOUND       --initial-frame does not exist
  DEPENDENCY_MISSING   gflow or ffmpeg is not installed/on PATH
  UPSTREAM_FAILED      gflow exited non-zero
  BAD_UPSTREAM_JSON    gflow --json returned invalid JSON
  DOWNLOAD_MISSING     gflow returned success but no new non-empty MP4 appeared
  FILE_IO_FAILED       Generated video could not be published without overwriting
  FFMPEG_FAILED        ffmpeg could not extract the next seed
`;

function fail(useJson: boolean, code: string, message: string): CommandResult {
  return useJson ? errJson(CMD, code, message) : errText(`ui: ${message}\n`);
}

function stringFlag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function mp4Files(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith(".mp4"))
    .map((name) => resolve(dir, name))
    .filter((path) => {
      const stat = lstatSync(path);
      return stat.isFile() && !stat.isSymbolicLink() && stat.size > 0;
    });
}

/** Publish within the same filesystem without ever replacing an existing path. */
function publishUnique(source: string, preferred: string, suffix: string): string {
  const ext = preferred.toLowerCase().endsWith(".mp4") ? ".mp4" : ".png";
  const stem = preferred.slice(0, -ext.length);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0
      ? preferred
      : `${stem}-${suffix}${attempt === 1 ? "" : `-${attempt}`}${ext}`;
    try {
      // link(2) with an existing destination fails atomically with EEXIST;
      // unlike rename(2), it never replaces another concurrent job's file.
      linkSync(source, candidate);
      unlinkSync(source);
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
  }
  throw new Error("could not reserve a unique output filename after 100 attempts");
}

/** Publish to an explicitly requested path, failing rather than choosing another name. */
function publishExact(source: string, target: string): string {
  linkSync(source, target);
  unlinkSync(source);
  return target;
}

export const gflowCommand = {
  name: ROOT_CMD,
  summary: "Run the safe gflow i2v + ffmpeg Architecture-A asset path",
  hasSubcommands: true,
  help: GFLOW_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    if (parsed.subcommand !== "i2v") {
      return fail(useJson, "BAD_ARG", "ui gflow supports only the 'i2v' subcommand; 'video chain' is forbidden");
    }

    const prompt = parsed.positionals[0];
    const initialArg = stringFlag(parsed, "initial-frame");
    const outArg = stringFlag(parsed, "out-dir");
    if (prompt === undefined || parsed.positionals.length !== 1 || initialArg === undefined || outArg === undefined) {
      return fail(useJson, "BAD_ARG", "ui gflow i2v requires exactly one <prompt>, --initial-frame, and --out-dir");
    }

    const initialFrame = resolve(initialArg);
    const outDir = resolve(outArg);
    const seedArg = stringFlag(parsed, "seed-out");
    const requestedSeed = seedArg === undefined ? undefined : resolve(seedArg);
    const model = stringFlag(parsed, "model") ?? "veo-fast";
    if (model !== "veo-fast" && model !== "veo-quality") {
      return fail(useJson, "BAD_ARG", `unsupported --model '${model}' (expected veo-fast or veo-quality)`);
    }
    const aspect = stringFlag(parsed, "aspect") ?? "16:9";
    if (aspect !== "16:9" && aspect !== "9:16") {
      return fail(useJson, "BAD_ARG", `unsupported --aspect '${aspect}' (expected 16:9 or 9:16)`);
    }
    const duration = stringFlag(parsed, "duration") ?? "6";
    if (!/^\d+$/.test(duration) || Number(duration) <= 0) {
      return fail(useJson, "BAD_ARG", `invalid --duration '${duration}' (expected a positive integer)`);
    }
    try {
      if (!existsSync(initialFrame)) {
        return fail(useJson, "FILE_NOT_FOUND", `initial frame not found: ${initialFrame}`);
      }
      const initialStat = lstatSync(initialFrame);
      if (!initialStat.isFile() || initialStat.isSymbolicLink()) {
        return fail(useJson, "BAD_ARG", `--initial-frame must be a readable regular file: ${initialFrame}`);
      }
      accessSync(initialFrame, constants.R_OK);
      mkdirSync(outDir, { recursive: true });
      if (!lstatSync(outDir).isDirectory()) {
        return fail(useJson, "BAD_ARG", `--out-dir must be a directory: ${outDir}`);
      }
      accessSync(outDir, constants.W_OK);
      if (requestedSeed !== undefined) {
        mkdirSync(dirname(requestedSeed), { recursive: true });
        if (!lstatSync(dirname(requestedSeed)).isDirectory()) {
          return fail(useJson, "BAD_ARG", `--seed-out parent must be a directory: ${dirname(requestedSeed)}`);
        }
        accessSync(dirname(requestedSeed), constants.W_OK);
        try {
          lstatSync(requestedSeed);
          return fail(useJson, "FILE_IO_FAILED", `refusing to overwrite existing --seed-out: ${requestedSeed}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return fail(useJson, "FILE_IO_FAILED", `path preflight failed before generation: ${detail}`);
    }

    // Fail before invoking gflow: a missing/broken ffmpeg would otherwise be
    // discovered only after a paid generation credit had already been spent.
    const ffmpegPreflight = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
    if (ffmpegPreflight.error !== undefined || (ffmpegPreflight.status ?? 1) !== 0) {
      const detail = ffmpegPreflight.error?.message ?? (ffmpegPreflight.stderr.trim() || `exit ${ffmpegPreflight.status ?? 1}`);
      return fail(useJson, "DEPENDENCY_MISSING", `ffmpeg preflight failed: ${detail}`);
    }

    // Give this invocation its own workspace. Shared-directory snapshots can
    // select another job's MP4, and shared seed names can cross-associate legs.
    let downloadDir = "";
    let seedWorkspace: string;
    try {
      downloadDir = mkdtempSync(join(outDir, ".ui-gflow-"));
      // An explicit seed path may live on another filesystem. Extract in its
      // parent so atomic hard-link publication remains same-device.
      seedWorkspace = requestedSeed === undefined
        ? downloadDir
        : mkdtempSync(join(dirname(requestedSeed), ".ui-gflow-seed-"));
    } catch (error) {
      if (downloadDir !== "") {
        try { rmSync(downloadDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
      }
      const detail = error instanceof Error ? error.message : String(error);
      return fail(useJson, "FILE_IO_FAILED", `could not create isolated generation workspace: ${detail}`);
    }

    try {
      const args = [
        "video", "i2v", "--initial-frame", initialFrame, prompt,
        "--model", model,
        "--aspect", aspect,
        "--duration", duration,
        "--out-dir", downloadDir,
      ];
      const profile = stringFlag(parsed, "profile");
      if (profile !== undefined) args.push("--profile", profile);
      args.push("--json");

      const generated = spawnSync("gflow", args, { encoding: "utf8" });
      if (generated.error !== undefined) {
        return fail(useJson, "DEPENDENCY_MISSING", `cannot run gflow: ${generated.error.message}`);
      }
      if ((generated.status ?? 1) !== 0) {
        const detail = generated.stderr.trim() || `exit ${generated.status ?? 1}`;
        return fail(useJson, "UPSTREAM_FAILED", `gflow i2v failed: ${detail}`);
      }

      let upstream: unknown;
      try {
        upstream = JSON.parse(generated.stdout);
      } catch {
        return fail(useJson, "BAD_UPSTREAM_JSON", "gflow --json returned invalid JSON");
      }

      const downloads = mp4Files(downloadDir);
      if (downloads.length !== 1 || downloads[0] === undefined) {
        return fail(useJson, "DOWNLOAD_MISSING", "gflow returned success but did not produce exactly one non-empty regular MP4 in its isolated download directory");
      }

      const downloaded = downloads[0];
      const suffix = basename(downloadDir).replace(/^\.ui-gflow-/, "");
      const video = publishUnique(downloaded, join(outDir, basename(downloaded)), suffix);

      const privateSeed = join(seedWorkspace, "next-seed.png");
      const extracted = spawnSync("ffmpeg", [
        "-loglevel", "error", "-sseof", "-1", "-i", video,
        "-vf", "reverse", "-frames:v", "1", "-update", "1", privateSeed,
      ], { encoding: "utf8" });
      if (extracted.error !== undefined) {
        return fail(useJson, "DEPENDENCY_MISSING", `cannot run ffmpeg: ${extracted.error.message}`);
      }
      const privateSeedStat = existsSync(privateSeed) ? lstatSync(privateSeed) : undefined;
      if ((extracted.status ?? 1) !== 0 || privateSeedStat === undefined || !privateSeedStat.isFile() || privateSeedStat.isSymbolicLink() || privateSeedStat.size === 0) {
        const detail = extracted.stderr.trim() || `exit ${extracted.status ?? 1}`;
        return fail(useJson, "FFMPEG_FAILED", `ffmpeg could not extract next seed: ${detail}`);
      }

      const defaultSeed = join(outDir, `${basename(video).slice(0, -4)}-next-seed.png`);
      const seed = requestedSeed === undefined
        ? publishUnique(privateSeed, defaultSeed, suffix)
        : publishExact(privateSeed, requestedSeed);

      const data = { architecture: "A", video, seed, upstream };
      return useJson
        ? okJson(CMD, data)
        : ok(`gflow i2v: ${video}\nnext initial frame: ${seed}\n`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return fail(useJson, "FILE_IO_FAILED", `gflow adapter filesystem operation failed: ${detail}`);
    } finally {
      if (seedWorkspace !== downloadDir) {
        try { rmSync(seedWorkspace, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
      }
      try { rmSync(downloadDir, { recursive: true, force: true }); } catch { /* best-effort cleanup */ }
    }
  },
};
