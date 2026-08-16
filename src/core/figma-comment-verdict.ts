/**
 * Read the owner's verdict off a thread WE authored (spec: figma comment triage).
 *
 * Pure transform (Art. I). No network, no model.
 *
 * WHY THIS EXISTS. Measured on a live run of 49 tasks: 8 reached a state where the task
 * ledger said `done`, the Figma thread said `resolved`, and the reply inside said the
 * opposite — one task shipped the exact inverse of its requirement. Separately, 7 of 26
 * handoff threads were resolved with **no reply at all** and were read as acceptance: a 27%
 * base rate of manufacturing consent.
 *
 * The root cause is that completion was derivable from the implementer. It should not be.
 * Completion is something the owner says, and this module is the only place that reads it.
 *
 * Silence is therefore its own verdict. `resolved_at` does not mean finished — from a
 * reviewer it means "my request is satisfied", but from someone answering in their own
 * thread it means only "I have read this".
 */

import type { CommentThread } from "./figma-comment-types.js";

export type Verdict =
  | "accepted" // an unqualified acknowledgement
  | "conditional" // accepted with a caveat, or carrying a new instruction
  | "reversed" // the requirement itself was withdrawn or inverted
  | "silent"; // resolved with nothing said — NOT acceptance

export interface ThreadVerdict {
  verdict: Verdict;
  /** Verbatim reply the verdict was read from; empty for `silent`. */
  evidence: string;
  author: string;
  at: string;
}

/**
 * Bare acknowledgements. Anchored to the WHOLE string on purpose: "Done." is acceptance,
 * "Done. Có manual adjust cần scan lại." is not, and the difference is an entire task.
 */
const ACK =
  /^\s*(done|ok|oke|okay|yes|fine|good|vâng|dạ|ừ|uh|thanks|cảm ơn|đã sửa|đã xong|noted|updated|fixed|ok nhé|ổn)\s*[.!,]*\s*$/i;

/**
 * Markers that withdraw or invert a requirement rather than qualify it.
 *
 * Vietnamese-first because that is the corpus these were derived from. Widening this list
 * without new data would be guessing, and a missed marker degrades to `conditional` — which
 * is the safe direction.
 */
const REVERSAL =
  /(không cần|ko cần|bỏ đi|bỏ luôn|chỉ cần|thay vì|không dùng|ko dùng|không phải|hủy|huỷ|revert|instead of|no longer|don'?t need|not needed|remove it)/i;

/**
 * Classify the latest word on a thread we posted.
 *
 * Returns `null` when the thread is not ours — a reviewer's own request has no verdict to
 * read, and inventing one would be the same category error this module exists to prevent.
 *
 * `authoredBy` is supplied by the caller rather than inferred: the kernel cannot ask Figma
 * who the token belongs to, and guessing an identity is worse than requiring one.
 */
export function classifyVerdict(thread: CommentThread, authoredBy: string): ThreadVerdict | null {
  if (!authoredBy || thread.author !== authoredBy) return null;

  const replies = thread.replies;
  if (replies.length === 0) {
    // The whole point. A resolved thread with nothing said is unanswered, not agreed.
    return { verdict: "silent", evidence: "", author: "", at: "" };
  }

  const last = replies[replies.length - 1];
  if (last === undefined) return { verdict: "silent", evidence: "", author: "", at: "" };

  const text = last.message.trim();
  const base = { evidence: text, author: last.author, at: last.createdAt };

  if (ACK.test(text)) return { verdict: "accepted", ...base };
  if (REVERSAL.test(text)) return { verdict: "reversed", ...base };

  // Everything else is a caveat or a new instruction. Bias here is deliberate: a wrong
  // `conditional` costs one question, a wrong `accepted` ships a defect.
  return { verdict: "conditional", ...base };
}

export interface VerdictStats {
  accepted: number;
  conditional: number;
  reversed: number;
  /** Resolved with no reply. Surfaced separately because it reads as success and is not. */
  silent: number;
  /** conditional + reversed + silent — everything that is not a clean yes. */
  awaitingVerdict: number;
}

export function summariseVerdicts(verdicts: readonly (ThreadVerdict | null)[]): VerdictStats {
  const s: VerdictStats = { accepted: 0, conditional: 0, reversed: 0, silent: 0, awaitingVerdict: 0 };
  for (const v of verdicts) {
    if (!v) continue;
    s[v.verdict] += 1;
  }
  s.awaitingVerdict = s.conditional + s.reversed + s.silent;
  return s;
}
