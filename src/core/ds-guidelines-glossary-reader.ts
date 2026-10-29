/**
 * DS Guidelines Pack — glossary term model, `CONTEXT.md` reader + merge (pure, no fs).
 *
 *  - `CONTEXT.md`: entries `**Term**:` + definition lines + an optional `_Avoid_: a, b` line.
 *    Read from the `## Language` section when the file has one, else from the whole file.
 *  - `ontology/glossary.yaml` is read by `ds-guidelines-glossary-yaml-reader.ts` (flat shape only).
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
