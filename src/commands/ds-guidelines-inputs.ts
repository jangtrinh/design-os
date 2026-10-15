/**
 * Optional-input file reads for `ui ds guidelines` — the only fs access besides the pack write.
 * An absent file is `{ path }` with no text (the pack records it under skippedSources);
 * a file that exists but cannot be read is a READ_ERROR.
 */
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { GuidelinesInputError } from "../core/ds-guidelines-model.js";
import type { OptionalInput, PackInputs } from "../core/ds-guidelines-model.js";

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
  return { rulings: readOptional(projectDir, rulingsAbs) };
}
