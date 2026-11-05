/**
 * Offset-preserving masks over JavaScript source embedded in an HTML `<script>`.
 *
 * Two checks need to read script code without reading the prose around it: `window-alert`
 * (a comment or a log string that says `alert(` is not a call) and
 * `scroll-listener-unthrottled` (a comment that mentions `requestAnimationFrame` is not a
 * throttle). Both previously had one option, a regex over raw text, and that matches the
 * documentation of the code as readily as the code.
 *
 * This is a scanner, not a parser: it tracks comment, string and template state and nothing
 * else. Regex literals are not modelled. A quote inside a regex can therefore open a string
 * that runs to the end of its line (the scan stops a quote-delimited string at a newline, so
 * the damage is bounded to one line and the mask can only under-report, never invent a call).
 * Template literals are masked whole, `${…}` bodies included, because a call inside an
 * interpolation inside a log message is a rarer thing than a message that merely contains
 * the word.
 *
 * Output has the SAME length and the SAME newlines as the input, so an index into the mask
 * is an index into the source and line numbers stay true.
 */

const blank = (s: string): string => s.replace(/[^\n]/g, " ");

/**
 * Blank every comment; with `maskStrings` also blank the contents of every string and
 * template literal (the delimiters stay, so `"x"` becomes `" "`).
 */
export function maskJs(js: string, maskStrings: boolean): string {
  let out = "";
  let i = 0;
  const n = js.length;
  while (i < n) {
    const c = js[i] as string;
    const next = js[i + 1];
    if (c === "/" && next === "/") {
      let j = js.indexOf("\n", i);
      if (j === -1) j = n;
      out += blank(js.slice(i, j));
      i = j;
    } else if (c === "/" && next === "*") {
      let j = js.indexOf("*/", i + 2);
      j = j === -1 ? n : j + 2;
      out += blank(js.slice(i, j));
      i = j;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        const d = js[j] as string;
        if (d === "\\") { j += 2; continue; }
        if (d === c) break;
        // A quote-delimited string cannot span lines; stop there so one stray quote
        // (a regex literal, an apostrophe in a pasted comment) cannot mask the rest.
        if (d === "\n" && c !== "`") break;
        j++;
      }
      const end = Math.min(j, n);
      const body = js.slice(i + 1, end);
      out += c + (maskStrings ? blank(body) : body);
      if (end < n && js[end] === c) out += c;
      i = js[end] === c ? end + 1 : end;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** One inline `<script>` body with its offset in the document. */
export interface InlineScript {
  /** Script source, comments (and optionally strings) masked; same length as the original. */
  code: string;
  /** Offset of `code[0]` in the document, for line numbers. */
  start: number;
}

/** `type` values a browser runs as JavaScript. Anything else (JSON-LD, importmap, templates) is data. */
const JS_TYPES = /^(?:|module|(?:text|application)\/(?:x-)?(?:java|ecma)script)$/i;

/**
 * Every inline classic or module script in the document, masked. External scripts
 * (`src=`) have no body here and are not followed: the checks that use this read only what
 * the page itself ships inline, and say so.
 *
 * `html` should already be comment-stripped (`stripCommentsPreservingOffsets`) so a
 * commented-out `<script>` is not read.
 */
export function inlineScripts(html: string, maskStrings: boolean): InlineScript[] {
  const out: InlineScript[] = [];
  for (const m of html.matchAll(/(<script\b([^>]*)>)([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = m[2] ?? "";
    const type = /(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const typeValue = (type?.[1] ?? type?.[2] ?? type?.[3] ?? "").trim();
    if (!JS_TYPES.test(typeValue)) continue;
    if (/(?:^|\s)src\s*=/i.test(attrs)) continue;
    out.push({ code: maskJs(m[3] ?? "", maskStrings), start: m.index + (m[1] ?? "").length });
  }
  return out;
}
