/** Owner-local lesson selection. Lifecycle replay stays separate from current validity. */
import type { MemoryEvent } from "./memory-events.js";
import { compileLessons } from "./memory-lessons.js";
import type { LessonEntry } from "./memory-lessons.js";
import { loadLessonEnvironment, lessonEvidenceProblem } from "./memory-lesson-evidence.js";

export interface LessonSelection {
  dsRevision: string | null;
  targeted: boolean;
  observed: number;
  excluded: { pending: number; inactive: number; staleRevision: number; evidenceInvalid: number; outOfScope: number };
}

export function lessonTargets(raw: string | boolean | undefined): string[] {
  if (raw === undefined) return [];
  if (typeof raw !== "string") throw new Error("lesson targets must be registry names as CSV or a JSON string array");
  if (raw.trimStart().startsWith("[")) {
    let names: unknown;
    try { names = JSON.parse(raw); } catch { throw new Error("lesson targets JSON must be an array of nonempty exact registry names"); }
    if (!Array.isArray(names) || names.length === 0 || names.some((name) => typeof name !== "string" || name.trim() === "")) {
      throw new Error("lesson targets JSON must be an array of nonempty exact registry names");
    }
    // JSON preserves commas, whitespace and other characters in owner names.
    return [...new Set(names as string[])];
  }
  const names = raw.split(",").map((name) => name.trim());
  if (names.some((name) => name === "")) throw new Error("lesson targets must not contain empty names");
  return [...new Set(names)];
}

export function selectLessonContext(
  events: MemoryEvent[], projectDir: string, components: string[], patterns: string[],
): { lessons: LessonEntry[]; learning: LessonSelection } {
  const all = compileLessons(events);
  const environment = loadLessonEnvironment(projectDir);
  for (const target of [...components, ...patterns]) {
    if (!environment?.names.has(target)) throw new Error(`unknown lesson target '${target}' in the active registry`);
  }
  const learning: LessonSelection = {
    dsRevision: environment?.revision ?? null,
    targeted: components.length > 0 || patterns.length > 0,
    observed: all.length,
    excluded: { pending: 0, inactive: 0, staleRevision: 0, evidenceInvalid: 0, outOfScope: 0 },
  };
  const lessons: LessonEntry[] = [];
  for (const lesson of all) {
    if (lesson.status === "pending") { learning.excluded.pending++; continue; }
    if (lesson.status !== "accepted") { learning.excluded.inactive++; continue; }
    if (lesson.dsRevision !== environment?.revision) { learning.excluded.staleRevision++; continue; }
    const target = lesson.scope.target ?? "";
    const matches = lesson.scope.kind === "project" ||
      (lesson.scope.kind === "component" ? components : patterns).includes(target);
    if (!matches) { learning.excluded.outOfScope++; continue; }
    if (lessonEvidenceProblem(projectDir, lesson, events) !== null) { learning.excluded.evidenceInvalid++; continue; }
    lessons.push(lesson);
  }
  return { lessons, learning };
}
