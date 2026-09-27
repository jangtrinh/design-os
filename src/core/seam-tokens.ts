/** Small lexical scanner: comments and literal contents never become executable calls. */
export interface SeamToken { text: string; start: number; end: number; scope: number; literal: boolean; newlineBefore: boolean }
export interface SeamLex { tokens: SeamToken[]; pairs: Map<number, number>; parents: Map<number, number> }
export function lexSeam(source: string): SeamLex {
  const tokens: SeamToken[] = []; const pairs = new Map<number, number>();
  const parents = new Map<number, number>(); const stack: number[] = []; let scope = -1;
  for (let i = 0; i < source.length;) {
    const start = i; const c = source[i]!; const next = source[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "/" && next === "/") { while (i < source.length && source[i] !== "\n") i++; continue; }
    if (c === "/" && next === "*") { const end = source.indexOf("*/", i + 2); i = end < 0 ? source.length : end + 2; continue; }
    let literal = false;
    if (c === '"' || c === "'" || c === "`") {
      literal = true; i++;
      while (i < source.length) { if (source[i] === "\\") i += 2; else if (source[i++] === c) break; }
    } else if (c === "/" && /^(?:=|\(|\[|,|:|return|=>|!|\?|\|\||&&)$/.test(tokens.at(-1)?.text ?? "=")) {
      // Regular expression bodies can contain fake reads, quotes and braces.
      i++; let inClass = false;
      while (i < source.length && source[i] !== "\n") {
        const ch = source[i++];
        if (ch === "\\") i++;
        else if (ch === "[") inClass = true;
        else if (ch === "]") inClass = false;
        else if (ch === "/" && !inClass) break;
      }
      while (/[a-z]/i.test(source[i] ?? "")) i++;
      literal = true;
    } else if (/[\w$]/.test(c)) { while (/[\w$]/.test(source[i] ?? "")) i++; }
    else {
      const operator = source.slice(i).match(/^(?:===|!==|=>|==|!=|\?\?|\?\.|&&|\|\||\.\.\.)/)?.[0];
      i += operator?.length ?? 1;
    }
    const text = source.slice(start, i); const index = tokens.length;
    tokens.push({ text, start, end: i, scope, literal, newlineBefore: source.slice(tokens.at(-1)?.end ?? 0, start).includes("\n") });
    if (!literal && ["(", "[", "{"].includes(text)) {
      stack.push(index);
      if (text === "{") { parents.set(index, scope); scope = index; }
    } else if (!literal && [")", "]", "}"].includes(text)) {
      const open = stack.at(-1);
      if (open !== undefined && ["(", "[", "{"].indexOf(tokens[open]!.text) === [")", "]", "}"].indexOf(text)) {
        stack.pop(); pairs.set(open, index); pairs.set(index, open);
        if (text === "}") scope = parents.get(open) ?? -1;
      }
    }
  }
  return { tokens, pairs, parents };
}
export type Span = [number, number];
export function splitSeam(lex: SeamLex, start: number, end: number, separators = [","]): Span[] {
  const spans: Span[] = []; let from = start;
  for (let i = start; i < end; i++) {
    if (separators.includes(lex.tokens[i]!.text)) { spans.push([from, i]); from = i + 1; }
    else { const close = lex.pairs.get(i); if (close !== undefined && close > i) i = close; }
  }
  spans.push([from, end]); return spans.filter(([a, b]) => a < b);
}
export function seamEnd(lex: SeamLex, start: number): number {
  for (let i = start; i < lex.tokens.length; i++) {
    const token = lex.tokens[i]!;
    if ([";", ",", "}"].includes(token.text)) return i;
    // ASI: a fresh declaration or call after a complete expression starts a statement.
    if (i > start && token.newlineBefore &&
      !["=", "+", "-", "?", ":", "&&", "||", "??", "=>", ".", "return"].includes(lex.tokens[i - 1]!.text) &&
      (["const", "let", "var", "return", "import", "export"].includes(token.text) ||
        (/^[A-Za-z_$][\w$]*$/.test(token.text) && ["(", "."].includes(lex.tokens[i + 1]?.text ?? "")))) return i;
    const close = lex.pairs.get(i); if (close !== undefined && close > i) i = close;
  }
  return lex.tokens.length;
}
