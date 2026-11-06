/**
 * CSS block structure with NESTING kept — which selector chain a declaration
 * lives under. Compiled framework CSS (Tailwind v4) nests variants natively
 * (`.hover\:x { &:hover { @media (hover: hover) { … } } }`), so a flat
 * `selector { body }` regex reads the innermost `&:hover` as the selector and
 * loses the class that names the rule. Origin attribution needs that class.
 *
 * One linear pass; comments and quoted strings are skipped so a `{` inside
 * `content: "{"` is not a block.
 */

export interface CssBlock {
  /** Offset of the `{`. */
  start: number;
  /** Offset of the matching `}` (or the text end when unclosed). */
  end: number;
  /** The text before the `{`: a selector list or an at-rule prelude, trimmed. */
  prelude: string;
  /** Index of the enclosing block, or -1. */
  parent: number;
}

export interface CssDeclaration {
  /** `prop: value`, trimmed, without the `;`. */
  text: string;
  /** Index of the block that directly holds it. */
  block: number;
  /** Offset of its first character. */
  offset: number;
}

/** Parse the block tree and the declarations directly inside each block. */
export function cssStructure(css: string): { blocks: CssBlock[]; declarations: CssDeclaration[] } {
  const blocks: CssBlock[] = [];
  const declarations: CssDeclaration[] = [];
  const stack: number[] = [];
  let segStart = 0;
  let paren = 0; // a `;` inside url(...) / data URIs is not a declaration end
  let i = 0;
  const flushDecl = (endAt: number): void => {
    const raw = css.slice(segStart, endAt);
    const text = raw.trim();
    if (stack.length > 0 && text !== "" && text.includes(":")) {
      declarations.push({ text, block: stack[stack.length - 1] as number, offset: segStart + (raw.length - raw.trimStart().length) });
    }
  };
  while (i < css.length) {
    const c = css[i] as string;
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (c === "\\") { i += 2; continue; } // an escape (`\'` in a Tailwind selector) is never a quote or brace
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c) j += css[j] === "\\" ? 2 : 1;
      i = j + 1;
      continue;
    }
    if (c === "(") paren++;
    else if (c === ")") paren = Math.max(0, paren - 1);
    else if (c === "{") {
      paren = 0;
      blocks.push({ start: i, end: css.length, prelude: css.slice(segStart, i).trim(), parent: stack.length > 0 ? (stack[stack.length - 1] as number) : -1 });
      stack.push(blocks.length - 1);
      segStart = i + 1;
    } else if (c === "}") {
      paren = 0;
      flushDecl(i);
      const top = stack.pop();
      if (top !== undefined) (blocks[top] as CssBlock).end = i;
      segStart = i + 1;
    } else if (c === ";" && paren === 0) {
      flushDecl(i);
      segStart = i + 1;
    }
    i++;
  }
  return { blocks, declarations };
}

/** Preludes from the outermost block down to `idx`. */
export function chainOf(blocks: readonly CssBlock[], idx: number): string[] {
  const out: string[] = [];
  for (let k = idx; k !== -1; k = (blocks[k] as CssBlock).parent) out.unshift((blocks[k] as CssBlock).prelude);
  return out;
}

/** The innermost block containing `offset`, or -1. Blocks are in start order. */
export function blockAt(blocks: readonly CssBlock[], offset: number): number {
  let lo = 0, hi = blocks.length - 1, best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((blocks[mid] as CssBlock).start <= offset) { best = mid; lo = mid + 1; } else hi = mid - 1;
  }
  for (let k = best; k !== -1; k = (blocks[k] as CssBlock).parent) {
    const b = blocks[k] as CssBlock;
    if (b.start <= offset && offset <= b.end) return k;
  }
  return -1;
}

/**
 * The selector chains (outer → inner, joined by " ") of every declaration that
 * passes `test` — the sites an aggregate rule reports as its `subjects`.
 */
export function declarationSites(css: string, test: (decl: string) => boolean): string[] {
  const { blocks, declarations } = cssStructure(css);
  const out = new Set<string>();
  for (const d of declarations) if (test(d.text)) out.add(chainOf(blocks, d.block).join(" "));
  return [...out];
}

/**
 * Every site of a one-per-document finding (motion, type scale): the selector chain of each
 * matching stylesheet declaration, plus "[inline style]" for a matching style
 * attribute. Origin attribution reads these; one authored site keeps the finding
 * authored even when the first match was a kit utility.
 */
export function documentDeclarationSites(html: string, decl: RegExp | ((d: string) => boolean)): string[] {
  const test = typeof decl === "function" ? decl : (d: string): boolean => decl.test(d);
  const sites: string[] = [];
  for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) sites.push(...declarationSites(m[1] ?? "", test));
  for (const m of html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
    if ((m[1] ?? m[2] ?? "").split(";").some((d) => test(d.trim()))) { sites.push("[inline style]"); break; }
  }
  return [...new Set(sites)];
}
