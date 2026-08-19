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

/** Markup only: script/pre/code/kbd/samp regions blanked. A page that MENTIONS
 *  a class in prose, a code sample, or a template string is not using it. */
function markupOnly(html: string): string {
  return html.replace(/<(script|pre|code|kbd|samp)\b[\s\S]*?<\/\1\s*>/gi, blank);
}

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
  const markup = markupOnly(html); // an <input> in a script template string is not a control
  const forIds = new Set<string>();
  for (const m of markup.matchAll(/<label\b[^>]*\bfor\s*=\s*["']?([\w-]+)/gi)) forIds.add((m[1] ?? "").toLowerCase());
  // Controls inside a wrapping <label> are labeled — blank those regions out.
  const scan = markup.replace(/<label\b[\s\S]*?<\/label\s*>/gi, blank);
  for (const m of scan.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)) {
    const tag = (m[1] ?? "").toLowerCase();
    const attrs = m[2] ?? "";
    if (tag === "input" && UNLABELED_OK_TYPES.test(attrs)) continue;
    // Hidden content sits outside the accessibility tree — no label required.
    // (?:^|\s) guards the bare `hidden` attribute against matching inside aria-hidden.
    if (/(?:^|\s)hidden(?:\s*=|\s|$)/i.test(attrs) || /\baria-hidden\s*=\s*["']?true/i.test(attrs)) continue;
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
const OUTLINE_KILLED = /outline\s*:\s*(?:none|0(?:px)?)\s*(?:!important\s*)?(?:;|$)/im;
/** A visible replacement inside a focus rule: a real outline or a box-shadow ring.
 *  The whitespace lives INSIDE the lookahead — with `\s*` outside, backtracking
 *  gives it zero spaces and the lookahead dodges "none" by seeing " none". */
const OUTLINE_REPLACED = /outline\s*:(?!\s*(?:none|0(?:px)?)\s*(?:!important\s*)?(?:;|}|$))[^;}]+|box-shadow\s*:(?!\s*none\b)[^;}]+/i;
/** Tailwind forms — removal and replacement utilities. */
const TW_REMOVED = /\bfocus(?:-visible|-within)?:outline-none\b/;
const TW_REPLACED = /\bfocus(?:-visible|-within)?:(?:ring|shadow|border|outline-(?!none))/;

/**
 * checkFocusOutlineRemoved — a focus rule that kills the outline
 * (`outline: none`/`0`, or Tailwind `focus:outline-none`) on a document where
 * NO focus rule anywhere provides a visible replacement (a real outline, a
 * box-shadow ring, or a focus ring/outline utility). Removing the ring without
 * a replacement blinds sighted keyboard users (WCAG 2.4.7). Precision-first:
 * a replacement anywhere in the document clears the finding — the ring may
 * legitimately live on a shared selector.
 */
/**
 * A programmatic focus target — a skip-link/dialog destination focused from
 * script with tabindex="-1". Suppressing its ring while real controls keep the
 * browser default is recommended practice, not a removal (WCAG techniques).
 *  Exported for the paired repair (focus-outline-restore) — checker and repair share it. */
export function isProgrammaticFocusTarget(selector: string, markup: string): boolean {
  if (/\[tabindex\s*=\s*["']?-1/i.test(selector)) return true;
  const id = /#([\w-]+)/.exec(selector)?.[1];
  if (id === undefined) return false;
  const tag = new RegExp(`<[^>]*\\bid\\s*=\\s*["']?${id}(?:["'\\s>])[^>]*>`, "i").exec(markup)?.[0] ?? "";
  return /\btabindex\s*=\s*["']?-1/i.test(tag);
}

/** The class-attribute values of the document, joined — Tailwind utilities are
 *  read HERE, never from raw text, so prose or code samples cannot fire. */
function classText(markup: string): string {
  let out = "";
  for (const m of markup.matchAll(/\bclass\s*=\s*["']([^"']*)["']/gi)) out += " " + (m[1] ?? "");
  return out;
}

export function checkFocusOutlineRemoved(html: string): A11yFinding[] {
  const markup = markupOnly(html);
  const classes = classText(markup);
  const css = cssRegions(markup);
  let removed = TW_REMOVED.test(classes);
  let replaced = TW_REPLACED.test(classes);
  for (const { selector, body } of cssRules(css)) {
    if (!FOCUS_SELECTOR.test(selector)) continue;
    if (OUTLINE_KILLED.test(body) && !isProgrammaticFocusTarget(selector, markup)) removed = true;
    if (OUTLINE_REPLACED.test(body)) replaced = true;
  }
  if (!removed || replaced) return [];
  return [{ checkId: "focus-outline-removed", severity: "error", sc: "2.4.7",
    message: "a focus rule removes the outline (outline: none / focus:outline-none) and no focus rule provides a visible replacement — sighted keyboard users lose their place; keep the browser ring (outline-offset alone preserves it) or draw a ring with the project's focus token" }];
}
