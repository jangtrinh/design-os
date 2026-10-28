/**
 * mode-invisible-surface (Depth/Surface axis, ERROR) — a boundary that passes
 * text-contrast checks but is invisible in craft terms: a low-alpha WHITE border
 * or fill sitting on a light surface (white-on-white), or the dark inverse — a
 * low-alpha BLACK border/fill on a dark surface (black-on-black).
 *
 * This is the classic copy-a-dark-recipe-onto-light bug: `border-white/10` is the
 * correct hairline on a dark surface, but pasted onto a white page it separates
 * nothing. A11y linters miss it (no text, no contrast pair); only craft catches it.
 *
 * A translucent tint has no colour of its own — it is a delta over whatever sits
 * behind it. So each tint is judged on the composite over ITS real parent: the
 * nearest concrete background among its own ancestors, with any translucent layers
 * in between composited, down to the page canvas (white, or black under a `dark`
 * root class). The document's colour mode never decides on a tint's behalf; a white
 * pill on a dark card inside a light page is visible, the same pill on the page is not.
 *
 * Precision over recall: when the parent background cannot be read from text — a
 * `var()` / gradient / image / unknown theme-colour utility on an ancestor, rules that
 * disagree about it, a declaration no element carries, a custom property — that ONE
 * tint is skipped, never guessed. Only same-polarity tints are judged (white on a
 * light backdrop, black on a dark one); a white tint on black is the correct hairline.
 * Text tints (`text-white/10`) are never flagged — only surfaces (background / border
 * / ring / divide / box-shadow / outline).
 *
 * Pure string/regex — no DOM, no deps.
 */
import type { TasteFinding } from "./taste-lint.js";
import { blankDeadMarkup, blankPreservingNewlines, cssRules, lineOf } from "./taste-checks-shared.js";

const CHECK_ID = "mode-invisible-surface";
const ALPHA_FLOOR = 0.15; // at or above this a tint is a deliberate, visible layer — never judged
const DARK_LUMA = 0.25; // a backdrop below this is a dark surface (white tints belong there, black ones vanish)
const MIN_STEP = 0.03; // a tint must move its backdrop's luma by this much (~8/255) to read as an edge

// ── Colour model ─────────────────────────────────────────────────────────────

/** A resolved paint: luma (0–1, the weighting this check has always used) and alpha (0–1). */
interface Paint { luma: number; alpha: number }
/** What an element paints behind itself: a paint, or "unknown" when text alone cannot say. */
type Bg = Paint | "unknown";

const lumaOf = (r: number, g: number, b: number): number => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const sameBg = (a: Bg, b: Bg): boolean =>
  a !== "unknown" && b !== "unknown" && Math.abs(a.luma - b.luma) < 0.004 && Math.abs(a.alpha - b.alpha) < 0.004;

/** `h` in degrees, `s`/`l` in 0–1 → sRGB channels in 0–255. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + (((h % 360) + 360) % 360) / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

/** A single CSS colour token → paint; null when it is not one this check can resolve. */
function parseColor(token: string): Paint | null {
  const v = token.trim().toLowerCase();
  if (v === "transparent") return { luma: 0, alpha: 0 };
  if (v === "white") return { luma: 1, alpha: 1 };
  if (v === "black") return { luma: 0, alpha: 1 };
  const hex = /^#([0-9a-f]+)$/.exec(v)?.[1];
  if (hex !== undefined) {
    if (![3, 4, 6, 8].includes(hex.length)) return null;
    const d = hex.length <= 4 ? hex.split("").map((c) => c + c).join("") : hex;
    const [r, g, b, a] = [0, 2, 4, 6].map((i) => (i < d.length ? parseInt(d.slice(i, i + 2), 16) : 255));
    return { luma: lumaOf(r ?? 0, g ?? 0, b ?? 0), alpha: (a ?? 255) / 255 };
  }
  const fn = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(v);
  if (!fn) return null;
  const p = (fn[2] ?? "").split(/[\s,/]+/).filter(Boolean);
  if (p.length < 3) return null;
  const num = (s: string | undefined): number => parseFloat(s ?? "");
  const alphaTok = p[3];
  const alpha = alphaTok === undefined ? 1 : alphaTok.endsWith("%") ? num(alphaTok) / 100 : num(alphaTok);
  let rgb: [number, number, number];
  if (fn[1]?.startsWith("rgb")) {
    const ch = (s: string | undefined): number => (s?.endsWith("%") ? num(s) * 2.55 : num(s));
    rgb = [ch(p[0]), ch(p[1]), ch(p[2])];
  } else {
    rgb = hslToRgb(num(p[0]), num(p[1]) / 100, num(p[2]) / 100);
  }
  if (![...rgb, alpha].every(Number.isFinite)) return null;
  return { luma: lumaOf(...rgb), alpha: Math.min(1, Math.max(0, alpha)) };
}

