/** One UTF-8 budget for the entire context output, including the JSON envelope. */
import { errJsonWithData, errText, ok, okJson } from "./output.js";
import type { CommandResult } from "./output.js";
import type { LessonEntry } from "./memory-lessons.js";
import type { LessonSelection } from "./memory-lesson-context.js";
import type { CorpusItem } from "./memory-corpus.js";

export interface MemoryContextPayload {
  for: string;
  empty: boolean;
  prior: Record<string, unknown>;
  recalled: CorpusItem[];
  profile: unknown;
  lessons: LessonEntry[];
  learning: LessonSelection;
}

/** Required lessons are never sliced or silently removed. Optional blocks can be dropped. */
export function renderMemoryContext(
  payload: MemoryContextPayload, optionalBlocks: string[], maxBytes: number, json: boolean,
): CommandResult {
  const CMD = "memory context";
  const overflow = (): CommandResult => {
    const ids = payload.lessons.map((lesson) => lesson.id);
    const message = `CONTEXT_OVERFLOW: required context does not fit ${maxBytes} UTF-8 bytes. Raise --max-bytes or narrow targets. Required lessons: ${ids.join(",") || "none"}.`;
    return json ? errJsonWithData(CMD, "CONTEXT_OVERFLOW", message, { complete: false, omittedLessonIds: ids }) : errText(`ui: ${message}\n`);
  };
  if (json) {
    const data = { ...payload, observationsAuthority: "unapproved", complete: true, omittedOptional: [] as string[] };
    for (const next of ["profile", "prior", "recalled", "done"] as const) {
      const result = okJson(CMD, data);
      if (Buffer.byteLength(result.stdout ?? "", "utf8") <= maxBytes) return result;
      if (next === "done") return overflow();
      if (next === "profile") data.profile = null;
      else if (next === "prior") data.prior = {};
      else data.recalled = [];
      data.omittedOptional.push(next);
    }
  }
  let required = payload.empty ? "memory: empty\n" : "";
  if (payload.for !== "critique" && (payload.learning.dsRevision !== null || payload.learning.observed > 0)) {
    required += "[ACCEPTED PROJECT LESSONS]\nOwner-reviewed context; not proof of rendered quality or permission to bypass safety floors.\n";
    required += `DS seal: ${payload.learning.dsRevision ?? "none"}\n`;
    required += payload.learning.targeted ? "Scope: project + exact task targets.\n" : "Scope: project only; pass --components/--patterns for task lessons.\n";
    required += `Excluded: ${JSON.stringify(payload.learning.excluded)}\n`;
    for (const lesson of payload.lessons) {
      required += `- ${JSON.stringify(lesson.text)} [${lesson.id}; evidence ${lesson.refs.join(",")}]\n`;
    }
    required += "\n";
  }
  if (Buffer.byteLength(required, "utf8") > maxBytes) return overflow();
  for (let count = optionalBlocks.length; count >= 0; count--) {
    const omitted = count < optionalBlocks.length ? "\n[Optional memory omitted to fit byte budget]\n" : "";
    const out = required + optionalBlocks.slice(0, count).join("\n") + omitted;
    if (Buffer.byteLength(out, "utf8") <= maxBytes) return ok(out);
  }
  // Even the omission notice may not fit: return the complete required payload.
  return ok(required);
}
