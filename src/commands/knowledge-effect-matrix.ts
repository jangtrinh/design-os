/**
 * `ui knowledge effect-matrix` — the IO half of the Canvas UI Art II emitter
 * pair (the pure core is src/core/knowledge-effect-matrix-emit.ts). Split out
 * of src/commands/knowledge.ts (Art IX — that module was already over the
 * 200-line ceiling) so knowledge.ts keeps only `check`'s IO and dispatch.
 * Reads knowledge/canvas-ui/catalog.json — inside the tree `knowledge check`
 * already walks, never a `references/` probe (B10) — and prints to stdout.
 * Never writes into knowledge/canvas-effect-direction.md (it would clobber
 * the hand-written prose cells).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { emitEffectMatrix } from "../core/knowledge-effect-matrix-emit.js";

/** `ui knowledge effect-matrix` — read knowledge/canvas-ui/catalog.json, print the emitted matrix. */
export function runEffectMatrix(parsed: ParsedArgs): CommandResult {
  const sub = "knowledge effect-matrix";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["dir"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const repoRoot = typeof parsed.flags["dir"] === "string" ? resolve(parsed.flags["dir"]) : process.cwd();
  const ledgerPath = join(repoRoot, "knowledge", "canvas-ui", "catalog.json");
  if (!existsSync(ledgerPath)) {
    return err("NO_LEDGER", `no knowledge/canvas-ui/catalog.json under '${repoRoot}'`);
  }

  let raw: string;
  try {
    raw = readFileSync(ledgerPath, "utf8");
  } catch (e) {
    return err("READ_ERROR", `cannot read '${ledgerPath}': ${e instanceof Error ? e.message : String(e)}`);
  }

  // Extract `captured` up front for the emitter's opts; a parse failure here is
  // harmless — the emitter re-validates the whole shape and reports BAD_LEDGER.
  let captured = "";
  try {
    const parsedJson = JSON.parse(raw) as { captured?: unknown };
    if (typeof parsedJson.captured === "string") captured = parsedJson.captured;
  } catch { /* emitter reports BAD_LEDGER */ }

  const result = emitEffectMatrix(raw, { captured });
  if (!result.ok) return err(result.code, result.message);

  if (useJson) return okJson(sub, { markdown: result.markdown });
  return ok(result.markdown);
}
