/**
 * Markup source resolution for `ui registry register --markup <file|->`.
 *
 * The stdin half lives in `stdin-reader.ts` (shared with other commands).
 * This module re-exports `StdinReader` + `makeNodeStdinReader` for callers
 * that imported them directly from here before the extraction.
 */
import { readFileSync } from "node:fs";
import { RegistryError } from "./registry-store.js";
export type { StdinReader } from "./stdin-reader.js";
export { makeNodeStdinReader } from "./stdin-reader.js";
import { readAllStdin } from "./stdin-reader.js";
import type { StdinReader } from "./stdin-reader.js";

/**
 * Read markup from a file path or from stdin when `markupArg === "-"`.
 *
 * @param markupArg   The `--markup` flag value: a file path or `"-"`.
 * @param stdinReader Injection seam (defaults to real stdin). Only used for `"-"`.
 */
export function readMarkup(
  markupArg: string,
  stdinReader?: StdinReader,
): string {
  if (markupArg === "-") {
    try {
      return readAllStdin(stdinReader);
    } catch (e) {
      throw new RegistryError(
        "READ_ERROR",
        `cannot read markup from stdin: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  try {
    return readFileSync(markupArg, "utf8");
  } catch (e) {
    const isNotFound =
      e instanceof Error && "code" in e && (e as NodeJS.ErrnoException).code === "ENOENT";
    if (isNotFound) {
      throw new RegistryError("FILE_NOT_FOUND", `markup file not found: '${markupArg}'`);
    }
    throw new RegistryError(
      "READ_ERROR",
      `cannot read markup file '${markupArg}': ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
