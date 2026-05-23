/**
 * `ui init --runtime` — write a sentinel manifest per runtime.
 *
 * hasSubcommands: false
 * --runtime <claude|antigravity|codex>  write one manifest (required unless --all)
 * --all                                  write all three manifests
 * --cwd <path>                           target directory (default: process.cwd())
 * --force                                overwrite existing manifest
 * --json                                 emit JsonEnvelope
 *
 * Side effect: writes JSON manifest file(s) under the target directory.
 * A future release will extend these manifests with real adapter content.
 */
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { cwd as processCwd } from "node:process";
import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, okJson } from "../core/output.js";
import {
  RUNTIMES,
  buildManifest,
  manifestTargetPath,
} from "../core/init-stub.js";
import type { Runtime } from "../core/init-stub.js";

const CMD = "init";

export const INIT_HELP = `ui init — write a sentinel manifest for a host runtime

Usage:
  ui init --runtime <claude|antigravity|codex> [--cwd <path>] [--force] [--json]
  ui init --all [--cwd <path>] [--force] [--json]

Options:
  --runtime <r>  Target runtime: claude | antigravity | codex
  --all          Write manifests for all three runtimes
  --cwd <path>   Target directory (default: current working directory)
  --force        Overwrite an existing manifest without error
  --json         Emit a JSON envelope instead of writing to stderr
  -h, --help     Show this help

Output paths:
  claude      → <cwd>/.claude/ease-design.json
  antigravity → <cwd>/.agent/ease-design.json
  codex       → <cwd>/AGENTS.ease-design.json

Notes:
  - This command writes a stub manifest that defines the schema. A future
    release will populate the real adapter tree in place of the stub.
  - Without --force, writing to an already-existing path exits 1 (MANIFEST_EXISTS).
  - With --all: all-or-nothing — if any target exists without --force, the
    command errors listing every conflict before writing any file.

Error codes:
  BAD_ARG         Missing --runtime, unknown runtime, or --runtime + --all together
  MANIFEST_EXISTS Target file already exists (use --force to overwrite)
  WRITE_ERROR     File could not be written
`;

export const initCommand = {
  name: CMD,
  summary: "Write a sentinel manifest for a host runtime",
  hasSubcommands: false,
  help: INIT_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;
    const force = parsed.flags["force"] === true;
    const useAll = parsed.flags["all"] === true;
    const runtimeFlag = parsed.flags["runtime"];

    // Validate flag combination
    if (useAll && typeof runtimeFlag === "string") {
      const msg = "--runtime and --all are mutually exclusive";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (!useAll && typeof runtimeFlag !== "string") {
      const msg = "ui init requires --runtime <claude|antigravity|codex> or --all";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    // Validate runtime value
    const runtimes: Runtime[] = useAll
      ? [...RUNTIMES]
      : [runtimeFlag as string].map((r) => {
          if (!RUNTIMES.includes(r as Runtime)) return null;
          return r as Runtime;
        }).filter((r): r is Runtime => r !== null);

    if (!useAll && runtimes.length === 0) {
      const msg = `unknown runtime '${String(runtimeFlag)}'; must be one of: ${RUNTIMES.join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }

    // Resolve target directory
    const cwdFlag = parsed.flags["cwd"];
    const targetCwd = typeof cwdFlag === "string" ? resolve(cwdFlag) : processCwd();

    // binaryPath: store the PATH-lookup name "ui" so the host can invoke the
    // binary without knowing its absolute install location. The field accepts
    // an absolute path too; callers may overwrite the manifest with a resolved
    // path once they know where the binary is installed.
    const binaryPath = "ui";
    // knowledge/ lives two levels up from dist/commands/ in production
    const knowledgePath = resolve(targetCwd, "knowledge");

    // Pre-flight: collect all target paths and check for conflicts before
    // writing anything. This makes --all all-or-nothing: either every manifest
    // is written, or none are (no partial-write state on conflict).
    type ManifestEntry = { runtime: Runtime; path: string; exists: boolean };
    const entries: ManifestEntry[] = runtimes.map((runtime) => ({
      runtime,
      path: manifestTargetPath(targetCwd, runtime),
      exists: false,
    }));
    for (const entry of entries) {
      entry.exists = existsSync(entry.path);
    }

    if (!force) {
      const conflicts = entries.filter((e) => e.exists).map((e) => `'${e.path}'`);
      if (conflicts.length > 0) {
        const msg =
          conflicts.length === 1
            ? `manifest already exists: ${conflicts[0]} (use --force to overwrite)`
            : `manifests already exist: ${conflicts.join(", ")} (use --force to overwrite)`;
        return useJson ? errJson(CMD, "MANIFEST_EXISTS", msg) : errText(`ui: ${msg}\n`);
      }
    }

    const manifests: {
      runtime: Runtime;
      path: string;
      written: boolean;
      replaced: boolean;
    }[] = [];

    for (const entry of entries) {
      const manifest = buildManifest({
        runtime: entry.runtime,
        binaryPath,
        knowledgePath,
        now: () => new Date(),
      });

      try {
        mkdirSync(dirname(entry.path), { recursive: true });
        writeFileSync(entry.path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      } catch (e) {
        const msg = `cannot write '${entry.path}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
      }

      manifests.push({ runtime: entry.runtime, path: entry.path, written: true, replaced: entry.exists });
    }

    if (useJson) {
      return okJson(CMD, { manifests });
    }

    const lines = manifests.map((m) => `stub manifest written: ${m.path}`).join("\n");
    return { exitCode: 0, stderr: lines + "\n" };
  },
};
