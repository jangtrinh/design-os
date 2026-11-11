/**
 * Which `export` keywords of a masked script text stand at statement position (spec 033 FR-019, CD-5). Without a parser the
 * only thing a keyword's surroundings can show is where it sits: a declaration stands at bracket depth 0 and is the first
 * token of its line or directly follows `;` or `}`. Markup text, a regular-expression literal, a namespace body and an
 * ambient module body fail that test and are listed by the caller, never read as a declaration.
 *
 * Depth counts `{ ( [` and their closers from the start of the text. A closer met at depth 0 is ignored: markup text
 * (`<li>1) first</li>`) holds closers that never had an opener, and depth must not go below 0 or every later keyword is
 * wrongly rejected.
 */

/** The offsets among `keywordAt` (ascending) that stand at statement position. */
export function statementPositions(text: string, keywordAt: readonly number[]): Set<number> {
  const standing = new Set<number>();
  let depth = 0;
  let next = 0;
  for (let i = 0; i < text.length && next < keywordAt.length; i++) {
    while (next < keywordAt.length && (keywordAt[next] as number) === i) {
      if (depth === 0 && startsStatement(text, i)) standing.add(i);
      next++;
    }
    const c = text[i] as string;
    if (c === "{" || c === "(" || c === "[") depth++;
    else if ((c === "}" || c === ")" || c === "]") && depth > 0) depth--;
  }
  return standing;
}

/** True when the keyword at `at` is the first token of its line, or the last token before it on its line is `;` or `}`. */
function startsStatement(text: string, at: number): boolean {
  let j = at - 1;
  while (j >= 0 && (text[j] === " " || text[j] === "\t" || text[j] === "\r")) j--;
  return j < 0 || text[j] === "\n" || text[j] === ";" || text[j] === "}";
}