/**
 * Substitutes `var(--x)` with the value the document defines for `--x`. A custom property
 * is global text here, not a cascade: it resolves only when every definition in the document
 * agrees (a theme that redefines it under another selector makes it ambiguous), and a
 * fallback is used only when nothing defines it. null = cannot be resolved.
 */
type VarResolver = (value: string) => string | null;

function makeVarResolver(cssBlocks: string[]): VarResolver {
  const defs = new Map<string, Set<string>>();
  for (const text of cssBlocks) {
    for (const m of text.matchAll(/(?<![\w-])(--[\w-]+)\s*:\s*([^;}]+)/g)) {
      const name = m[1] ?? "";
      const values = defs.get(name) ?? new Set<string>();
      defs.set(name, values.add((m[2] ?? "").replace(/!important/i, "").trim()));
    }
  }
  const resolve = (value: string, depth: number): string | null => {
    if (!/var\(/i.test(value)) return value;
    if (depth > 4) return null;
    let ok = true;
    const out = value.replace(/var\(\s*(--[\w-]+)\s*(?:,((?:[^()]|\([^()]*\))*))?\)/gi, (_m, name: string, fallback: string | undefined) => {
      const values = defs.get(name);
      const raw = values === undefined ? fallback?.trim() : values.size === 1 ? [...values][0] : undefined;
      const resolved = raw === undefined ? null : resolve(raw, depth + 1);
      if (resolved === null) ok = false;
      return resolved ?? "";
    });
    return ok ? out : null;
  };
  return (value) => resolve(value, 0);
}

