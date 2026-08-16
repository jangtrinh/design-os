/**
 * `ui scrub-scaffold <target>` — emit the build script that produces clips
 * meeting the scrub-encode floor.
 *
 * The Article II other half of `ui scrub-lint`: the linter fails a clip whose
 * encode misses the floor, this emits the command that meets it. Before this
 * existed, the floor was a table of knobs in `knowledge/scroll-cinema-direction.md`
 * that a human retyped into ffmpeg once per project — with the linter catching
 * the typo only after the render, which is the expensive end.
 *
 * Copy verbatim, path-only, following `ui tenant-scaffold`: the emitted script
 * is a real runnable artifact, not a template rendered from flags. It stays
 * parameterless until a second consumer earns the parameter.
 *
 * The kernel does NOT shell out to ffmpeg (Art I.2) — it emits the command and
 * the user runs it. `ui scrub-lint` then reads the resulting mp4's bytes itself,
 * so neither half adds a runtime dependency to this binary.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cwd as processCwd } from "node:process";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, ok, okJson } from "../core/output.js";
import { resolvePackageRoots } from "../core/init-stub.js";

const CMD = "scrub-scaffold";

export const SCRUB_SCAFFOLD_HELP = `ui scrub-scaffold — emit the scrub-encode build script

Usage:
  ui scrub-scaffold <target-dir> [--force] [--json]

Writes 1 file verbatim into <target-dir>/ (no templating — the target path is the
only parameter):
  build-assets.sh   encodes a clip chain to the scrub-encode floor (no audio,
                    small fixed GOP, crf 20, +faststart, light unsharp, native
                    resolution) and pulls one poster webp per clip

The emitted script needs ffmpeg + cwebp on PATH; this binary never runs them.
Check the result with 'ui scrub-lint <file.mp4>' — same floor, other direction.

Options:
  --force     Overwrite an existing file at the target
  --json      Emit a JSON envelope instead of human-readable output
  -h, --help  Show this help

Error codes:
  BAD_ARG      Missing <target-dir> argument
  EXISTS       The target file already exists (use --force to overwrite)
  WRITE_ERROR  The templates root could not be resolved, or the file could not be written
`;

const SOURCE_FILES = ["build-assets.sh"] as const;

export const scrubScaffoldCommand = {
  name: CMD,
  summary: "Emit the build script that encodes a clip chain to the scrub-encode floor",
  hasSubcommands: false,
  help: SCRUB_SCAFFOLD_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    const targetArg = parsed.positionals[0];
    if (targetArg === undefined) {
      const msg = "ui scrub-scaffold requires a <target-dir> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (parsed.positionals.length > 1) {
      const msg = `ui scrub-scaffold takes exactly one target argument; unexpected: ${parsed.positionals.slice(1).join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    const target = resolve(processCwd(), targetArg);
    const force = parsed.flags["force"] === true;

    const thisFile = fileURLToPath(import.meta.url);
    const startDir = dirname(thisFile);
    const { templatesRoot } = resolvePackageRoots(startDir);
    if (templatesRoot === null) {
      const msg = `ease-design templates not found (searched upward from ${startDir})`;
      return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
    }

    // Read before writing, so a missing template fails before it touches disk.
    const sources: Record<string, string> = {};
    for (const name of SOURCE_FILES) {
      const absSource = join(templatesRoot, "scrub", name);
      try {
        sources[name] = readFileSync(absSource, "utf8");
      } catch (e) {
        const msg = `cannot read bundled template '${absSource}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
      }
    }

    if (!force) {
      const conflicts = SOURCE_FILES
        .map((name) => join(target, name))
        .filter((p) => existsSync(p));
      if (conflicts.length > 0) {
        const listed = conflicts.map((p) => `'${p}'`).join(", ");
        const msg = `already exists — run with --force to overwrite: ${listed}`;
        return useJson ? errJson(CMD, "EXISTS", msg) : errText(`ui: ${msg}\n`);
      }
    }

    try {
      mkdirSync(target, { recursive: true });
    } catch (e) {
      const msg = `cannot create '${target}': ${e instanceof Error ? e.message : String(e)}`;
      return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
    }

    const written: string[] = [];
    for (const name of SOURCE_FILES) {
      const dest = join(target, name);
      try {
        writeFileSync(dest, sources[name] ?? "", "utf8");
        // A build script the user cannot run is a build script that did not ship.
        chmodSync(dest, 0o755);
        written.push(dest);
      } catch (e) {
        const msg = `cannot write '${dest}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
      }
    }

    if (useJson) return okJson(CMD, { target, written });
    return ok(
      `scrub-scaffold: wrote ${written.length} file to ${target}/\n` +
      written.map((p) => `  ${p}`).join("\n") + "\n" +
      "next: ./build-assets.sh <src-dir> <out-dir> [landscape|portrait], then check every\n" +
      "output with 'ui scrub-lint' — the floor is only held once the linter says so.\n",
    );
  },
};
