/**
 * container-nesting-depth (Layout axis, WARNING) — the machine floor under the
 * rubric's Layout anti-pattern "container soup": decorative wrapper divs nested
 * inside decorative wrapper divs inside decorative wrapper divs, three-plus
 * levels deep, with no semantic payload at any level (section > card > pill >
 * tag). Each wrap adds DOM weight and paint cost without adding structure.
 *
 * Detection: a pure-static tag-stack walk. Elements are classified as:
 *   - a CONTAINER candidate  — `div`/`section`/`article`/`aside`/`main`, or any
 *     element whose `class` carries a presentational-wrapper signal
 *     (`card`/`panel`/`rounded-*`/`border`);
 *   - a BREAK — a landmark tag (`main`/`nav`/`header`/`footer`), a list/table/
 *     form element (`ul`/`ol`/`li`/`table`/`tr`/`td`/`th`/`form`/…), or any
 *     element carrying `role="…"` or an `aria-*` attribute. A break resets the
 *     running nesting count to zero for its own subtree — it is semantic, not
 *     "purely presentational", so it (and anything above it) never contributes
 *     to a container-soup chain.
 *   - otherwise a pass-through (e.g. `<p>`, `<span>`, `<button>` with no wrapper
 *     class) — it neither adds nor resets depth; the chain runs through it.
 *
 * A CONTAINER's depth is its parent's depth + 1, UNLESS the parent establishes a
 * grid/flex track (`class` contains `grid`/`flex`, or `style="display:grid|flex"`)
 * — a grid/flex parent's DIRECT children are track cells, not an extra wrap
 * layer, so they inherit the parent's own depth rather than incrementing it.
 *
 * A chain is flagged once, at its deepest terminal point (a container with no
 * flagged descendant), when that depth reaches 3. This reports exactly one
 * finding per independent branch of container soup rather than one per level.
 *
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { lineOf } from "./taste-checks-shared.js";

const CHECK_ID = "container-nesting-depth";
const FLAG_AT = 3; // a chain of this many purely-presentational containers is "soup"

const BASE_CONTAINER_TAGS = new Set(["div", "section", "article", "aside", "main"]);
const LANDMARK_TAGS = new Set(["main", "nav", "header", "footer"]);
const LIST_TABLE_FORM_TAGS = new Set([
  "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th",
  "form", "fieldset",
]);
/** Void elements never wrap children — skip them entirely (never pushed). */
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

const CONTAINER_CLASS_SIGNAL = /\b(?:card|panel)\b|\brounded(?:-[a-z0-9-]+)?\b|\bborder(?:-[a-z0-9-]+)?\b/i;
const TRACK_CLASS_SIGNAL = /\b(?:inline-)?(?:grid|flex)\b/;
const TRACK_STYLE_SIGNAL = /display\s*:\s*(?:inline-)?(?:grid|flex)\b/i;
const ROLE_OR_ARIA = /\brole\s*=\s*["'][^"']*["']|\baria-[a-z-]+\s*=/i;

/** Extract the `class="…"` value from a tag's attribute string; "" when absent. */
function classOf(attrs: string): string {
  return /\bclass\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
}

/** Extract the `style="…"` value from a tag's attribute string; "" when absent. */
function styleOf(attrs: string): string {
  return /\bstyle\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] ?? "";
}

function isBreak(tag: string, attrs: string): boolean {
  if (LANDMARK_TAGS.has(tag) || LIST_TABLE_FORM_TAGS.has(tag)) return true;
  return ROLE_OR_ARIA.test(attrs);
}

function isContainerCandidate(tag: string, attrs: string): boolean {
  if (BASE_CONTAINER_TAGS.has(tag)) return true;
  return CONTAINER_CLASS_SIGNAL.test(classOf(attrs));
}

function establishesTrack(attrs: string): boolean {
  return TRACK_CLASS_SIGNAL.test(classOf(attrs)) || TRACK_STYLE_SIGNAL.test(styleOf(attrs));
}

