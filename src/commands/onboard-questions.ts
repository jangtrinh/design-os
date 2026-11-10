/**
 * `ui onboard questions` — the writer of the project-level clusters (FR-004, CD-12). It detects them, merges them
 * with what blocked commands left in pending.json, drops what the stored rulings already govern, writes the file and
 * prints the open questions in the requested format.
 */
import type { ParsedArgs } from "../core/cli-args.js";
import { findUnknownFlag, unknownFlagMessage } from "../core/flag-guard.js";
import { errJson, errText, okJson } from "../core/output.js";
import type { CommandResult } from "../core/output.js";
import type { KindEmitter } from "../core/owner-rulings/kind-emitter.js";
import { PendingStoreError, writePending } from "../core/owner-rulings/pending-store.js";
import { CLUSTER_KIND_TABLE } from "../core/owner-rulings/cluster-kinds.js";
import { orderClusters, PER_MEMBER_ANSWER_NOTE, roundCount, toOwnerClaudePayload, toOwnerMarkdown } from "../core/owner-rulings/questions-format.js";
import { computeRulingState } from "../core/owner-rulings/ruling-state.js";
import { RulingStoreError } from "../core/owner-rulings/ruling-store.js";

const SUB = "onboard questions";
const FORMATS = ["claude", "markdown", "json"] as const;

/** `emitters` defaults to the registry; only an in-process caller (a test) can pass another list. */
export function runOnboardQuestions(parsed: ParsedArgs, defaultCwd: string, emitters?: readonly KindEmitter[]): CommandResult {
  const err = (code: string, msg: string): CommandResult => (parsed.json ? errJson(SUB, code, msg) : errText(`ui: ${msg}\n`));
  const unknown = findUnknownFlag(parsed.flags, ["cwd", "format", "round"]);
  if (unknown !== null) return err("UNKNOWN_FLAG", unknownFlagMessage(unknown));
  const cwd = typeof parsed.flags["cwd"] === "string" ? parsed.flags["cwd"] : defaultCwd;
  const format = parsed.flags["format"] ?? "json";
  if (typeof format !== "string" || !(FORMATS as readonly string[]).includes(format)) return err("BAD_ARG", `--format must be one of ${FORMATS.join("|")}`);
  const roundFlag = parsed.flags["round"];
  const round = roundFlag === undefined ? 1 : Number(roundFlag);
  if (!Number.isInteger(round) || round < 1) return err("BAD_ARG", "--round must be a positive integer");

  let state;
  try { state = computeRulingState(cwd, emitters === undefined ? {} : { emitters }); }
  catch (e) {
    // A store's own failure is reported with its code; an emitter's bug keeps its message and stack.
    if (e instanceof RulingStoreError || e instanceof PendingStoreError) return err(e.code, e.message);
    throw e;
  }
  const ordered = orderClusters(state.pending);
  if (ordered.length === 0) return err("NO_PENDING_QUESTIONS", "nothing is pending: every anomaly the kernel can detect from the project has an owner ruling");
  if (format === "claude" && round > roundCount(ordered)) return err("NO_PENDING_QUESTIONS", `round ${round} has no questions; there ${roundCount(ordered) === 1 ? "is 1 round" : `are ${roundCount(ordered)} rounds`}`);

  try { writePending(cwd, ordered, 1); }
  catch { return err("WRITE_ERROR", "cannot write .design-os/onboard/pending.json"); }

  if (format === "markdown") return { exitCode: 0, stdout: toOwnerMarkdown(ordered) };
  if (format === "claude") return { exitCode: 0, stdout: `${JSON.stringify(toOwnerClaudePayload(ordered, round), null, 2)}\n` };
  const perMember = ordered.some((c) => CLUSTER_KIND_TABLE[c.kind].setValued) ? { perMemberAnswer: PER_MEMBER_ANSWER_NOTE } : {};
  if (parsed.json) return okJson(SUB, { clusters: ordered, ...perMember, pendingPath: ".design-os/onboard/pending.json" });
  return { exitCode: 0, stdout: `${JSON.stringify({ clusters: ordered, ...perMember }, null, 2)}\n` };
}
