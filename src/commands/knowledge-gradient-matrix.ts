/**
 * `ui knowledge gradient-matrix` — the IO half of the ShaderGradient Art II
 * emitter pair (the pure core is src/core/knowledge-gradient-matrix-emit.ts).
 * A sibling of knowledge-effect-matrix.ts, kept as its own module for the same
 * Art IX reason: src/commands/knowledge.ts is already over the line ceiling.
 *
 * Reads knowledge/shader-gradient/catalog.json — inside the tree
 * `knowledge check` already walks — and prints to stdout. Never writes into
 * knowledge/shader-gradient-direction.md (it would clobber the hand-written
 * prose cells, which are the only cells that carry refusal and fallback).
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { errJson, errText, ok, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { emitGradientMatrix } from "../core/knowledge-gradient-matrix-emit.js";

/** `ui knowledge gradient-matrix` — read the gradient ledger, print the emitted matrix. */
export function runGradientMatrix(parsed: ParsedArgs): CommandResult {
  const sub = "knowledge gradient-matrix";
  const useJson = parsed.json;
  const err = (code: string, msg: string): CommandResult =>
    useJson ? errJson(sub, code, msg) : errText(`ui: ${msg}\n`);

  const unknown = findUnknownFlag(parsed.flags, ["dir"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));

  const repoRoot = typeof parsed.flags["dir"] === "string" ? resolve(parsed.flags["dir"]) : process.cwd();
  const ledgerPath = join(repoRoot, "knowledge", "shader-gradient", "catalog.json");
  if (!existsSync(ledgerPath)) {
    return err("NO_LEDGER", `no knowledge/shader-gradient/catalog.json under '${repoRoot}'`);
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

  const result = emitGradientMatrix(raw, { captured });
  if (!result.ok) return err(result.code, result.message);

  if (useJson) return okJson(sub, { markdown: result.markdown });
  return ok(result.markdown);
}