/** A short human label for a frame, used to name the flagged chain. */
function labelOf(tag: string, attrs: string): string {
  const cls = classOf(attrs).trim().split(/\s+/)[0];
  return cls ? `${tag}.${cls}` : tag;
}

interface Frame {
  tag: string;
  isBreak: boolean;
  isContainer: boolean;
  isTrack: boolean;
  depth: number;
  chainLabel: string;
  hasFlaggedDescendant: boolean;
  openIndex: number;
}

/** Blank out <script>/<style> contents (preserving offsets) — irrelevant to markup nesting. */
function stripNonMarkup(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (m) => " ".repeat(m.length));
}

const TAG_RE = /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)\b([^>]*?)(\/)?>/g;

export function checkContainerNestingDepth(html: string): TasteFinding[] {
  const scan = stripNonMarkup(html);
  const findings: TasteFinding[] = [];
  const stack: Frame[] = [];

  const closeFrame = (frame: Frame): void => {
    let selfFlagged = false;
    if (!frame.isBreak && frame.isContainer && frame.depth >= FLAG_AT && !frame.hasFlaggedDescendant) {
      findings.push({
        checkId: CHECK_ID,
        axis: "Layout",
        severity: "warning",
        message: `container-soup chain ${frame.depth} levels deep (${frame.chainLabel}) — decorative wrappers nested past 2 levels (rubric Layout anti-pattern: "container soup") add DOM weight with no structural payload; flatten via a single element with combined utility classes or drop the non-semantic wrapper`,
        line: lineOf(html, frame.openIndex),
      });
      selfFlagged = true;
    }
    const propagate = frame.isBreak ? false : frame.hasFlaggedDescendant || selfFlagged;
    const parent = stack[stack.length - 1];
    if (parent && propagate) parent.hasFlaggedDescendant = true;
  };

  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(scan)) !== null) {
    const closeTag = m[1];
    if (closeTag !== undefined) {
      const tag = closeTag.toLowerCase();
      // Close the nearest matching open frame, implicitly closing any unclosed
      // descendants above it (mirrors how real parsers handle optional-close tags).
      let idx = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]?.tag === tag) { idx = i; break; }
      }
      if (idx === -1) continue; // stray/unmatched closing tag — ignore
      while (stack.length > idx) {
        const frame = stack.pop();
        if (frame) closeFrame(frame);
      }
      continue;
    }

    const openTag = (m[2] ?? "").toLowerCase();
    const attrs = m[3] ?? "";
    const selfClosing = m[4] === "/";
    if (VOID_TAGS.has(openTag)) continue; // never wraps children — irrelevant

    const parent = stack[stack.length - 1];
    const parentDepth = parent ? parent.depth : 0;
    const parentIsTrack = parent ? parent.isTrack : false;
    const parentLabel = parent ? parent.chainLabel : "";
    const parentIsBreakOrRoot = !parent || parent.isBreak;

    const brk = isBreak(openTag, attrs);
    const container = isContainerCandidate(openTag, attrs);

    let depth: number;
    let chainLabel: string;
    if (brk) {
      depth = 0;
      chainLabel = "";
    } else if (container) {
      depth = parentIsTrack ? parentDepth : (parentIsBreakOrRoot ? 0 : parentDepth) + 1;
      chainLabel = parentLabel ? `${parentLabel} > ${labelOf(openTag, attrs)}` : labelOf(openTag, attrs);
    } else {
      depth = parentDepth;
      chainLabel = parentLabel;
    }

    const frame: Frame = {
      tag: openTag,
      isBreak: brk,
      isContainer: container,
      isTrack: establishesTrack(attrs),
      depth,
      chainLabel,
      hasFlaggedDescendant: false,
      openIndex: m.index,
    };

    if (selfClosing) {
      closeFrame(frame); // no children possible — evaluate and discard immediately
    } else {
      stack.push(frame);
    }
  }

  // Any elements left open at EOF (malformed/truncated markup) — close them in
  // document order so a deep unterminated chain still gets evaluated.
  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame) closeFrame(frame);
  }

  findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return findings;
}
