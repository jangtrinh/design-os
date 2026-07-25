/**
 * `ui tenant-scaffold <target>` — emit the canonical Tenant-compliant scrub-section
 * engine verbatim into a target directory.
 *
 * Fable ruling (plans/specs/embeddable-scrub-section/graduation-plan.md § ③): COPY
 * verbatim, no templating — the only parameter is the target path. Resolves the
 * templates root the same way `ui init` does (resolvePackageRoots + fileURLToPath),
 * reads the three `templates/tenant/*` files, and writes them to `<target>/`.
 *
 * The browser harness (test-tenant.mjs, a Playwright script) ships here as an
 * EMITTED ASSET, not as part of the kernel's own vitest suite — this keeps the
 * kernel itself free of a browser/Playwright dependency while still giving a
 * consumer a self-testing drop-in.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cwd as processCwd } from "node:process";

import type { ParsedArgs } from "../core/cli-args.js";
import type { CommandResult } from "../core/output.js";
import { errJson, errText, ok, okJson } from "../core/output.js";
import { resolvePackageRoots } from "../core/init-stub.js";

const CMD = "tenant-scaffold";

export const TENANT_SCAFFOLD_HELP = `ui tenant-scaffold — emit the canonical Tenant-compliant scrub-section engine

Usage:
  ui tenant-scaffold <target-dir> [--force] [--json]

Writes 3 files verbatim into <target-dir>/ (no templating — the target path is the
only parameter):
  scrub-section.js   the Tenant engine (UMD, zero deps, SSR-safe)
  scrub-section.css  the sticky-pin layout contract, namespaced under .scrub / --scrub-*
  test-tenant.mjs    Playwright assertions for the Tenant contract (dev-only harness;
                      run it yourself — it is not part of this kernel's own test suite)

Options:
  --force     Overwrite existing files at the target
  --json      Emit a JSON envelope instead of human-readable output
  -h, --help  Show this help

Error codes:
  BAD_ARG      Missing <target-dir> argument
  EXISTS       A target file already exists (use --force to overwrite)
  WRITE_ERROR  The templates root could not be resolved, or a file could not be written
`;

const SOURCE_FILES = ["scrub-section.js", "scrub-section.css", "test-tenant.mjs"] as const;

export const tenantScaffoldCommand = {
  name: CMD,
  summary: "Emit the canonical Tenant-compliant scrub-section engine verbatim into a target directory",
  hasSubcommands: false,
  help: TENANT_SCAFFOLD_HELP,

  run(parsed: ParsedArgs): CommandResult {
    const useJson = parsed.json;

    // 1. Resolve target directory from positionals[0].
    const targetArg = parsed.positionals[0];
    if (targetArg === undefined) {
      const msg = "ui tenant-scaffold requires a <target-dir> argument";
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    if (parsed.positionals.length > 1) {
      const msg = `ui tenant-scaffold takes exactly one target argument; unexpected: ${parsed.positionals.slice(1).join(", ")}`;
      return useJson ? errJson(CMD, "BAD_ARG", msg) : errText(`ui: ${msg}\n`);
    }
    const target = resolve(processCwd(), targetArg);
    const force = parsed.flags["force"] === true;

    // 2. Resolve the templates root the same way `ui init` does.
    const thisFile = fileURLToPath(import.meta.url);
    const startDir = dirname(thisFile);
    const { templatesRoot } = resolvePackageRoots(startDir);
    if (templatesRoot === null) {
      const msg = `ease-design templates not found (searched upward from ${startDir})`;
      return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
    }

    // 3. Read the three source files up front (fail before writing anything).
    const sources: Record<string, string> = {};
    for (const name of SOURCE_FILES) {
      const absSource = join(templatesRoot, "tenant", name);
      try {
        sources[name] = readFileSync(absSource, "utf8");
      } catch (e) {
        const msg = `cannot read bundled template '${absSource}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
      }
    }

    // 4. Refuse to overwrite existing files unless --force (init's safety pattern).
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

    // 5. Write phase.
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
        written.push(dest);
      } catch (e) {
        const msg = `cannot write '${dest}': ${e instanceof Error ? e.message : String(e)}`;
        return useJson ? errJson(CMD, "WRITE_ERROR", msg) : errText(`ui: ${msg}\n`);
      }
    }

    // 6. Emit result.
    if (useJson) return okJson(CMD, { target, written });
    return ok(
      `tenant-scaffold: wrote ${written.length} files to ${target}/\n` +
      written.map((p) => `  ${p}`).join("\n") + "\n" +
      "next: read the emitted test-tenant.mjs and run it with Playwright installed in your own project — it is not part of this kernel's own test suite.\n",
    );
  },
};
