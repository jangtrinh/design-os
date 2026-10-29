/**
 * DS Guidelines Pack — glossary readers + merge (pure, no fs).
 *
 *  - `CONTEXT.md`: entries `**Term**:` + definition lines + an optional `_Avoid_: a, b` line.
 *    Read from the `## Language` section when the file has one, else from the whole file.
 *  - `ontology/glossary.yaml`: the flat `terms: - term / vi / def / avoid` shape ONLY.
 *
 * es-debt: flat glossary shape only, upgrade when a second ontology layout appears.
 * T1: no YAML dependency; any other shape answers a refusal naming its line and cause (skipped whole, never half-read).
 */
import { compareText } from "./ds-guidelines-model.js";

export interface GlossaryTerm {
  term: string;
  def: string;
  avoid: string[];
  vi?: string;
  /** Display path of the file the entry came from. */
  source: string;
}

export interface TermConflict {
  term: string;
  /** Source whose entry is kept (CONTEXT.md is read first, so it wins). */
  kept: string;
  overridden: string;
  /** Which parts differ: "definition", "avoid" or "duplicate" (same file twice). */
  fields: string[];
}

// ─── CONTEXT.md ───────────────────────────────────────────────────────────────

/** Remove `<!-- … -->` (also across lines); `state.open` carries an unterminated comment forward. */
function stripComments(line: string, state: { open: boolean }): string {
  let out = "";
  let rest = line;
  for (;;) {
    if (state.open) {
      const end = rest.indexOf("-->");
      if (end < 0) return out;
      rest = rest.slice(end + 3);
      state.open = false;
    }
    const start = rest.indexOf("<!--");
    if (start < 0) return out + rest;
    out += rest.slice(0, start);
    rest = rest.slice(start + 4);
    state.open = true;
  }
}

