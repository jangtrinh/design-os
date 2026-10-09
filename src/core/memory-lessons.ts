/** Lessons are a pure replay of ledger order; a projection never confers approval. */
import { type MemoryEvent } from "./memory-events.js";
import { MemoryEventError } from "./memory-error.js";

export interface LessonScope { kind: "project" | "component" | "pattern"; target?: string }
export interface LessonReview {
  id: string; t: string; decision: "accept" | "reject" | "revoke"; actor: string;
  reason: string; approvalRef: string; approvalFingerprint: string;
}
export interface LessonEntry {
  id: string; t: string; text: string; scope: LessonScope; dsRevision: string;
  refs: string[]; status: "pending" | "accepted" | "rejected" | "revoked"; reviews: LessonReview[];
}

/** Pure structural guards shared by record and authoritative lesson replay. */
export function badLesson(message: string): never { throw new MemoryEventError("BAD_LESSON", message); }
export function localLessonRef(ref: unknown): ref is string {
  return typeof ref === "string" && ref.trim().length > 0 && !ref.startsWith("/")
    && !ref.includes("\\") && !ref.includes(":") && !ref.includes("\0")
    && ref.split("/").every((part) => part !== ".." && part !== "");
}
export function lessonFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
export function validateLessonData(type: string, data: Record<string, unknown>, refs: readonly string[] | undefined): void {
  if (type !== "lesson_proposed" && type !== "lesson_reviewed") return;
  if (!Array.isArray(refs) || refs.length === 0 || refs.some((r) => !nonempty(r)) || new Set(refs).size !== refs.length) {
    badLesson("lesson refs must be nonempty, unique event ids");
  }
  if (type === "lesson_proposed") {
    if (!nonempty(data["text"]) || data["text"].length > 2000) badLesson("lesson text must be nonempty and at most 2000 characters");
    if (typeof data["dsRevision"] !== "string" || !/^sha256-[A-Za-z0-9_-]{43}$/.test(data["dsRevision"])) {
      badLesson("lesson dsRevision must be a canonical SHA256 hash");
    }
    const scope = data["scope"] as Record<string, unknown> | undefined;
    if (!scope || typeof scope !== "object" || Array.isArray(scope)) badLesson("lesson scope must be an object");
    if (scope["kind"] === "project") {
      if ("target" in scope) badLesson("project lesson scope cannot have a target");
    } else if (scope["kind"] === "component" || scope["kind"] === "pattern") {
      if (!nonempty(scope["target"])) badLesson("targeted lesson scope requires an exact registry target");
    } else badLesson("lesson scope.kind must be project, component or pattern");
  } else {
    if (!nonempty(data["lessonId"]) || refs.length !== 1 || refs[0] !== data["lessonId"]) badLesson("review refs must equal [lessonId]");
    if (typeof data["decision"] !== "string" || !["accept", "reject", "revoke"].includes(data["decision"])) badLesson("review decision must be accept, reject or revoke");
    if (!nonempty(data["reason"])) badLesson("review reason must be nonempty");
    if (!localLessonRef(data["approvalRef"])) badLesson("approvalRef must be a safe project-relative file");
    if (!lessonFingerprint(data["approvalFingerprint"])) badLesson("approvalFingerprint must be sha256:<64 lowercase hex>");
  }
}

/** Round-trip calendar fields, including leap days; UTC only, up to millisecond precision. */
export function validLessonTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  return new Date(value).toISOString() === `${match[1]}.${(match[2] ?? "").padEnd(3, "0")}Z`;
}

export function compileLessons(events: readonly MemoryEvent[]): LessonEntry[] {
  const seen = new Map<string, MemoryEvent>();
  const lessons = new Map<string, LessonEntry>();
  for (const event of events) {
    if (typeof event.id !== "string" || event.id.trim() === "" || seen.has(event.id)) badLesson(`duplicate or empty event id '${event.id}'`);
    if (event.type === "lesson_proposed" || event.type === "lesson_reviewed") {
      if (event.v !== 1 || !validLessonTimestamp(event.t)) {
        badLesson(`lesson event '${event.id}' requires version 1 and a valid UTC timestamp`);
      }
      if (!event.data || typeof event.data !== "object" || Array.isArray(event.data)) badLesson(`lesson event '${event.id}' data must be an object`);
      validateLessonData(event.type, event.data, event.refs);
      for (const ref of event.refs ?? []) {
        if (!seen.has(ref)) badLesson(`lesson event '${event.id}' ref '${ref}' is forward or dangling`);
      }
      const data = event.data;
      if (event.type === "lesson_proposed") {
        for (const ref of event.refs ?? []) {
          const artifact = seen.get(ref)?.artifact;
          if (!localLessonRef(artifact?.ref) || !lessonFingerprint(artifact?.fingerprint)) badLesson(`source ref '${ref}' requires a project-relative artifact and SHA256 fingerprint`);
        }
        lessons.set(event.id, { id: event.id, t: event.t, text: data["text"] as string,
          scope: { ...(data["scope"] as LessonScope) }, dsRevision: data["dsRevision"] as string,
          refs: [...(event.refs ?? [])], status: "pending", reviews: [] });
      } else {
        if (typeof event.actor !== "string" || event.actor.trim() === "") badLesson(`review '${event.id}' requires a nonempty actor`);
        const lesson = lessons.get(data["lessonId"] as string);
        if (!lesson) badLesson(`review '${event.id}' ref must point to a lesson proposal`);
        const decision = data["decision"] as LessonReview["decision"];
        if ((decision === "revoke" && lesson.status !== "accepted") || (decision !== "revoke" && lesson.status !== "pending")) {
          badLesson(`cannot ${decision} lesson '${lesson.id}' in ${lesson.status} state`);
        }
        lesson.status = decision === "accept" ? "accepted" : decision === "reject" ? "rejected" : "revoked";
        lesson.reviews.push({ id: event.id, t: event.t, decision, actor: event.actor,
          reason: data["reason"] as string, approvalRef: data["approvalRef"] as string,
          approvalFingerprint: data["approvalFingerprint"] as string });
      }
    }
    seen.set(event.id, event);
  }
  return [...lessons.values()];
}
