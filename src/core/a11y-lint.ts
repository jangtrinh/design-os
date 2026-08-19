/**
 * Static-HTML accessibility linter — the Tier-1 a11y checks a parser can decide with
 * high precision and no browser (DESIGN-OS T2). Mirrors validate-layout / taste-lint.
 *
 * Scope is deliberately narrow: only WCAG criteria decidable from static markup with
 * near-zero false positives (alt presence, page language, title, positive tabindex,
 * viewport zoom, missing viewport meta on a responsive doc, unnamed icon/emoji
 * controls, heading hierarchy). Everything requiring
 * a rendered DOM (real contrast, focus visibility, focus ORDER meaning) is Tier 2
 * (a browser workspace); everything requiring judgment (alt *quality*) is human.
 *
 * HONESTY: passing this is NOT "accessible" and NOT "WCAG AA conformant" — the command
 * says so. Precision over recall: when unsure, do not flag.
 */
import {
  checkImgAlt, checkHtmlLang, checkDocumentTitle, checkPositiveTabindex,
  checkViewportZoom, checkViewportMetaPresent, checkIconControlUnnamed, checkHeadingHierarchy,
  checkPasteBlocked,
} from "./a11y-checks.js";
// Imported directly (not via the a11y-checks barrel): the barrel already sits in a
// runtime cycle with this module (it imports lineAt back), and routing these two
// through it left them undefined in some load orders under the test runner's interop.
import { checkInputUnlabeled, checkFocusOutlineRemoved } from "./a11y-checks-focus-and-labels.js";
import { stripCommentsPreservingOffsets } from "./taste-checks-shared.js";
import type { FloorFindingBase } from "./finding-schema.js";

export type A11ySeverity = "error" | "warning";

/** A11y findings speak the shared FloorFinding schema plus the WCAG criterion. */
export type A11yFinding = FloorFindingBase & {
  /** WCAG success criterion, e.g. "1.1.1". */
  sc: string;
};

export interface A11yLintResult {
  findings: A11yFinding[];
  errorCount: number;
  warningCount: number;
}

const CHECKS = [
  checkImgAlt,
  checkHtmlLang,
  checkDocumentTitle,
  checkPositiveTabindex,
  checkViewportZoom,
  checkViewportMetaPresent,
  checkIconControlUnnamed,
  checkHeadingHierarchy,
  checkPasteBlocked,
  checkInputUnlabeled,
  checkFocusOutlineRemoved,
];

/** 1-based line number of a byte offset in the source. */
export function lineAt(html: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < html.length; i++) if (html[i] === "\n") line++;
  return line;
}

export function lintA11y(html: string): A11yLintResult {
  // Commented-out markup is not markup: strip comments once (offset-preserving,
  // same helper as layout-lint/taste-lint) so no a11y check fires inside <!-- -->.
  const stripped = stripCommentsPreservingOffsets(html);
  const errors: A11yFinding[] = [];
  const warnings: A11yFinding[] = [];
  for (const check of CHECKS) {
    for (const f of check(stripped)) (f.severity === "error" ? errors : warnings).push(f);
  }
  const sortF = (a: A11yFinding, b: A11yFinding): number =>
    (a.line ?? 0) - (b.line ?? 0) || a.checkId.localeCompare(b.checkId) || a.message.localeCompare(b.message);
  errors.sort(sortF);
  warnings.sort(sortF);
  return { findings: [...errors, ...warnings], errorCount: errors.length, warningCount: warnings.length };
}
