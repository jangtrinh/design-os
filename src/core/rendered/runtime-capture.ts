/**
 * The runtime capture: what a real engine saw, written down.
 *
 * This is a PUBLIC CONTRACT and it is versioned from its first day. A CI step
 * can produce one and a later `ui` run can judge it, which is only safe if both
 * sides can tell which shape they are holding.
 *
 * Every capture carries its engine identity. A rendered finding is never "the
 * page is broken" — it is "broken under Chrome 151 at 1280x800". Skew between CI
 * runner images does not disappear because we stopped looking at it; stamping is
 * what turns it from a silent flake into a stated condition.
 */

export const CAPTURE_VERSION = 1 as const;

export interface CaptureEngine {
  /** e.g. "Chrome/151.0.7922.174" — verbatim from /json/version. */
  browser: string;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  /** How long the page was allowed to settle before reading. */
  settleMs: number;
}

/** One element as the engine actually rendered it. */
export interface CapturedNode {
  /** Stable locator, same shape the cascade extractor emits. */
  ref: string;
  tag: string;
  parentRef?: string;
  /** Computed styles, the subset the rendered rules read. */
  computed: Record<string, string>;
  /** Layout box in CSS pixels. */
  box?: { x: number; y: number; width: number; height: number };
  /** Own text, whitespace-collapsed. */
  text?: string;
  /** For <img>: whether it actually loaded, and its intrinsic size. */
  image?: { complete: boolean; naturalWidth: number; naturalHeight: number };
  /** Scroll extent, for overflow detection. */
  scroll?: { scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number };
}

export interface RuntimeCapture {
  version: typeof CAPTURE_VERSION;
  /** The URL or file path that was rendered. */
  target: string;
  engine: CaptureEngine;
  nodes: CapturedNode[];
  /** Console errors and unhandled rejections the page produced. */
  consoleErrors: string[];
}

/** True when the object is a capture this build knows how to read. */
export function isSupportedCapture(value: unknown): value is RuntimeCapture {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v["version"] === CAPTURE_VERSION && Array.isArray(v["nodes"]) && typeof v["engine"] === "object";
}

/**
 * Reject an unreadable capture with the version it carries.
 *
 * A capture from a future build is not "empty" — reading it as empty would turn
 * a version mismatch into a clean bill of health.
 */
export function describeUnsupported(value: unknown): string {
  if (typeof value !== "object" || value === null) return "not a capture object";
  const version = (value as Record<string, unknown>)["version"];
  return version === undefined
    ? "capture has no version field"
    : `capture version ${String(version)}; this build reads version ${CAPTURE_VERSION}`;
}
