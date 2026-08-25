/** Component-level operation recorded in the Figma change log. */
export type ChangeOp = "created" | "updated" | "deleted";

/** Scope hint derived from origin; reconcile remains authoritative. */
export type ScopeHint = "local" | "global";

/** Figma DocumentChange.origin. */
export type ChangeOrigin = "LOCAL" | "REMOTE";

/** Must equal the producer schema version; reconcile refuses a mismatch. */
export const EXPECTED_CHANGE_LOG_VERSION = 1;

/** One line of figma.changes.jsonl: the on-disk boundary shared with figma-agent. */
export interface ChangeFrame {
  v: number;
  ts: number;
  op: ChangeOp;
  nodeId: string;
  nodeName: string | null;
  nodeType: string;
  changedProps: string[];
  origin: ChangeOrigin;
  scopeHint: ScopeHint;
  page: string;
  fileKey: string | null;
  /**
   * Additive file identity for Figma Free files whose fileKey is unavailable. Older log
   * lines remain valid when this field is absent.
   */
  fileName?: string;
}

/** A component cross-batch state with operation precedence and unioned properties. */
export interface CoalescedComponent {
  nodeId: string;
  nodeName: string | null;
  nodeType: string;
  op: ChangeOp;
  changedProps: string[];
  scopeHint: ScopeHint;
  page: string;
  latestTs: number;
  /** Absolute index of the first frame that produced this target. */
  firstFrameIndex: number;
  /** Absolute index of the last frame that produced this target. */
  lastFrameIndex: number;
  /** File key from the log, or null for older and Figma Free records. */
  fileKey: string | null;
  /** Stable identity: fileKey, else slugged fileName, else unknown. */
  fileSlug: string;
}

/** Minimal component-registry projection needed for preview computation. */
export interface RegistryView {
  name: string;
  scope?: ScopeHint;
  deprecated?: boolean;
}

export interface DeltaEntry {
  /** Component key: the verbatim, untrusted Figma node name. */
  name: string;
  nodeId: string;
  nodeType: string;
  scope: ScopeHint;
  scopeHint: ScopeHint;
  scopeFromHint: boolean;
  page: string;
}

export interface UpdatedEntry extends DeltaEntry {
  /** field is null when no discrete registry field maps to the Figma property. */
  changedProps: { figmaProp: string; field: string | null }[];
  fields: string[];
}

export interface UnresolvedEntry {
  nodeId: string;
  op: ChangeOp;
  reason: string;
}

export interface PreviewDelta {
  added: DeltaEntry[];
  updated: UpdatedEntry[];
  deprecated: DeltaEntry[];
  unresolved: UnresolvedEntry[];
}

/** Typed failure for malformed or unsupported reconcile input. */
export class ReconcileError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ReconcileError";
    this.code = code;
  }
}
