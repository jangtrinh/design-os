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
import { hostWrittenLines, parseGeneratedBlocks } from "./ds-guidelines-render.js";

export interface KnownNames {
  tokens: ReadonlySet<string>;
  components: ReadonlySet<string>;
}

/** What a file is linted against. */
export interface LintContext {
  known: KnownNames;
  /** Ruling ids the owner has superseded; host-written text must not cite them. */
  supersededIds: ReadonlySet<string>;
}

export interface Finding {
  code: "UNKNOWN_NAME" | "GENERATED_BLOCK_TAMPERED" | "SUPERSEDED_CITED" | "DUPLICATE_RULE" | "PACK_INCOMPLETE";
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

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Host-written lines (outside generated blocks) that cite a superseded ruling id. */
function supersededCitations(file: string, text: string, ids: ReadonlySet<string>): Finding[] {
  if (ids.size === 0) return [];
  const patterns = [...ids].sort().map((id) => ({ id, re: new RegExp(`(?<![A-Za-z0-9_-])${escapeRegExp(id)}(?![A-Za-z0-9_-])`) }));
  const findings: Finding[] = [];
  for (const { line, text: t } of hostWrittenLines(text)) {
    for (const { id, re } of patterns) {
      if (!re.test(t)) continue;
      findings.push({
        code: "SUPERSEDED_CITED", severity: "error", file, line,
        message: `cites ruling '${id}', which the owner has superseded — cite the ruling that replaced it`,
      });
    }
  }
  return findings;
}

export function lintGuidelinesFile(file: string, text: string, ctx: LintContext): LintResult {
  const { known } = ctx;
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

  findings.push(...supersededCitations(file, text, ctx.supersededIds));

  findings.sort((a, b) => a.line - b.line || a.code.localeCompare(b.code));
  return { findings, termSpansUnchecked };
}
