/**
 * DS Guidelines Pack — `ontology/glossary.yaml` reader (pure, no fs): the flat
 * `terms: - term / vi / def / avoid` shape ONLY.
 *
 * es-debt: flat glossary shape only, upgrade when a second ontology layout appears.
 * T1: no YAML dependency; any other shape answers a refusal naming its line and cause (skipped whole, never half-read).
 * This is deliberately not a YAML parser: it must not grow into one.
 */
import type { GlossaryTerm } from "./ds-guidelines-glossary-reader.js";

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

/** A value refusal before it knows its line: `why` is the cause, `named` says the field is already in it. */
interface Why { why: string; named: boolean }
const isWhy = (v: unknown): v is Why => typeof v === "object" && v !== null && "why" in v;

const EMPTY_VALUE = "value is empty or opens a nested block, which is not supported";
const UNCLOSED_QUOTE = "quoted value is not closed on this line";
const FLOW_COLLECTION = "flow collection is only supported for `avoid`";
const FLAT_LIST_ONLY = "only a flat `[a, b]` list of plain or quoted values is supported";

/** Index of the quote that closes the value opened at `v[0]`, or -1 (`''` and `\\"` do not close it). */
function closingQuote(v: string): number {
  const quote = v[0];
  for (let i = 1; i < v.length; i++) {
    if (quote === '"' && v[i] === "\\") i++;
    else if (v[i] === quote) {
      if (quote === "'" && v[i + 1] === "'") i++;
      else return i;
    }
  }
  return -1;
}

/** A plain or fully-quoted one-line scalar; a `Why` (one distinct cause per refusal) when it needs real YAML to read. */
function scalar(raw: string): string | Why {
  const no = (cause: string): Why => ({ why: cause, named: false });
  const v = raw.trim();
  if (v === "") return no(EMPTY_VALUE);
  const quote = v[0];
  if (quote === '"' || quote === "'") {
    if (v.length < 2) return no(UNCLOSED_QUOTE);
    if (!v.endsWith(quote)) return no(closingQuote(v) > 0 ? "quoted value is followed by more text" : UNCLOSED_QUOTE);
    if (quote === '"' && v.includes("\\")) return no("double-quoted value contains a backslash escape");
    const inner = v.slice(1, -1);
    return quote === "'" ? inner.replace(/''/g, "'") : inner;
  }
  if (quote === "[" || quote === "{") return no(FLOW_COLLECTION);
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
  const named = (cause: string): Why => ({ why: `\`${field}\`${cause}`, named: true });
  if (!v.startsWith("[")) {
    const one = scalar(v);
    return isWhy(one) ? named(`: ${one.why === FLOW_COLLECTION ? FLAT_LIST_ONLY : one.why}`) : [one];
  }
  if (!v.endsWith("]")) {
    // A `]` outside quotes means the list closed and something follows it; otherwise it never closed.
    const closed = v.replace(/"[^"]*"|'[^']*'/g, "").includes("]");
    return named(closed ? ": text follows the closing `]` of the flow list (a comment or words)" : ": flow list is not closed with `]` on this line");
  }
  const inner = v.slice(1, -1).trim();
  if (inner === "") return [];
  const items: string[] = [];
  for (const part of inner.split(",")) {
    const item = scalar(part);
    if (isWhy(item)) {
      // A comma inside a quoted item also cuts that item in two, so an unclosed quote has two honest causes.
      const cause = item.why === UNCLOSED_QUOTE ? `${UNCLOSED_QUOTE} (or a comma sits inside a quoted item, which is not supported)`
        : item.why === FLOW_COLLECTION ? FLAT_LIST_ONLY : item.why;
      return named(` list item: ${cause}`);
    }
    items.push(item);
  }
  return items;
}

/** Why a line before `terms:` is not a column-0 `key: value` pair: name the byte-level cause when there is one. */
function notATopLevelPair(raw: string, lineNo: number): string {
  if (lineNo === 1 && raw.startsWith("﻿")) return "file starts with a byte-order mark (BOM); save it as UTF-8 without one";
  if (/^---(\s|$)/.test(raw)) return "YAML document marker `---` is not supported";
  if (raw.includes("\r")) return "line endings are a bare CR; use LF or CRLF";
  return "top-level line is not a `key: value` pair at column 0";
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
      if (top === null || indent !== 0) return refuse(lineNo, notATopLevelPair(raw, lineNo));
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
      if (other?.[1] === "term") return refuse(lineNo, "`term:` must start a list entry as `- term: <name>`");
      if (other?.[1] === "terms" && indent === 0) return refuse(lineNo, "duplicate `terms:` key");
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
