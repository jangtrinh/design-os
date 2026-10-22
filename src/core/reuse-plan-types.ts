/** Shared shapes for the reuse-plan checker (kept apart so the rule modules do not import each other). */
import type { NameIndex, PatternSource } from "./reuse-plan-names.js";
import type { TokenTree } from "./token-model.js";

export interface Finding { code: string; line: number; screen: string | null; slot: string | null; message: string }

export interface ScreenSummary {
  name: string;
  line: number;
  /** The registered template or pattern file the screen follows; null for `none` or an invalid line. */
  pattern: string | null;
  patternSource: PatternSource | null;
  /** Slots at rungs 2-6 with no finding. */
  reuse: number;
  /** All slots except rung 1 (skipped). */
  total: number;
  skipped: number;
}

export interface DsNewItem { name: string; reason: string; screen: string; slot: string; line: number; hint?: string }

export interface CheckResult { findings: Finding[]; warnings: Finding[]; screens: ScreenSummary[]; dsNew: DsNewItem[] }

export interface CheckContext {
  names: NameIndex;
  /** Lazy: only a plan with a rung-6 row ever reads the token file. A string = why it is unavailable. */
  tokens: () => TokenTree | string;
}

/** Where a screen's rules report; `errors()` lets a caller tell whether a row produced a finding. */
export interface Sink {
  error(code: string, line: number, slot: string | null, message: string): void;
  warn(code: string, line: number, slot: string | null, message: string): void;
  /** Like `warn`, but only the first call per run with this code is recorded. */
  warnOnce(code: string, line: number, slot: string | null, message: string): void;
  errors(): number;
}
