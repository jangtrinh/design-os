/** Filesystem boundary for lesson evidence, verified environments and append preconditions. */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { loadDesignSystem, pathsForDir } from "./design-system.js";
import { canonicalHash, type DSManifest } from "./ds-manifest.js";
import type { MemoryEvent } from "./memory-events.js";
import { badLesson, localLessonRef, type LessonEntry, type LessonReview } from "./memory-lessons.js";

/** Realpath containment and byte fingerprints shared by evidence and receipts. */
export function readLessonFile(projectDir: string, ref: string): Buffer {
  if (!localLessonRef(ref)) throw new Error(`unsafe project-relative file '${ref}'`);
  const root = realpathSync(projectDir);
  const path = realpathSync(resolve(root, ref));
  const rel = relative(root, path);
  if (rel === "" || rel === ".." || rel.startsWith("../") || isAbsolute(rel)) throw new Error(`file '${ref}' escapes project realpath`);
  if (!statSync(path).isFile()) throw new Error(`file '${ref}' is not a regular file`);
  return readFileSync(path);
}
export function fingerprintedLessonFile(projectDir: string, ref: string, fingerprint: string): Buffer {
  const bytes = readLessonFile(projectDir, ref);
  const actual = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  if (actual !== fingerprint) throw new Error(`fingerprint mismatch for '${ref}'`);
  return bytes;
}

export function lessonRevision(manifest: DSManifest): string {
  const { compiledHash, registryHash, generation } = manifest;
  return canonicalHash({ compiledHash, registryHash, generation, ...(manifest.kit && { kit: manifest.kit }) });
}
export function loadLessonEnvironment(projectDir: string): { revision: string; names: Set<string>; kitStale?: boolean } | null {
  const paths = pathsForDir(join(projectDir, "design"));
  try { lstatSync(paths.manifest); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  for (const path of [paths.manifest, paths.tokens, paths.registry]) readLessonFile(projectDir, relative(projectDir, path));
  const ds = loadDesignSystem(paths);
  return { revision: lessonRevision(ds.manifest), names: new Set(ds.registry.components.map((c) => c.name)), ...(ds.kit && { kitStale: ds.kit.status === "stale" }) };
}

export function lessonApprovalProblem(projectDir: string, lesson: LessonEntry, review: LessonReview): string | null {
  try {
    const bytes = fingerprintedLessonFile(projectDir, review.approvalRef, review.approvalFingerprint);
    const receipt = JSON.parse(bytes.toString("utf8")) as Record<string, unknown> | null;
    if (!receipt || Array.isArray(receipt) || typeof receipt !== "object") return "approval receipt must be a JSON object";
    const expected = { lessonId: lesson.id, dsRevision: lesson.dsRevision,
      decision: review.decision, actor: review.actor, reason: review.reason };
    for (const [key, value] of Object.entries(expected)) {
      if (receipt[key] !== value) return `approval receipt '${review.approvalRef}' does not match ${key}`;
    }
    return null;
  } catch (error) { return `approval receipt '${review.approvalRef}': ${error instanceof Error ? error.message : String(error)}`; }
}
export function lessonEvidenceProblem(projectDir: string, lesson: LessonEntry, events: readonly MemoryEvent[]): string | null {
  const sources = new Map(events.map((event) => [event.id, event]));
  for (const ref of lesson.refs) {
    const artifact = sources.get(ref)?.artifact;
    if (!artifact?.ref || !artifact.fingerprint) return `source ref '${ref}' lacks artifact evidence`;
    try { fingerprintedLessonFile(projectDir, artifact.ref, artifact.fingerprint); }
    catch (error) { return `source ref '${ref}': ${error instanceof Error ? error.message : String(error)}`; }
  }
  for (let i = lesson.reviews.length - 1; i >= 0; i--) {
    const review = lesson.reviews[i];
    if (review?.decision === "accept") return lessonApprovalProblem(projectDir, lesson, review);
  }
  return null;
}

/** Only the shared locked append invokes these filesystem preconditions. */
export function preflightLesson(projectDir: string, event: MemoryEvent, lessons: LessonEntry[], prior: MemoryEvent[]): void {
  if (event.type !== "lesson_proposed" && event.type !== "lesson_reviewed") return;
  const lesson = lessons.find((entry) => entry.id === (event.type === "lesson_proposed" ? event.id : event.data["lessonId"]));
  if (!lesson) badLesson("lesson proposal missing from replay");
  const review = lesson.reviews.at(-1);
  if (event.type === "lesson_reviewed") {
    if (!review) badLesson("review missing from replay");
    const problem = lessonApprovalProblem(projectDir, lesson, review);
    if (problem) badLesson(problem);
    // Rejection and revocation must remain possible when evidence or the DS changed.
    if (review.decision !== "accept") return;
  }
  const environment = loadLessonEnvironment(projectDir);
  if (!environment) badLesson("lesson requires a verified design system; run ui ds init");
  if (environment.kitStale && event.type === "lesson_reviewed" && review?.decision === "accept") badLesson("KIT_STALE: kit evidence requires reverification before lesson acceptance");
  if (lesson.dsRevision !== environment.revision) badLesson("lesson dsRevision does not match the current verified design system");
  if (lesson.scope.kind !== "project" && !environment.names.has(lesson.scope.target ?? "")) badLesson(`unknown lesson registry target '${lesson.scope.target}'`);
  const problem = lessonEvidenceProblem(projectDir, lesson, prior);
  if (problem) badLesson(problem);
}
