/**
 * Remembers which kind's emitter threw, without wrapping the exception: the error that reaches the caller is the very
 * object the emitter threw, so a command that writes lets it propagate unchanged, and the read-only status can still
 * say which detector failed.
 */
import type { ClusterKind } from "./cluster-kinds.js";

const failedKinds = new WeakMap<object, ClusterKind>();

export function runEmitter<T>(kind: ClusterKind, work: () => T): T {
  try { return work(); }
  catch (e) {
    if (typeof e === "object" && e !== null) failedKinds.set(e, kind);
    throw e;
  }
}

/** The kind whose emitter threw `error`, or undefined when it did not come from an emitter. */
export function failedEmitterKind(error: unknown): ClusterKind | undefined {
  return typeof error === "object" && error !== null ? failedKinds.get(error) : undefined;
}