/** The value of a `background` / `background-color` declaration. */
function backgroundValue(raw: string, vars: VarResolver): Bg {
  const v = vars(raw.replace(/!important/i, "").trim());
  if (v === null) return "unknown";
  if (/^(?:none|initial|unset)$/i.test(v)) return { luma: 0, alpha: 0 };
  if (/url\(|gradient\(|var\(|env\(|attr\(|image-set\(/i.test(v)) return "unknown";
  const tok = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\b(?:transparent|white|black)\b/i.exec(v)?.[0];
  return (tok !== undefined ? parseColor(tok) : null) ?? "unknown";
}

/** The background a declaration block (inline style / rule body) sets; undefined when it sets none. */
function declaredBackground(decls: string, vars: VarResolver): Bg | undefined {
  let out: Bg | undefined;
  let image = false;
  for (const m of decls.matchAll(/(?<![\w-])background(-color|-image)?\s*:\s*([^;}]+)/gi)) {
    if (m[1]?.toLowerCase() === "-image") image ||= !/^\s*none\b/i.test(m[2] ?? "");
    else out = backgroundValue(m[2] ?? "", vars);
  }
  return image ? "unknown" : out;
}

/**
 * Tailwind's five neutral families share one shade→luma ramp (they differ by <0.02
 * of luma). Chromatic palette steps and semantic theme names (`bg-card`) have no
 * ramp — they resolve to "unknown" rather than to a guess.
 */
const NEUTRAL_LUMA: Record<string, number> = {
  "50": 0.98, "100": 0.96, "200": 0.9, "300": 0.83, "400": 0.63, "500": 0.44,
  "600": 0.33, "700": 0.25, "800": 0.15, "900": 0.09, "950": 0.03,
};
/** `bg-*` utilities that set size / position / repeat / clip — not a colour. */
const NON_COLOUR_BG = /^(?:cover|contain|auto|center|(?:left|right)?-?(?:top|bottom)|left|right|(?:no-)?repeat(?:-[xy]|-round|-space)?|fixed|local|scroll|clip-[\w-]+|origin-[\w-]+|blend-[\w-]+|size-.+|position-.+|none)$/;

/** The colour a bare `bg-*` utility (variants stripped) paints; undefined when it is not a colour utility. */
function utilityBackground(u: string): Bg | undefined {
  if (NON_COLOUR_BG.test(u)) return undefined;
  const mod = /\/(\d{1,3}|\[[\d.]+%?\])$/.exec(u);
  const base = mod ? u.slice(0, mod.index) : u;
  let alpha = 1;
  if (mod) {
    const raw = (mod[1] ?? "").replace(/^\[|\]$/g, "");
    alpha = (raw.endsWith("%") || !mod[1]?.startsWith("[") ? parseFloat(raw) / 100 : parseFloat(raw));
    if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return "unknown";
  }
  if (base === "transparent") return { luma: 0, alpha: 0 };
  if (base === "white") return { luma: 1, alpha };
  if (base === "black") return { luma: 0, alpha };
  const shade = /^(?:slate|gray|grey|zinc|neutral|stone)-(\d{2,3})$/.exec(base)?.[1];
  const ramp = shade === undefined ? undefined : NEUTRAL_LUMA[shade];
  if (ramp !== undefined) return { luma: ramp, alpha };
  const arb = /^\[(.+)\]$/.exec(base)?.[1];
  const paint = arb === undefined ? null : parseColor(arb.replace(/_/g, " "));
  return paint ? { luma: paint.luma, alpha: paint.alpha * alpha } : "unknown";
}

/** The background a class list sets. An unprefixed utility is the resting state; `dark:` / breakpoint variants may override it, so they poison it. */
function classBackground(classes: string[]): Bg | undefined {
  let out: Bg | undefined;
  for (const token of classes) {
    const m = /^((?:[\w-]+:)*)bg-(.+)$/.exec(token);
    if (!m) continue;
    let v = utilityBackground(m[2] ?? "");
    if (v === undefined) continue;
    const variants = (m[1] ?? "").split(":").filter(Boolean);
    if (variants.length > 0) {
      if (!variants.some((x) => x === "dark" || /^(?:sm|md|lg|xl|2xl|min-.+|max-.+)$/.test(x))) continue; // hover:/focus: — not the resting state
      v = "unknown";
    }
    out = out === undefined || sameBg(out, v) ? v : "unknown";
  }
  return out;
}

// ── Markup model ─────────────────────────────────────────────────────────────

interface El {
  tag: string;
  cls: string[];
  id: string;
  attrs: string;
  style: string;
  parent: El | null;
  /** The start tag spans [start, end); the subtree ends at `close`. */
  start: number;
  end: number;
  close: number;
}

const TAG_RE = /<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
/** Optional-close tags: a second one opened directly under the first is its sibling, not its child. */
const SIBLING_AUTOCLOSE = new Set(["li", "dt", "dd", "option", "tr", "td", "th", "p"]);
const ATTR_CLASS = /(?<![\w:-])(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const ATTR_ID = /(?<![\w:-])id\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;
const ATTR_STYLE = /(?<![\w:-])style\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

const attrOf = (re: RegExp, attrs: string): string => {
  const m = re.exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : "";
};
/** An attribute's value by name; null when absent, "" when present without a value. */
function attrValue(attrs: string, name: string): string | null {
  const m = new RegExp(`(?<![\\w:-])${name}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+)))?(?![\\w-])`, "i").exec(attrs);
  return m ? (m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/** Tag-stack walk of the live markup (offsets preserved). Unclosed elements run to end of input. */
function parseMarkup(markup: string): El[] {
  const els: El[] = [];
  const stack: El[] = [];
  const closeTop = (at: number): void => { const e = stack.pop(); if (e) e.close = at; };
  for (const m of markup.matchAll(TAG_RE)) {
    const at = m.index ?? 0;
    if (m[1] !== undefined) {
      const tag = m[1].toLowerCase();
      let i = stack.length - 1;
      while (i >= 0 && stack[i]?.tag !== tag) i--;
      while (i >= 0 && stack.length > i) closeTop(at); // implicitly closes anything left open above it
      continue;
    }
    const tag = (m[2] ?? "").toLowerCase();
    const attrs = m[3] ?? "";
    if (SIBLING_AUTOCLOSE.has(tag) && stack[stack.length - 1]?.tag === tag) closeTop(at);
    const el: El = {
      tag, attrs, parent: stack[stack.length - 1] ?? null, start: at, end: at + m[0].length, close: markup.length,
      cls: attrOf(ATTR_CLASS, attrs).split(/\s+/).filter(Boolean), id: attrOf(ATTR_ID, attrs), style: attrOf(ATTR_STYLE, attrs),
    };
    els.push(el);
    if (VOID_TAGS.has(tag) || attrs.trimEnd().endsWith("/")) el.close = el.end;
    else stack.push(el);
  }
  return els;
}

/**
 * Guarantee an `html` > `body` spine: a fragment gets synthetic ones, so root rules
 * (`html, body {…}`, `:root {…}`) always have an element to land on and every other
 * element has a root above it.
 */
function attachRoots(els: El[]): { html: El; body: El; synthetic: El[] } {
  const make = (tag: string, parent: El | null): El =>
    ({ tag, cls: [], id: "", attrs: "", style: "", parent, start: -1, end: -1, close: Infinity });
  const synthetic: El[] = [];
  let html = els.find((e) => e.tag === "html");
  if (!html) synthetic.push((html = make("html", null)));
  let body = els.find((e) => e.tag === "body");
  const bodyIsSynthetic = !body;
  if (!body) synthetic.push((body = make("body", html)));
  for (const e of els) {
    if (e.parent !== null || e === html) continue;
    e.parent = e === body || !bodyIsSynthetic ? html : body;
  }
  return { html, body, synthetic };
}

/** The innermost element containing offset `idx`, or null before the first tag. */
function ownerAt(els: El[], idx: number): El | null {
  let lo = 0;
  let hi = els.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((els[mid]?.start ?? Infinity) <= idx) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  let el: El | null = els[best] ?? null;
  while (el && el.close <= idx) el = el.parent;
  return el;
}

// ── Selector model ───────────────────────────────────────────────────────────

/** One compound selector. `exact` is false when part of it (`:not()`, `:nth-child()`, `[a^=b]`) cannot be evaluated. */
interface Compound { tag: string | null; id: string | null; classes: string[]; attrs: Array<[string, string | null]>; state: boolean; pseudoEl: boolean; exact: boolean }
/** `comb` relates a compound to the one before it: descendant " ", child ">", or "~" for a sibling combinator (unevaluable). */
interface Part { comb: " " | ">" | "~"; c: Compound }
type Selector = Part[];

const STATE_PSEUDO = new Set(["hover", "focus", "focus-visible", "focus-within", "active", "visited", "link", "any-link", "checked", "disabled", "enabled", "target", "required", "optional", "invalid", "valid", "placeholder-shown", "indeterminate", "read-only", "read-write", "open"]);
const LEGACY_PSEUDO_EL = new Set(["before", "after", "first-line", "first-letter"]);

function parseCompound(text: string): Compound | null {
  const c: Compound = { tag: null, id: null, classes: [], attrs: [], state: false, pseudoEl: false, exact: true };
  let rest = text;
  const head = /^(\*|[a-zA-Z][\w-]*)/.exec(rest);
  if (head) { c.tag = head[1] === "*" ? null : (head[1] ?? "").toLowerCase(); rest = rest.slice(head[0].length); }
  while (rest.length > 0) {
    let m: RegExpExecArray | null;
    if ((m = /^#([\w-]+)/.exec(rest))) c.id = m[1] ?? null;
    else if ((m = /^\.([\w-]+)/.exec(rest))) c.classes.push(m[1] ?? "");
    else if ((m = /^\[([^\]]*)\]/.exec(rest))) {
      const a = /^\s*([\w:-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"']+)))?\s*$/.exec(m[1] ?? "");
      if (a) c.attrs.push([a[1] ?? "", a[2] ?? a[3] ?? a[4] ?? null]);
      else c.exact = false;
    } else if ((m = /^(::?)([\w-]+)(\((?:[^()]|\([^()]*\))*\))?/.exec(rest))) {
      const name = (m[2] ?? "").toLowerCase();
      if (m[1] === "::" || LEGACY_PSEUDO_EL.has(name)) c.pseudoEl = true;
      else if (STATE_PSEUDO.has(name)) c.state = true;
      else if (name === "root" && m[3] === undefined) c.tag = "html";
      else c.exact = false;
    } else return null;
    rest = rest.slice(m[0].length);
  }
  return c;
}

function parseComplex(text: string): Selector | null {
  const parts: Selector = [];
  let cur = "";
  let depth = 0;
  let comb: Part["comb"] = " ";
  const flush = (): boolean => {
    if (cur === "") return true;
    const c = parseCompound(cur);
    cur = "";
    if (!c) return false;
    parts.push({ comb: parts.length > 0 ? comb : " ", c });
    comb = " ";
    return true;
  };
  for (const ch of text.trim()) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && /[\s>+~]/.test(ch)) {
      if (!flush()) return null;
      if (ch === ">") comb = ">";
      else if (ch === "+" || ch === "~") comb = "~";
      continue;
    }
    cur += ch;
  }
  return flush() && parts.length > 0 ? parts : null;
}

/** Split a selector list on top-level commas (not inside `:is(a, b)` or `[a="x,y"]`). */
function parseSelectorList(text: string): Selector[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map(parseComplex).filter((s): s is Selector => s !== null);
}

const verifies = (c: Compound, el: El): boolean =>
  (c.tag === null || c.tag === el.tag) &&
  (c.id === null || c.id === el.id) &&
  c.classes.every((k) => el.cls.includes(k)) &&
  c.attrs.every(([name, want]) => { const v = attrValue(el.attrs, name); return v !== null && (want === null || v === want); });

/** Does `el` match parts[0..i]? "maybe" = every checkable constraint holds but something could not be evaluated. */
function matchParts(el: El, parts: Selector, i: number): "yes" | "maybe" | "no" {
  const part = parts[i];
  if (!part || !verifies(part.c, el)) return "no";
  const own = part.c.exact ? "yes" : "maybe";
  if (i === 0) return own;
  if (part.comb === "~") return "maybe"; // a sibling relation cannot be checked; the left side is taken on trust
  let best: "yes" | "maybe" | "no" = "no";
  for (let a = el.parent; a; a = part.comb === ">" ? null : a.parent) {
    const s = matchParts(a, parts, i - 1);
    if (s === "yes") { best = "yes"; break; }
    if (s === "maybe") best = "maybe";
  }
  return best === "no" ? "no" : best === "maybe" || own === "maybe" ? "maybe" : "yes";
}

const matchSelectors = (el: El, sels: Selector[]): "yes" | "maybe" | "no" =>
  sels.reduce<"yes" | "maybe" | "no">((acc, s) => {
    if (acc === "yes") return acc;
    const r = matchParts(el, s, s.length - 1);
    return r === "no" ? acc : r;
  }, "no");

// ── Tints ────────────────────────────────────────────────────────────────────

type Tint = "white" | "black";

/** Alpha (0–1) of a CSS colour token — rgba()/hsla()/#rrggbbaa — or null when opaque/unknown. */
function cssAlpha(token: string): number | null {
  const fn = /(?:rgba?|hsla?)\(([^)]*)\)/i.exec(token);
  if (fn) {
    const parts = (fn[1] ?? "").split(/[,/]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 4) { const a = parseFloat(parts[3] ?? ""); return Number.isFinite(a) ? a : null; }
    return null; // no alpha channel → opaque
  }
  const hex8 = /^#([0-9a-fA-F]{8})$/.exec(token);
  if (hex8) return parseInt((hex8[1] ?? "").slice(6, 8), 16) / 255;
  return null;
}

/** Does a colour token name pure white / pure black (ignoring its alpha)? */
function isPureWhite(token: string): boolean {
  return /\bwhite\b|#fff(?:f{0,5})\b|rgba?\(\s*255\s*,\s*255\s*,\s*255|hsla?\(\s*0\s*,\s*0%\s*,\s*100%/i.test(token);
}
function isPureBlack(token: string): boolean {
  return /\bblack\b|#000(?:0{0,5})\b|rgba?\(\s*0\s*,\s*0\s*,\s*0|hsla?\(\s*0\s*,\s*0%\s*,\s*0%/i.test(token);
}

/**
 * Surface-tint CSS props (never `color:` — text tint is not a boundary). The name is
 * anchored: `--card-border: rgba(…)` is a custom property, whose consumer — not the
 * declaration — owns the parent background, so it is not a surface to judge here.
 */
const SURFACE_DECL = /(?<![\w-])(?:-(?:webkit|moz)-)?(background(?:-color)?|border(?:-[a-z]+)?-color|border(?:-[a-z]+)?|box-shadow|outline(?:-color)?)\s*:\s*([^;}]+)/gi;

/** A pure white/black surface tint under the alpha floor; `fill` = it is the element's own background, not an edge drawn over it. */
interface Candidate { tint: Tint; alpha: number; fill: boolean }

/** Every low-alpha pure white/black tint among a block's surface declarations (the first colour token of each value). */
function candidatesIn(decls: string): Candidate[] {
  const out: Candidate[] = [];
  for (const m of decls.matchAll(SURFACE_DECL)) {
    const tok = /(?:rgba?|hsla?)\([^)]*\)|#[0-9a-fA-F]{8}\b/.exec(m[2] ?? "")?.[0];
    if (!tok) continue;
    const alpha = cssAlpha(tok);
    if (alpha === null || alpha >= ALPHA_FLOOR) continue;
    const tint: Tint | null = isPureWhite(tok) ? "white" : isPureBlack(tok) ? "black" : null;
    if (tint) out.push({ tint, alpha, fill: (m[1] ?? "").toLowerCase().startsWith("background") });
  }
  return out;
}

/** Composite the tint over its backdrop and measure: same polarity as the backdrop, and the step it makes is below an edge. */
function invisibleOver(tint: Tint, alpha: number, backdrop: number): boolean {
  if (tint === "white" ? backdrop < DARK_LUMA : backdrop >= DARK_LUMA) return false; // opposite polarity — the correct hairline
  const composite = alpha * (tint === "white" ? 1 : 0) + (1 - alpha) * backdrop;
  return Math.abs(composite - backdrop) < MIN_STEP;
}

export function checkModeInvisibleSurface(html: string): TasteFinding[] {
  const live = blankDeadMarkup(html);
  const els = parseMarkup(live.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi, (_m, open: string, css: string, close: string) => open + blankPreservingNewlines(css) + close));
  const { html: htmlEl, body: bodyEl, synthetic } = attachRoots(els);
  const everyEl = [...els, ...synthetic];
  const canvas = htmlEl.cls.includes("dark") || bodyEl.cls.includes("dark") ? 0 : 1;

  const css = Array.from(live.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi), (m) => m[1] ?? "").join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  const vars = makeVarResolver([css, ...els.map((e) => e.style)]);
  // cssRules hands back everything since the last brace as the "selector", so a preceding
  // statement at-rule (`@import url(…wght@300;400…);`) arrives glued to it. A selector never
  // contains `;`; the text after the last one is the real selector.
  const rules = cssRules(css).map((r) => ({ sels: parseSelectorList(r.selector.slice(r.selector.lastIndexOf(";") + 1)), body: r.body }));
  // A rule only paints an element's resting box when no part of it is a state or a pseudo-element.
  const bgRules = rules.flatMap((r) => {
    const bg = declaredBackground(r.body, vars);
    const sels = r.sels.filter((s) => s.every((p) => !p.c.state && !p.c.pseudoEl));
    return bg !== undefined && sels.length > 0 ? [{ sels, bg }] : [];
  });

  const bgMemo = new Map<El, Bg | undefined>();
  /** What `el` paints behind itself. Disagreeing or unverifiable sources → "unknown" (no cascade is simulated). */
  function backgroundOf(el: El): Bg | undefined {
    if (bgMemo.has(el)) return bgMemo.get(el);
    let out: Bg | undefined = declaredBackground(el.style, vars); // inline beats every rule and utility
    if (out === undefined) {
      const cands: Array<{ v: Bg; sure: boolean }> = [];
      const util = classBackground(el.cls);
      if (util !== undefined) cands.push({ v: util, sure: true });
      for (const r of bgRules) {
        const hit = matchSelectors(el, r.sels);
        if (hit !== "no") cands.push({ v: r.bg, sure: hit === "yes" });
      }
      const first = cands[0]?.v;
      if (first !== undefined) {
        out = cands.every((c) => sameBg(first, c.v)) && cands.some((c) => c.sure) ? first : "unknown";
      }
    }
    bgMemo.set(el, out);
    return out;
  }

  /**
   * The luma a tint on `el` lands on: its ancestors' translucent layers composited bottom-up over the
   * nearest opaque one (or the canvas). `includeSelf` adds `el`'s own paint — right for borders, rings and
   * shadows, which are drawn over the element's own box. null = unresolvable → the caller skips the tint.
   */
  function backdropOf(el: El, includeSelf: boolean): number | null {
    const layers: Paint[] = [];
    let base = canvas;
    for (let a: El | null = includeSelf ? el : el.parent; a; a = a.parent) {
      const bg = backgroundOf(a);
      if (bg === "unknown") return null; // the page itself included: an unreadable root is not a white one
      if (bg === undefined || bg.alpha <= 0) continue;
      if (bg.alpha >= 0.995) { base = bg.luma; break; }
      layers.push(bg);
    }
    return layers.reduceRight((below, p) => p.alpha * p.luma + (1 - p.alpha) * below, base);
  }

  const findings: TasteFinding[] = [];
  const modeOf = (tint: Tint): string => (tint === "white" ? "light" : "dark");
  const tail = "it passes text-contrast but, composited over that background, the boundary is invisible";

  // Source 1 — Tailwind opacity utilities on surface prefixes: bg/border/ring/divide-<color>/<N>.
  const utilRe = /\b(bg|border|ring|divide)-(white|black)\/(\d{1,3})\b/gi;
  for (const m of live.matchAll(utilRe)) {
    const tint = (m[2] ?? "").toLowerCase() as Tint;
    const alpha = parseInt(m[3] ?? "100", 10) / 100;
    if (alpha >= ALPHA_FLOOR) continue;
    const at = m.index ?? 0;
    // A utility is a surface only as an attribute of an element; the same text in prose or a
    // stylesheet is documentation, and has no parent background to composite over.
    const owner = ownerAt(els, at);
    if (!owner || at >= owner.end) continue;
    // `dark:` utilities describe the dark-mode state, whose ancestors' `dark:` backgrounds this scan
    // does not model; and under a dark root they REPLACE the unprefixed utility of the same slot.
    const slot = (m[1] ?? "").toLowerCase();
    if (/(?:^|[\s"'`])(?:[\w-]+:)*dark:(?:[\w-]+:)*$/.test(live.slice(Math.max(0, at - 60), at))) continue;
    if (canvas === 0 && owner.cls.some((t) => t.includes(`dark:${slot}-`))) continue;
    const backdrop = backdropOf(owner, slot !== "bg"); // `bg-` is the element's OWN fill; border/ring/divide land on its surface
    if (backdrop === null || !invisibleOver(tint, alpha, backdrop)) continue;
    findings.push({
      checkId: CHECK_ID, axis: "Depth/Surface", severity: "error",
      message: `${m[1]}-${tint}/${m[3]} is a ~${Math.round(alpha * 100)}% ${tint} surface on a ${modeOf(tint)}-mode background — ${tail}; use a visible ${tint === "white" ? "border/shadow tinted toward the background" : "light hairline"} instead`,
      line: lineOf(html, at),
    });
  }

  // Source 2 — literal low-alpha white/black on a surface prop: inline styles, then <style> rules.
  const report = (tint: Tint, alpha: number): void => {
    findings.push({
      checkId: CHECK_ID, axis: "Depth/Surface", severity: "error",
      message: `a ~${Math.round(alpha * 100)}% ${tint} surface tint on a ${modeOf(tint)}-mode background — ${tail}; raise the alpha or tint toward the background instead`,
    });
  };
  /** `onSelf`: the declaration styles a pseudo-element, which is drawn over its element's own surface. */
  const judge = (cands: Candidate[], carriers: Array<{ el: El; onSelf: boolean }>): void => {
    for (const c of cands) {
      const hit = carriers.some(({ el, onSelf }) => {
        const backdrop = backdropOf(el, onSelf || !c.fill);
        return backdrop !== null && invisibleOver(c.tint, c.alpha, backdrop);
      });
      if (hit) report(c.tint, c.alpha);
    }
  };
  for (const el of els) {
    const cands = candidatesIn(el.style);
    if (cands.length > 0) judge(cands, [{ el, onSelf: false }]);
  }
  for (const r of rules) {
    const cands = candidatesIn(r.body);
    if (cands.length === 0) continue;
    // Judged only on the elements the selector provably reaches. A selector this scan cannot evaluate
    // (`:not()`, sibling combinators) or one no element carries is a detached declaration: skipped.
    const carriers = r.sels
      .filter((s) => s.every((p) => p.c.exact && p.comb !== "~"))
      .flatMap((s) => everyEl
        .filter((el) => matchParts(el, s, s.length - 1) === "yes")
        .map((el) => ({ el, onSelf: s[s.length - 1]?.c.pseudoEl === true })));
    judge(cands, carriers);
  }

  return findings;
}
