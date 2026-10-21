/**
 * Optional-input file reads for `ui ds guidelines` — the only fs access besides the pack write.
 * An absent file is `{ path }` with no text (the pack records it under skippedSources);
 * a file that exists but cannot be read is a READ_ERROR.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { ANSWERS_FILE, parseAnswersStore } from "../core/ds-guidelines-answers.js";
import { GuidelinesInputError } from "../core/ds-guidelines-model.js";
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

/**
 * The pack already on disk (if any): EVERY markdown file in the folder (listed by the last manifest or
 * not), the orphans file and the answers store, all of which feed answer preservation. A malformed store
 * is BAD_ANSWERS_STORE: it is never silently replaced, because it may hold the only copy of an answer.
 */
export function readExistingPack(packDir: string): ExistingPack {
  if (!existsSync(packDir)) return { files: [] };
  let existing: ExistingPack;
  let storeText: string | undefined;
  try {
    const files = readdirSync(packDir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => posix(relative(packDir, join(e.parentPath, e.name))))
      .filter((p) => p !== ORPHANS_FILE)
      .sort()
      .map((path) => ({ path, text: readFileSync(join(packDir, path), "utf8") }));
    const orphansPath = join(packDir, ORPHANS_FILE);
    const storePath = join(packDir, ANSWERS_FILE);
    existing = { files, allPaths: listFilesIn(packDir), ...(existsSync(orphansPath) ? { orphansText: readFileSync(orphansPath, "utf8") } : {}) };
    storeText = existsSync(storePath) ? readFileSync(storePath, "utf8") : undefined;
  } catch (e) {
    throw new GuidelinesInputError("READ_ERROR", `cannot read the existing pack at '${packDir}': ${e instanceof Error ? e.message : String(e)}`);
  }
  return storeText === undefined ? existing : { ...existing, store: parseAnswersStore(storeText) };
}

/** Every file under `dir` (any extension), `dir`-relative POSIX paths, sorted. */
export function listFilesIn(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => posix(relative(dir, join(e.parentPath, e.name))))
    .sort();
}
