/**
 * Runtime adapters over `questions.json`: the AskUserQuestion payload for Claude
 * and a Markdown gap sheet for async teams. Pure — the kernel emits the questions,
 * each runtime maps them.
 */
import type { QuestionsDoc } from "./brief-questions-build.js";

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

/** A question in the runtime-neutral shape both `ui brief questions` and `ui onboard questions` format. */
export interface FormatOption { label: string; description: string; recommended?: boolean }
export interface FormatQuestion { id: string; header: string; question: string; multiSelect: boolean; options: FormatOption[] }

/** Recommended first, tagged "(Recommended)"; capped at 4 options without ever dropping a recommended one. */
export function formatClaudeOptions(options: FormatOption[]): { label: string; description: string }[] {
  const rec = options.filter((o) => o.recommended === true);
  const rest = options.filter((o) => o.recommended !== true);
  return [...rec.map((o) => ({ label: `${o.label} (Recommended)`, description: o.description })), ...rest.map((o) => ({ label: o.label, description: o.description }))].slice(0, CLAUDE_MAX_OPTIONS);
}

/** The AskUserQuestion payload: at most 4 questions, the rest counted and named in `remaining`. */
export function toClaudeQuestionPayload(all: FormatQuestion[]): { questions: unknown[]; remaining: number; remainingIds: string[] } {
  const head = all.slice(0, CLAUDE_MAX_QUESTIONS);
  const tail = all.slice(CLAUDE_MAX_QUESTIONS);
  return {
    questions: head.map((q) => ({ question: q.question, header: q.header.slice(0, CLAUDE_HEADER_MAX), multiSelect: q.multiSelect, options: formatClaudeOptions(q.options) })),
    remaining: tail.length,
    remainingIds: tail.map((q) => q.id),
  };
}

export function toClaudePayload(doc: QuestionsDoc): { questions: unknown[]; remaining: number; remainingIds: string[] } {
  return toClaudeQuestionPayload(doc.questions.map((q) => ({
    id: q.id, header: q.header, question: q.question, multiSelect: false,
    options: q.options.map((o) => ({ label: o.label, description: o.description, recommended: o.label === q.recommended })),
  })));
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
