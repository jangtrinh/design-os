/**
 * Optional-input file reads for `ui ds guidelines` — the only fs access besides the pack write.
 * An absent file is `{ path }` with no text (the pack records it under skippedSources);
 * a file that exists but cannot be read is a READ_ERROR.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { GuidelinesInputError, PACK_MANIFEST_NAME } from "../core/ds-guidelines-model.js";
import type { ExistingPack, OptionalInput, PackInputs } from "../core/ds-guidelines-model.js";
import { ORPHANS_FILE } from "../core/ds-guidelines-slots.js";

const posix = (p: string): string => p.split("\\").join("/");

/** Project-relative POSIX path, or the absolute path when the file lives outside the project. */
function displayPath(projectDir: string, abs: string): string {
  const rel = relative(projectDir, abs);
  return rel.startsWith("..") || isAbsolute(rel) ? posix(abs) : posix(rel);
}

function readOptional(projectDir: string, abs: string): OptionalInput {
  const path = displayPath(projectDir, abs);
  if (!existsSync(abs)) return { path };
  try {
    return { path, text: readFileSync(abs, "utf8") };
  } catch (e) {
    throw new GuidelinesInputError("READ_ERROR", `cannot read '${path}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** `rulingsFlag` (--rulings) overrides the default `design/knowledge/rulings.json`. */
export function readPackInputs(projectDir: string, designDir: string, rulingsFlag: string | undefined): PackInputs {
  const rulingsAbs = rulingsFlag !== undefined ? resolve(rulingsFlag) : join(designDir, "knowledge", "rulings.json");
  return {
    rulings: readOptional(projectDir, rulingsAbs),
    context: readOptional(projectDir, join(projectDir, "CONTEXT.md")),
    glossary: readOptional(projectDir, join(projectDir, "ontology", "glossary.yaml")),
    conventions: readOptional(projectDir, join(projectDir, "CONVENTIONS.md")),
    soul: readOptional(projectDir, join(designDir, "soul.md")),
  };
}

/** The `files[].path` list of the pack's own manifest; undefined when it is missing or unreadable. */
function previousManifestPaths(packDir: string): string[] | undefined {
  const path = join(packDir, PACK_MANIFEST_NAME);
  if (!existsSync(path)) return undefined;
  try {
    const files = (JSON.parse(readFileSync(path, "utf8")) as { files?: { path?: unknown }[] }).files;
    return Array.isArray(files) ? files.flatMap((f) => (typeof f.path === "string" ? [f.path] : [])) : undefined;
  } catch {
    return undefined;
  }
}

/** The pack already on disk (if any): its markdown files and orphans file, for answer preservation. */
export function readExistingPack(packDir: string): ExistingPack {
  if (!existsSync(packDir)) return { files: [] };
  try {
    const files = readdirSync(packDir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => posix(relative(packDir, join(e.parentPath, e.name))))
      .filter((p) => p !== ORPHANS_FILE)
      .sort()
      .map((path) => ({ path, text: readFileSync(join(packDir, path), "utf8") }));
    const allPaths = listFilesIn(packDir);
    const orphansPath = join(packDir, ORPHANS_FILE);
    const listed = previousManifestPaths(packDir);
    return {
      files, allPaths,
      ...(listed !== undefined ? { listed } : {}),
      ...(existsSync(orphansPath) ? { orphansText: readFileSync(orphansPath, "utf8") } : {}),
    };
  } catch (e) {
    throw new GuidelinesInputError("READ_ERROR", `cannot read the existing pack at '${packDir}': ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** Every file under `dir` (any extension), `dir`-relative POSIX paths, sorted. */
export function listFilesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => posix(relative(dir, join(e.parentPath, e.name))))
    .sort();
}