/** Split an `_Avoid_:` list on commas outside parentheses; drop the parenthetical explanations. */
function parseAvoidList(raw: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { items.push(cur); cur = ""; } else cur += ch;
  }
  items.push(cur);
  return items
    .map((i) => i.replace(/\s*\(.*$/, "").replace(/^["'“”]+|["'“”.]+$/g, "").trim())
    .filter((i) => i !== "");
}

export function parseContextTerms(text: string, path: string): GlossaryTerm[] {
  const comment = { open: false };
  const lines = text.split(/\r?\n/).map((l) => stripComments(l, comment));
  const hasLanguage = lines.some((l) => /^##\s+Language\s*$/.test(l));
  const out: GlossaryTerm[] = [];
  let inScope = !hasLanguage;
  let cur: { term: string; def: string[]; avoid: string[] } | null = null;
  const flush = (): void => {
    if (cur !== null) out.push({ term: cur.term, def: cur.def.join(" ").replace(/\s+/g, " ").trim(), avoid: cur.avoid, source: path });
    cur = null;
  };
  for (const line of lines) {
    if (hasLanguage && /^##\s/.test(line)) { flush(); inScope = /^##\s+Language\s*$/.test(line); continue; }
    if (!inScope) continue;
    const head = /^\*\*(.+?)\*\*:\s*$/.exec(line);
    if (head !== null) { flush(); cur = { term: (head[1] ?? "").trim(), def: [], avoid: [] }; continue; }
    if (cur === null) continue;
    if (line.trim() === "" || line.startsWith("#")) { flush(); continue; }
    const avoid = /^_Avoid_:\s*(.*)$/.exec(line.trim());
    if (avoid !== null) cur.avoid.push(...parseAvoidList(avoid[1] ?? ""));
    else cur.def.push(line.trim());
  }
  flush();
  return out.filter((t) => t.term !== "");
}

// ─── ontology/glossary.yaml (flat shape only) ─────────────────────────────────

/** Why the flat reader refused a file. `line` is 1-based in the original text; 0 = the file as a whole. */
export interface GlossaryRefusal {
  line: number;
  reason: string;
}

export type GlossaryParse = { ok: true; terms: GlossaryTerm[] } | ({ ok: false } & GlossaryRefusal);

/** `line 48: <reason>`, or just `<reason>` for a whole-file refusal. Deterministic; carries no path. */
export function formatGlossaryRefusal(r: GlossaryRefusal): string {
  return r.line > 0 ? `line ${r.line}: ${r.reason}` : r.reason;
}

/** A value refusal before it knows its line: `why` is the cause, `field` (when set) is already named in it. */
interface Why { why: string; named: boolean }
const isWhy = (v: unknown): v is Why => typeof v === "object" && v !== null && "why" in v;

const EMPTY_VALUE = "value is empty or opens a nested block, which is not supported";
const UNCLOSED_QUOTE = "quoted value is not closed on this line";

/** A plain or fully-quoted one-line scalar; a `Why` (one distinct cause per refusal) when it needs real YAML to read. */
function scalar(raw: string): string | Why {
  const no = (cause: string): Why => ({ why: cause, named: false });
  const v = raw.trim();
  if (v === "") return no(EMPTY_VALUE);
  const quote = v[0];
  if (quote === '"' || quote === "'") {
    if (v.length < 2) return no(UNCLOSED_QUOTE);
    if (!v.endsWith(quote)) return no(v.indexOf(quote, 1) > 0 ? "quoted value is followed by more text" : UNCLOSED_QUOTE);
    if (quote === '"' && v.includes("\\")) return no("double-quoted value contains a backslash escape");
    const inner = v.slice(1, -1);
    return quote === "'" ? inner.replace(/''/g, "'") : inner;
  }
  if (quote === "[" || quote === "{") return no("flow collection is only supported for `avoid`");
  if (quote === "|" || quote === ">") return no("block scalar (`|` or `>`) is not supported");
  if (quote === "&" || quote === "*" || quote === "!") return no("anchor, alias or tag is not supported");
  if (quote === "%" || quote === "@" || quote === "`" || quote === "#") return no(`value starts with a YAML indicator (\`${quote}\`)`);
  if (v.includes(": ") || v.endsWith(":")) return no("plain value contains a colon (quote the value)");
  if (v.includes(" #")) return no("plain value has a trailing comment (remove it or quote the value)");
  return v;
}

/** The `avoid:` value: an inline `[a, b]` list or one scalar. Its refusals already name the field. */
function flowOrScalar(raw: string, field: string): string[] | Why {
  const v = raw.trim();
  if (!v.startsWith("[")) {
    const one = scalar(v);
    return isWhy(one) ? { why: `\`${field}\`: ${one.why}`, named: true } : [one];
  }
  if (!v.endsWith("]")) return { why: `\`${field}\`: flow list is not closed with \`]\` on this line`, named: true };
  const inner = v.slice(1, -1).trim();
  if (inner === "") return [];
  const items: string[] = [];
  for (const part of inner.split(",")) {
    const item = scalar(part);
    if (isWhy(item)) {
      // A comma inside a quoted item also cuts that item in two, so an unclosed quote has two honest causes.
      const cause = item.why === UNCLOSED_QUOTE ? `${UNCLOSED_QUOTE} (or a comma sits inside a quoted item, which is not supported)` : item.why;
      return { why: `\`${field}\` list item: ${cause}`, named: true };
    }
    items.push(item);
  }
  return items;
}

/**
 * Parse the flat glossary. A refusal (`ok: false`) carries the 1-based line and the specific cause; the caller
 * records it as a skipped source and keeps building.
 */
export function parseGlossaryYaml(text: string, path: string): GlossaryParse {
  const out: GlossaryTerm[] = [];
  let inTerms = false;
  let itemIndent = -1;
  let curLine = 0;
  let cur: Partial<Record<"term" | "def" | "vi", string>> & { avoid?: string[] } | null = null;
  const refuse = (line: number, reason: string): GlossaryParse => ({ ok: false, line, reason });
  const refuseValue = (line: number, field: string, w: Why): GlossaryParse =>
    refuse(line, w.named ? w.why : `\`${field}\`: ${w.why}`);
  /** Close the entry in progress; a refusal when it has no `def`. */
  const flush = (): GlossaryParse | null => {
    if (cur === null) return null;
    if (cur.term === undefined || cur.def === undefined) return refuse(curLine, "entry has no `def`");
    out.push({ term: cur.term, def: cur.def, avoid: cur.avoid ?? [], ...(cur.vi !== undefined ? { vi: cur.vi } : {}), source: path });
    cur = null;
    return null;
  };
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? "";
    const lineNo = i + 1;
    if (raw.trim() === "" || /^\s*#/.test(raw)) continue;
    const indent = raw.length - raw.trimStart().length;
    const body = raw.trim();
    if (!inTerms) {
      const top = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(raw);
      if (top === null || indent !== 0) return refuse(lineNo, "top-level line is not a `key: value` pair at column 0");
      if (top[1] === "terms") {
        if ((top[2] ?? "").trim() !== "") return refuse(lineNo, "`terms:` has an inline value; only a block list of `- term:` entries is supported");
        inTerms = true;
      } else {
        const v = scalar(top[2] ?? "");
        if (isWhy(v)) return refuseValue(lineNo, top[1] ?? "", v);
      }
      continue;
    }
    const item = /^- term:\s*(.*)$/.exec(body);
    if (item !== null) {
      if (itemIndent >= 0 && indent !== itemIndent) return refuse(lineNo, "`- term:` entry is indented differently from the earlier entries");
      itemIndent = indent;
      const closed = flush();
      if (closed !== null) return closed;
      const term = scalar(item[1] ?? "");
      if (isWhy(term)) return refuseValue(lineNo, "term", term);
      cur = { term };
      curLine = lineNo;
      continue;
    }
    const kv = /^(vi|def|avoid):\s*(.*)$/.exec(body);
    if (kv === null) {
      const other = /^([A-Za-z_][\w-]*):/.exec(body);
      if (body.startsWith("- ")) return refuse(lineNo, "list entry is not in the form `- term: <name>`");
      if (other !== null && indent === 0) return refuse(lineNo, `top-level key \`${other[1]}\` after \`terms:\` is not supported (\`terms:\` must be the last top-level key)`);
      if (other !== null) return refuse(lineNo, `unknown field \`${other[1]}\` (supported: term, vi, def, avoid)`);
      return refuse(lineNo, "line is not a `- term:` entry or a `key: value` field");
    }
    const key = kv[1] as "vi" | "def" | "avoid";
    if (cur === null) return refuse(lineNo, `\`${key}\` appears before the first \`- term:\` entry`);
    if (indent !== itemIndent + 2) return refuse(lineNo, `\`${key}\` is not indented two spaces under its \`- term:\` entry`);
    if (cur[key] !== undefined) return refuse(lineNo, `\`${key}\` is set twice in one entry`);
    if (key === "avoid") {
      const list = flowOrScalar(kv[2] ?? "", key);
      if (isWhy(list)) return refuseValue(lineNo, key, list);
      cur.avoid = list;
    } else {
      const v = scalar(kv[2] ?? "");
      if (isWhy(v)) return refuseValue(lineNo, key, v);
      cur[key] = v;
    }
  }
  if (!inTerms) return refuse(0, "no `terms:` list found");
  const closed = flush();
  return closed ?? { ok: true, terms: out };
}

// ─── merge ────────────────────────────────────────────────────────────────────

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x.toLowerCase() === (b[i] ?? "").toLowerCase());

/** Merge by case-insensitive term; earlier lists win (pass CONTEXT.md first). Disagreements are returned. */
export function mergeTerminology(...lists: GlossaryTerm[][]): { terms: GlossaryTerm[]; conflicts: TermConflict[] } {
  const byKey = new Map<string, GlossaryTerm>();
  const conflicts: TermConflict[] = [];
  for (const t of lists.flat()) {
    const key = t.term.toLowerCase();
    const kept = byKey.get(key);
    if (kept === undefined) { byKey.set(key, t); continue; }
    const fields = kept.source === t.source
      ? ["duplicate"]
      : [...(kept.def !== t.def ? ["definition"] : []), ...(sameList(kept.avoid, t.avoid) ? [] : ["avoid"])];
    if (fields.length > 0) conflicts.push({ term: kept.term, kept: kept.source, overridden: t.source, fields });
    if (kept.vi === undefined && t.vi !== undefined) byKey.set(key, { ...kept, vi: t.vi });
  }
  const terms = [...byKey.values()].sort((a, b) => compareText(a.term, b.term));
  return { terms, conflicts: conflicts.sort((a, b) => compareText(a.term, b.term)) };
}
