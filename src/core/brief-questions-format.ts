/**
 * Runtime adapters over `questions.json`: the AskUserQuestion payload for Claude
 * and a Markdown gap sheet for async teams. Pure — the kernel emits the questions,
 * each runtime maps them.
 */
import type { BriefQuestion, QuestionsDoc } from "./brief-questions-build.js";

/** AskUserQuestion takes at most 4 questions per call, 2–4 options each, header ≤ 12 chars. */
export const CLAUDE_MAX_QUESTIONS = 4;
export const CLAUDE_MAX_OPTIONS = 4;
export const CLAUDE_HEADER_MAX = 12;

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Returns the doc, or a message naming the first thing that is wrong with it. */
export function parseQuestionsDoc(raw: unknown): QuestionsDoc | string {
  if (!isRecord(raw) || raw["kind"] !== "brief-questions") return "not a questions file (kind must be 'brief-questions')";
  if (!Array.isArray(raw["questions"])) return "questions must be an array";
  for (const [i, q] of raw["questions"].entries()) {
    if (!isRecord(q) || typeof q["question"] !== "string" || typeof q["header"] !== "string" || typeof q["field"] !== "string") {
      return `questions[${i}] needs field, header and question strings`;
    }
    const options = q["options"];
    if (!Array.isArray(options) || options.length < 2 || !options.every((o) => isRecord(o) && typeof o["label"] === "string" && typeof o["description"] === "string")) {
      return `questions[${i}] needs at least 2 options with label and description`;
    }
  }
  return raw as unknown as QuestionsDoc;
}

/** Recommended first, tagged "(Recommended)"; capped at 4 options without ever dropping the recommended one. */
function claudeOptions(q: BriefQuestion): { label: string; description: string }[] {
  const rec = q.options.filter((o) => o.label === q.recommended);
  const rest = q.options.filter((o) => o.label !== q.recommended);
  return [...rec.map((o) => ({ label: `${o.label} (Recommended)`, description: o.description })), ...rest].slice(0, CLAUDE_MAX_OPTIONS);
}

export function toClaudePayload(doc: QuestionsDoc): { questions: unknown[]; remaining: number; remainingIds: string[] } {
  const head = doc.questions.slice(0, CLAUDE_MAX_QUESTIONS);
  const tail = doc.questions.slice(CLAUDE_MAX_QUESTIONS);
  return {
    questions: head.map((q) => ({ question: q.question, header: q.header.slice(0, CLAUDE_HEADER_MAX), multiSelect: false, options: claudeOptions(q) })),
    remaining: tail.length,
    remainingIds: tail.map((q) => q.id),
  };
}

export function toGapSheet(doc: QuestionsDoc): string {
  const d = doc.d4;
  const lines = [
    "# Brief gap sheet", "",
    `Surface: ${doc.surface} · Decision: ${d.decision} (B=${d.B}, R=${d.R ? "yes" : "no"}, L=${d.L})`, "",
    doc.questions.length === 0 ? "No open questions." : "Answer each question, then return this sheet to the design owner.", "",
  ];
  for (const q of doc.questions) {
    lines.push(`## ${q.id} · ${q.field}${q.routeChanging ? " (changes the route)" : ""}`, "", q.question, "");
    for (const o of q.options) lines.push(`- [ ] ${o.label}${o.label === q.recommended ? " (Recommended)" : ""} — ${o.description}`);
    if (q.recommendedReason !== undefined) lines.push("", `Default derived from: ${q.recommendedReason}`);
    lines.push("", "Answer: ", "");
  }
  return `${lines.join("\n")}\n`;
}
