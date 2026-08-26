/**
 * In-file waivers that travel with the source.
 *
 * design:os's only waiver until now was `ui gate --skip <family>:<reason>` —
 * whole-family, at the gate, invisible from the file it excuses. A polyglot
 * linter needs a finer one, in whatever comment syntax the file happens to use:
 *
 *   <!-- design-os-disable side-tab -- exported brand doc -->
 *   .brand { font-family: Inter } /* design-os-disable-line overused-font -- client mandate *\/
 *   // design-os-disable-next-line pulsing-dot -- genuinely live data
 *
 * Three scopes: `-disable` waives the whole file, `-line` waives the line the
 * comment sits on, `-next-line` waives the following line. Ids are a
 * comma-separated list, or `*` / omitted for every rule.
 *
 * A REASON IS MANDATORY. `ui gate --skip` already requires one; a waiver with no
 * stated why is how a suppression habit starts, and the count of waived findings
 * is reported so the habit stays visible. A directive with no reason is not
 * silently ignored — it is returned as malformed, so the author learns.
 */

/** One parsed waiver. */
export interface InlineIgnore {
  /** Rule ids this waives; empty means every rule. */
  checkIds: string[];
  /** 1-based line the directive was written on. */
  declaredLine: number;
  /** Lines this waiver covers; `undefined` means the whole file. */
  appliesToLine?: number;
  reason: string;
}

/** A directive that parsed as a directive but is not usable. */
export interface MalformedIgnore {
  declaredLine: number;
  raw: string;
  problem: "missing-reason";
}

export interface IgnoreScan {
  ignores: InlineIgnore[];
  malformed: MalformedIgnore[];
}

/**
 * `design-os-disable[-line|-next-line] [ids] -- reason`
 *
 * The ` -- ` separator is required and is what carries the reason. Matching is
 * deliberately anchored on the directive keyword rather than on a comment
 * syntax, so one scanner serves HTML, CSS, JS/TS, Swift and Dart. The trade is
 * that a directive inside a string literal would match; that is acceptable —
 * over-honouring a waiver the author wrote on purpose is a smaller failure than
 * missing one, and the waived count is printed either way.
 */
const DIRECTIVE =
  /design-os-disable(-next-line|-line)?((?:\s+(?!--)[A-Za-z0-9*,-]+)*)\s*(?:--[ \t]*(.*?))?\s*$/;

/**
 * Strip the trailing comment terminator before matching.
 *
 * Without this, `<!-- design-os-disable side-tab -->` parses the `--` of the
 * HTML terminator as the reason separator and reports the reason as `>`, so a
 * waiver with NO reason is honoured. The repo has paid for the general form of
 * this before: strip the commentary, then match — an assertion that reads a
 * file's prose instead of its instructions is not an assertion.
 */
function stripCommentTail(line: string): string {
  return line.replace(/(?:-->|\*\/)[ \t]*$/, "").trimEnd();
}

/** 1-based line number of a byte offset. */
function lineAt(src: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/** Parse every directive in a source file. Pure; no filesystem, no regex state. */
export function scanInlineIgnores(src: string): IgnoreScan {
  const ignores: InlineIgnore[] = [];
  const malformed: MalformedIgnore[] = [];

  for (const [offset, rawLine] of eachLine(src)) {
    const m = DIRECTIVE.exec(stripCommentTail(rawLine));
    if (m === null) continue;

    const declaredLine = lineAt(src, offset);
    const reason = (m[3] ?? "").trim();
    if (reason === "") {
      malformed.push({ declaredLine, raw: rawLine.trim(), problem: "missing-reason" });
      continue;
    }

    const ids = (m[2] ?? "")
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s !== "" && s !== "*");

    const scope = m[1];
    ignores.push({
      checkIds: ids,
      declaredLine,
      appliesToLine:
        scope === "-line" ? declaredLine : scope === "-next-line" ? declaredLine + 1 : undefined,
      reason,
    });
  }

  return { ignores, malformed };
}

/** Yield [byteOffset, lineText] for each line, without allocating a split copy per call. */
function* eachLine(src: string): Generator<[number, string]> {
  let start = 0;
  for (let i = 0; i <= src.length; i++) {
    if (i === src.length || src[i] === "\n") {
      yield [start, src.slice(start, i)];
      start = i + 1;
    }
  }
}

/** True when this waiver covers this finding. */
function covers(ignore: InlineIgnore, checkId: string, line: number | undefined): boolean {
  if (ignore.checkIds.length > 0 && !ignore.checkIds.includes(checkId)) return false;
  if (ignore.appliesToLine === undefined) return true; // whole-file scope
  return line === ignore.appliesToLine;
}

export interface FilterResult<T> {
  kept: T[];
  /** What each waiver excused, so the total stays visible in the report. */
  waived: Array<{ checkId: string; line?: number; reason: string }>;
}

/**
 * Drop findings a waiver covers, and account for every one dropped.
 *
 * Nothing vanishes silently: a waived finding leaves a record carrying the
 * reason its author wrote, and callers print the count.
 */
export function applyInlineIgnores<T extends { checkId: string; line?: number }>(
  findings: readonly T[],
  scan: IgnoreScan,
): FilterResult<T> {
  const kept: T[] = [];
  const waived: FilterResult<T>["waived"] = [];

  for (const f of findings) {
    const hit = scan.ignores.find((ig) => covers(ig, f.checkId, f.line));
    if (hit === undefined) kept.push(f);
    else waived.push({ checkId: f.checkId, line: f.line, reason: hit.reason });
  }

  return { kept, waived };
}
