/**
 * Builds `questions.json` from the blocking fields of a brief: one question per
 * blocking field, route-changing questions first, otherwise in blocking order.
 * A recommended default appears only when a rule can derive it.
 */
import { deriveCopyLanguage } from "./brief-copy-language.js";
import type { BlockingField, BriefRecord, D4Receipt } from "./brief-rules.js";

export interface QuestionOption { label: string; description: string }

export interface BriefQuestion {
  id: string;
  field: string;
  header: string;
  question: string;
  routeChanging: boolean;
  /** Label of the option a rule derived as default, or null when no rule can. */
  recommended: string | null;
  recommendedReason?: string;
  options: QuestionOption[];
}

export interface QuestionsDoc {
  kind: "brief-questions";
  version: 1;
  surface: string;
  d4: D4Receipt;
  questions: BriefQuestion[];
}

const ANSWER_NOW: QuestionOption = { label: "Answer now", description: "Give the value; it is recorded as verified" };
const ASSUME: QuestionOption = { label: "Assume and label it", description: "Continue on a labelled assumption at low confidence" };
const CANONICAL_STATES = "empty, loading, error, full";

const LANGUAGE_OPTIONS: Record<string, QuestionOption> = {
  en: { label: "English", description: "All UI copy in English" },
  vi: { label: "Vietnamese", description: "All UI copy in Vietnamese" },
  mixed: { label: "Mixed", description: "English UI chrome, Vietnamese content" },
};

function headerOf(field: string): string {
  if (field.startsWith("assumption:")) return field.slice("assumption:".length).slice(0, 12);
  if (field === "status.transitions") return "Transitions";
  if (field.endsWith(".states")) return "States";
  return field === "copyLanguage" ? "Language" : field.charAt(0).toUpperCase() + field.slice(1);
}

function shape(b: BlockingField, brief: BriefRecord): Omit<BriefQuestion, "id" | "field" | "header" | "routeChanging"> {
  if (b.field === "copyLanguage") {
    const { language, reason } = deriveCopyLanguage(String(brief["rawRequest"]));
    return {
      question: "Which language should the UI copy use?",
      recommended: LANGUAGE_OPTIONS[language]!.label,
      recommendedReason: reason,
      options: Object.values(LANGUAGE_OPTIONS),
    };
  }
  if (b.field === "status.transitions") {
    const states = (((brief["status"] as BriefRecord | undefined)?.["states"] ?? []) as unknown[]).map(String).join(", ");
    return { question: `Which transitions exist between ${states}?`, recommended: null, options: [ANSWER_NOW, ASSUME] };
  }
  if (b.field.endsWith(".states")) {
    const canonical = { label: CANONICAL_STATES, description: "The four states every data screen carries" };
    return {
      question: `Which states does ${b.field.slice(0, -".states".length)} need?`,
      recommended: canonical.label,
      recommendedReason: "rule: a data screen carries empty, loading, error and full",
      options: [canonical, { label: "full only", description: "A static screen with no data states" }, { label: "all six", description: "Adds partial and permission-denied" }],
    };
  }
  if (b.field.startsWith("assumption:")) {
    const facet = b.field.slice("assumption:".length);
    const a = (Array.isArray(brief["assumptions"]) ? brief["assumptions"] : []).find((x) => (x as BriefRecord)["facet"] === facet) as BriefRecord | undefined;
    return {
      question: `What is the answer for '${facet}'? Current value: ${String(a?.["value"] ?? "(none)")}`,
      recommended: null,
      options: [{ label: "Confirm current value", description: "Keep the value and mark it verified" }, ANSWER_NOW, ASSUME],
    };
  }
  return { question: `${b.reason}. What should ${b.field} be?`, recommended: null, options: [ANSWER_NOW, ASSUME] };
}

export function buildQuestions(brief: BriefRecord, blocking: BlockingField[], d4: D4Receipt): QuestionsDoc {
  const ordered = [...blocking.filter((b) => b.routeChanging), ...blocking.filter((b) => !b.routeChanging)];
  const questions = ordered.map((b, i): BriefQuestion => ({
    id: `q${i + 1}`, field: b.field, header: headerOf(b.field), routeChanging: b.routeChanging, ...shape(b, brief),
  }));
  return { kind: "brief-questions", version: 1, surface: String(brief["surface"]), d4, questions };
}
