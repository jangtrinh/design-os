/**
 * Form-label and focus-visibility a11y checks (jakubkrehel/skills adoption —
 * better-accessibility forms + focus-and-keyboard, rewritten against WCAG).
 * Split from a11y-checks.ts to keep that module under the 200-line guideline.
 * Regex-based, precision-first: a rule fires only when the violation is
 * unambiguous from the markup alone.
 */
// Runtime imports come from taste-checks-shared ONLY — importing lineAt from
// a11y-lint here would close a runtime import cycle (a11y-lint → a11y-checks →
// this module → a11y-lint) that leaves the re-exported checks undefined in
// some load orders (caught live by the ds-preview gate). The finding type is
// type-only, so it erases and carries no cycle.
import type { A11yFinding } from "./a11y-lint.js";
import { cssRegions, cssRules, lineOf } from "./taste-checks-shared.js";

/** Blank a region to spaces, preserving newlines so offsets stay line-true. */
const blank = (m: string): string => m.replace(/[^\n]/g, " ");

// ── 3.3.2 Labels or instructions: every text control needs a programmatic label ──

/** Input types that take no label (no text entry, or labeled by their value). */
const UNLABELED_OK_TYPES = /\btype\s*=\s*["']?(?:hidden|submit|button|reset|image)\b/i;

/**
 * checkInputUnlabeled — a text-entry `<input>`/`<select>`/`<textarea>` with no
 * programmatic label: no `<label for>` pointing at its id, not wrapped in a
 * `<label>`, and no aria-label / aria-labelledby / title. A placeholder is
 * NEVER a label — it disappears on first keystroke (WCAG 3.3.2; the same rule
 * axe ships as label). Wrapped labels are honored by blanking every
 * `<label>…</label>` region first, so only orphaned controls are scanned.
 */
export function checkInputUnlabeled(html: string): A11yFinding[] {
  const out: A11yFinding[] = [];
  const forIds = new Set<string>();
  for (const m of html.matchAll(/<label\b[^>]*\bfor\s*=\s*["']?([\w-]+)/gi)) forIds.add((m[1] ?? "").toLowerCase());
  // Controls inside a wrapping <label> are labeled — blank those regions out.
  const scan = html.replace(/<label\b[\s\S]*?<\/label\s*>/gi, blank);
  for (const m of scan.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const tag = (m[1] ?? "").toLowerCase();
    const attrs = m[2] ?? "";
    if (tag === "input" && UNLABELED_OK_TYPES.test(attrs)) continue;
    if (/\baria-label(ledby)?\s*=|\btitle\s*=/i.test(attrs)) continue;
    const id = /\bid\s*=\s*["']?([\w-]+)/i.exec(attrs)?.[1]?.toLowerCase();
    if (id !== undefined && forIds.has(id)) continue;
    out.push({ checkId: "input-unlabeled", severity: "error", sc: "3.3.2",
      message: `<${tag}> has no programmatic label — add <label for>, wrap it in a <label>, or set aria-label (a placeholder is not a label: it vanishes on the first keystroke)`, line: lineOf(scan, m.index) });
  }
  return out;
}

// ── 2.4.7 Focus visible: never remove the outline without a replacement ──

/** A focus-family selector: :focus, :focus-visible, :focus-within. */
const FOCUS_SELECTOR = /:focus(-visible|-within)?\b/i;
/** outline: none / outline: 0 as the declaration's whole value. */
const OUTLINE_KILLED = /outline\s*:\s*(?:none|0)\s*(?:;|$)/im;
/** A visible replacement inside a focus rule: a real outline or a box-shadow ring.
 *  The whitespace lives INSIDE the lookahead — with `\s*` outside, backtracking
 *  gives it zero spaces and the lookahead dodges "none" by seeing " none". */
const OUTLINE_REPLACED = /outline\s*:(?!\s*(?:none|0)\s*(?:;|}|$))[^;}]+|box-shadow\s*:(?!\s*none\b)[^;}]+/i;
/** Tailwind forms — removal and replacement utilities. */
const TW_REMOVED = /\bfocus(?:-visible|-within)?:outline-none\b/;
const TW_REPLACED = /\bfocus(?:-visible|-within)?:(?:ring|outline-(?!none))/;

/**
 * checkFocusOutlineRemoved — a focus rule that kills the outline
 * (`outline: none`/`0`, or Tailwind `focus:outline-none`) on a document where
 * NO focus rule anywhere provides a visible replacement (a real outline, a
 * box-shadow ring, or a focus ring/outline utility). Removing the ring without
 * a replacement blinds sighted keyboard users (WCAG 2.4.7). Precision-first:
 * a replacement anywhere in the document clears the finding — the ring may
 * legitimately live on a shared selector.
 */
export function checkFocusOutlineRemoved(html: string): A11yFinding[] {
  const css = cssRegions(html);
  let removed = false;
  let replaced = TW_REPLACED.test(html);
  for (const { selector, body } of cssRules(css)) {
    if (!FOCUS_SELECTOR.test(selector)) continue;
    if (OUTLINE_KILLED.test(body)) removed = true;
    if (OUTLINE_REPLACED.test(body)) replaced = true;
  }
  if (TW_REMOVED.test(html)) removed = true;
  if (!removed || replaced) return [];
  return [{ checkId: "focus-outline-removed", severity: "error", sc: "2.4.7",
    message: "a focus rule removes the outline (outline: none / focus:outline-none) and no focus rule provides a visible replacement — sighted keyboard users lose their place; keep the browser ring (outline-offset alone preserves it) or draw a ring with the project's focus token" }];
}
