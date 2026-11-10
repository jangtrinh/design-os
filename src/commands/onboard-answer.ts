/**
 * `ui onboard answer --file <answers.json>` — records the owner's choices as rulings (FR-005). The host asks the
 * owner; this command only records: no interactive mode, no TTY. The clock is read here, in the command layer only,
 * as the default of `--now`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { validLessonTimestamp } from "../core/memory-lessons.js";
import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import { validateAnswers } from "../core/owner-rulings/answer-validator.js";
import type { KindEmitter } from "../core/owner-rulings/kind-emitter.js";
import { PendingStoreError, readPending, syncPending } from "../core/owner-rulings/pending-store.js";
import { computeRulingState } from "../core/owner-rulings/ruling-state.js";
import { appendRulings, readRulingStore, RulingStoreError } from "../core/owner-rulings/ruling-store.js";

const SUB = "onboard answer";

/** `emitters` defaults to the registry; only an in-process caller (a test) can pass another list. */
export function runOnboardAnswer(parsed: ParsedArgs, defaultCwd: string, emitters?: readonly KindEmitter[]): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["cwd", "file", "now"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const file = parsed.flags["file"];
  if (typeof file !== "string") return err("BAD_ARG", "ui onboard answer requires --file <answers.json>");
  const nowFlag = parsed.flags["now"];
  if (nowFlag !== undefined && !validLessonTimestamp(nowFlag)) {
    return err("BAD_ARG", `--now expected a UTC ISO-8601 instant such as 2026-11-10T14:00:00Z, got '${String(nowFlag)}'`);
  }
  const now = nowFlag === undefined ? new Date().toISOString() : nowFlag;
  const cwd = typeof parsed.flags["cwd"] === "string" ? parsed.flags["cwd"] : defaultCwd;

  let raw: unknown;
  try { raw = JSON.parse(readFileSync(resolve(file), "utf8")); }
  catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return err(missing ? "FILE_NOT_FOUND" : "BAD_ANSWER", missing ? `cannot read '${file}'` : `'${file}' is not valid JSON`);
  }

  let pending;
  let stored;
  try { pending = readPending(cwd).clusters; stored = readRulingStore(cwd).rulings; }
  catch (e) {
    if (e instanceof PendingStoreError || e instanceof RulingStoreError) return err(e.code, e.message);
    throw e;
  }
  // Run the detectors once, before anything is validated or written: a broken detector ends the command here, with the
  // manifest and the pending file untouched. What it finds also tells how many questions remain once the answers are in.
  let detected;
  try { detected = computeRulingState(cwd, emitters === undefined ? {} : { emitters }); }
  catch (e) {
    if (e instanceof RulingStoreError || e instanceof PendingStoreError) return err(e.code, e.message);
    throw e;
  }
  const verdict = validateAnswers(pending, raw, now, stored, emitters);
  if (!verdict.ok) return err(verdict.code, verdict.message);

  try { appendRulings(cwd, verdict.rulings); }
  catch (e) { return err(e instanceof RulingStoreError ? e.code : "WRITE_ERROR", e instanceof Error ? e.message : "cannot write design/design-dir.json"); }
  const answered = new Set(verdict.answered.map((c) => c.fingerprint));
  try {
    syncPending(cwd, pending.filter((c) => !answered.has(c.fingerprint)));
  }
  catch { return err("WRITE_ERROR", "rulings were recorded but .design-os/onboard/pending.json could not be updated; it is transient and safe to delete"); }

  const remaining = detected.pending.filter((c) => !answered.has(c.fingerprint)).length;
  const summaries = verdict.rulings.map((r) => `${r.kind}: ${Array.isArray(r.choice) ? r.choice.join(", ") : r.choice} (${r.covers.length} covered, ${r.at})`);
  if (parsed.json) {
    return okJson(SUB, { recorded: verdict.rulings.map((r) => ({ kind: r.kind, fingerprint: r.fingerprint, choice: r.choice, covered: r.covers.length })), remaining, summaries });
  }
  const next = remaining > 0 ? "next: ui onboard questions" : "no questions remain; re-run the command that was blocked";
  return { exitCode: 0, stdout: `recorded ${verdict.rulings.length} ruling(s) in design/design-dir.json\n${summaries.map((s) => `  ${s}`).join("\n")}\n${remaining} question(s) remain — ${next}\n` };
}
