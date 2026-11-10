/**
 * `ui onboard answer --file <answers.json>` — records the owner's choices as rulings (FR-005). The host asks the
 * owner; this command only records (Art I: no interactive mode, no TTY, no clock but `--now`).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { validateAnswers } from "../core/owner-rulings/answer-validator.js";
import { readPending, writePending } from "../core/owner-rulings/pending-store.js";
import { appendRulings, RulingStoreError } from "../core/owner-rulings/ruling-store.js";
import { computeRulingState } from "../core/owner-rulings/ruling-state.js";

const SUB = "onboard answer";
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function runOnboardAnswer(parsed: ParsedArgs, defaultCwd: string): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["cwd", "file", "now"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.flags["file"];
  if (typeof file !== "string") return err("BAD_ARG", "ui onboard answer requires --file <answers.json>");
  const now = parsed.flags["now"];
  if (typeof now !== "string" || !ISO.test(now) || Number.isNaN(Date.parse(now))) {
    return err("BAD_ARG", "ui onboard answer requires --now <ISO-8601 timestamp>: the kernel reads no clock");
  }
  const cwd = typeof parsed.flags["cwd"] === "string" ? parsed.flags["cwd"] : defaultCwd;

  let raw: unknown;
  try { raw = JSON.parse(readFileSync(resolve(file), "utf8")); }
  catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return err(missing ? "FILE_NOT_FOUND" : "BAD_ANSWER", missing ? `cannot read '${file}'` : `'${file}' is not valid JSON`);
  }

  const pending = readPending(cwd).clusters;
  const verdict = validateAnswers(pending, raw, now);
  if (!verdict.ok) return err(verdict.code, verdict.message);

  try { appendRulings(cwd, verdict.rulings); }
  catch (e) { return err(e instanceof RulingStoreError ? e.code : "WRITE_ERROR", e instanceof Error ? e.message : "cannot write design/design-dir.json"); }
  const answered = new Set(verdict.answered.map((c) => c.fingerprint));
  try { writePending(cwd, pending.filter((c) => !answered.has(c.fingerprint)), 1); }
  catch { return err("WRITE_ERROR", "rulings were recorded but .design-os/onboard/pending.json could not be updated; it is transient and safe to delete"); }

  const remaining = computeRulingState(cwd).pending.length;
  const summaries = verdict.rulings.map((r) => `${r.kind}: ${Array.isArray(r.choice) ? r.choice.join(", ") : r.choice} (${r.covers.length} covered, ${r.at})`);
  if (parsed.json) {
    return okJson(SUB, { recorded: verdict.rulings.map((r) => ({ kind: r.kind, fingerprint: r.fingerprint, choice: r.choice, covered: r.covers.length })), remaining, summaries });
  }
  const next = remaining > 0 ? "next: ui onboard questions" : "no questions remain; re-run the command that was blocked";
  return { exitCode: 0, stdout: `recorded ${verdict.rulings.length} ruling(s) in design/design-dir.json\n${summaries.map((s) => `  ${s}`).join("\n")}\n${remaining} question(s) remain — ${next}\n` };
}
