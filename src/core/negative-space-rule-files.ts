/**
 * negative-space-rule-files.ts - paths and plain I/O for the two adherence rule files the harvest touches:
 * `_adherence.rules.json` (binding, written only by `--accept`) and `_adherence.proposed.json`.
 * Writes go through a temp file and a rename so a reader never sees half a file.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { parseAdherenceRules } from "./adherence-rules.js";
import type { LoadedRule } from "./adherence-rules.js";
import { DSError } from "./design-system.js";

const rulesDir = (designDir: string): string => join(designDir, "rules");
export const bindingRulesPath = (designDir: string): string => join(rulesDir(designDir), "_adherence.rules.json");
export const proposedRulesPath = (designDir: string): string => join(rulesDir(designDir), "_adherence.proposed.json");

/** Write through a temp file and a rename; the temp file is removed when the write fails. */
export function atomicWrite(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  try { writeFileSync(tmp, text, "utf8"); renameSync(tmp, path); }
  catch (e) { rmSync(tmp, { force: true }); throw e; }
}
export const readIfPresent = (path: string): string | undefined => {
  if (!existsSync(path)) return undefined;
  try { return readFileSync(path, "utf8"); }
  catch (e) { throw new DSError("READ_ERROR", `cannot read ${path}: ${e instanceof Error ? e.message : String(e)}`); }
};
export const loadFile = (path: string, origin: "binding" | "proposed"): LoadedRule[] => {
  const text = readIfPresent(path);
  return text === undefined ? [] : parseAdherenceRules(text, path, origin);
};
export const dumpRules = (rules: readonly unknown[]): string => `${JSON.stringify({ rules }, null, 2)}\n`;
