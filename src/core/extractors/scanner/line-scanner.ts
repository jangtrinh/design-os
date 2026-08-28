/**
 * The shared line-scanner base for source languages with no cascade to resolve.
 *
 * SwiftUI, Flutter and JSX state their design in literals — `.cornerRadius(16)`,
 * `BorderRadius.circular(16)`, `rounded-2xl`. A scanner reads those exactly. It
 * cannot read a value behind a constant, a theme lookup or a ternary, and the
 * honest response to those is to COUNT them, not to guess: every extractor built
 * on this base emits at `literal` confidence and its output is labelled
 * UNDERCOUNT.
 *
 * One base, not one per language: the comment/string stripping, the number and
 * colour readers and the line arithmetic are identical everywhere, and a second
 * copy is how two extractors drift apart on the same bug.
 *
 * Proven before it was planned — `plans/260826-1603-.../evidence/` holds the
 * prototype that read 8 tells from SwiftUI and 9 from Flutter with rules written
 * once, and a clean file of each producing zero.
 */

/** A match with its 1-based line. */
export interface Hit<T> {
  value: T;
  line: number;
}

/**
 * Blank out comments and string literals, preserving every byte offset.
 *
 * Matching over raw source finds directives inside comments and design values
 * inside strings. The repo has paid for the general form of this: an assertion
 * once matched the COMMENT explaining a flag rather than the flag. Offsets are
 * preserved so line numbers stay true.
 */
export function stripNoise(src: string, opts: { hash?: boolean } = {}): string {
  const out = src.split("");
  let i = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//" || (opts.hash === true && src[i] === "#")) {
      const end = src.indexOf("\n", i);
      blank(i, end < 0 ? src.length : end);
      i = end < 0 ? src.length : end;
      continue;
    }
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      blank(i, end < 0 ? src.length : end + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === "\\") j++;
        j++;
      }
      // Keep the quotes so a caller can still see that a string WAS here; blank
      // the body so its contents never masquerade as code.
      blank(i + 1, j);
      i = j + 1;
      continue;
    }
    i++;
  }
  return out.join("");
}

/** Build a line-index once, then answer offset → line in O(log n). */
export function lineIndex(src: string): (offset: number) => number {
  const starts: number[] = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return (offset: number): number => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Every match of `re` in `src`, with its line. `re` must be global. */
export function scan(src: string, re: RegExp, toLine: (o: number) => number): Array<Hit<RegExpMatchArray>> {
  const out: Array<Hit<RegExpMatchArray>> = [];
  for (const m of src.matchAll(re)) {
    if (m.index === undefined) continue;
    out.push({ value: m, line: toLine(m.index) });
  }
  return out;
}

/** Parse a number, or undefined — never a guess. */
export function num(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Normalise a hex-ish token to a 6-digit lower-case hex, alpha dropped. */
export function hex6(raw: string): string | undefined {
  const clean = raw.replace(/^#/, "").replace(/^0x/i, "").toLowerCase();
  if (/^[0-9a-f]{8}$/.test(clean)) return clean.slice(2); // 0xAARRGGBB (Flutter)
  if (/^[0-9a-f]{6}$/.test(clean)) return clean;
  if (/^[0-9a-f]{3}$/.test(clean)) return clean.split("").map((c) => c + c).join("");
  return undefined;
}

/** 0..1 channel triple → 6-digit hex. SwiftUI's `Color(red:green:blue:)`. */
export function unitRgbToHex(r: number, g: number, b: number): string {
  const c = (n: number): string =>
    Math.max(0, Math.min(255, Math.round(n <= 1 ? n * 255 : n)))
      .toString(16)
      .padStart(2, "0");
  return `${c(r)}${c(g)}${c(b)}`;
}

/**
 * A read the scanner could see but not resolve.
 *
 * Named rather than counted anonymously so the report can say WHAT it could not
 * follow — "12 theme lookups" is actionable, "12 unresolved" is not.
 */
export const UNRESOLVABLE = {
  variable: "value behind a variable",
  themeLookup: "theme or design-token lookup",
  conditional: "conditional expression",
  interpolation: "string interpolation",
  computed: "computed expression",
} as const;
