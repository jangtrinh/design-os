/**
 * DS Guidelines Pack — linter for one rendered file (pure, no fs).
 *
 * Phase-1 checks:
 *   UNKNOWN_NAME             a `token:` / `component:` span names something the sealed
 *                            design system does not contain (T4: only explicit spans are read)
 *   GENERATED_BLOCK_TAMPERED a sealed block's body no longer matches its sha, or the
 *                            block markers are damaged (T5)
 * `term:` spans have nothing to resolve against until a glossary exists; they are
 * COUNTED, never judged, so the report cannot claim a verdict it did not reach.
 */
import { levenshtein } from "./flag-guard.js";
import { parseGeneratedBlocks } from "./ds-guidelines-render.js";

export interface KnownNames {
  tokens: ReadonlySet<string>;
  components: ReadonlySet<string>;
}

export interface Finding {
  code: "UNKNOWN_NAME" | "GENERATED_BLOCK_TAMPERED";
  severity: "error";
  /** Pack-relative path. */
  file: string;
  /** 1-based. */
  line: number;
  message: string;
}

export interface LintResult {
  findings: Finding[];
  termSpansUnchecked: number;
}

const NAME_SPAN_RE = /`(token|component|term):([^`\n]+)`/g;
const SUGGESTION_MAX_DISTANCE = 3;

function nearest(name: string, known: ReadonlySet<string>): string | undefined {
  let best: string | undefined;
  let bestDistance = Infinity;
  for (const candidate of [...known].sort()) {
    const d = levenshtein(name, candidate);
    if (d < bestDistance) { best = candidate; bestDistance = d; }
  }
  return bestDistance <= SUGGESTION_MAX_DISTANCE ? best : undefined;
}

export function lintGuidelinesFile(file: string, text: string, known: KnownNames): LintResult {
  const findings: Finding[] = [];
  const { blocks, problems } = parseGeneratedBlocks(text);

  for (const b of blocks) {
    if (b.sha === b.actualSha) continue;
    findings.push({
      code: "GENERATED_BLOCK_TAMPERED", severity: "error", file, line: b.line,
      message: `generated block '${b.id}' was edited (sha ${b.sha} != ${b.actualSha}) — restore it by re-running 'ui ds guidelines build'`,
    });
  }
  for (const p of problems) {
    findings.push({ code: "GENERATED_BLOCK_TAMPERED", severity: "error", file, line: p.line, message: p.message });
  }

  let termSpansUnchecked = 0;
  text.split("\n").forEach((line, idx) => {
    for (const m of line.matchAll(NAME_SPAN_RE)) {
      const kind = m[1];
      const name = m[2] ?? "";
      if (kind === "term") { termSpansUnchecked++; continue; }
      const pool = kind === "token" ? known.tokens : known.components;
      if (pool.has(name)) continue;
      const hint = nearest(name, pool);
      findings.push({
        code: "UNKNOWN_NAME", severity: "error", file, line: idx + 1,
        message: `\`${kind}:${name}\` is not in the design system${hint !== undefined ? ` — did you mean \`${kind}:${hint}\`?` : ""}`,
      });
    }
  });

  findings.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
  return { findings, termSpansUnchecked };
}
