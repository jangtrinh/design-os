/**
 * adherence-rules.ts — one loader for the project's structural adherence rules.
 *
 * Spec 025 designed `design/rules/_adherence.rules.json`; nothing in `src/` implemented it. This module
 * is the minimal first piece: parse + validate the two rule files, and evaluate the
 * `token-ban` kind. `AdherenceRule` is a discriminated union on `kind` (types, the named error and
 * per-rule validation live in adherence-rules-validate.ts) so further kinds (`composition-contract`,
 * `slot-budget`) are added as a union member plus one validator entry. `prop-allowlist`,
 * `enum-allowlist` and `import-path` stay in spec 025's scope; a file naming them fails with
 * ADHERENCE_UNKNOWN_KIND rather than being silently ignored.
 *
 * Two files, same schema, never merged:
 *   _adherence.rules.json     binding  — promoted by the owner; the only list a gate may enforce
 *   _adherence.proposed.json  proposed — mined by the harvester; evidence, not law
 * Every loaded rule records its origin and file, so a caller cannot confuse the two.
 *
 * File shape: `{ "rules": [ { id, kind, severity, message, source, ...kind fields } ] }`, optionally
 * behind a UTF-8 byte order mark.
 *   - `source` (required) names the evidence/record a rule derives from (spec 025 UC-03).
 *   - `token-ban` adds `tokens`: non-empty list of distinct literal substrings. Matching is
 *     case-insensitive (CSS keywords and font names are), one finding per occurrence. Optional
 *     `excludeElements` (tag names, e.g. `["code", "pre"]`): an occurrence inside one of those
 *     elements is not a finding; it is reported as an exclusion with its line, so a ban that skips
 *     `<code>` still shows what it skipped.
 *
 * Errors reuse DSError (`code` + `message`) and add where-it-broke fields; every message names the
 * file, rule position and field, so the repair is "edit that field", not "search the file".
 * A missing file is not an error: it is an empty list plus a `skipped` record, so a gate can print
 * "0 rules loaded, file absent" for a project that has not promoted anything.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DSError } from "./design-system.js";
import {
  AdherenceRuleError,
  isObj,
  parseRule,
  type AdherenceRule,
  type AdherenceSeverity,
  type TokenBanRule,
  type RuleOrigin,
} from "./adherence-rules-validate.js";

export { AdherenceRuleError };
export type { AdherenceRule, AdherenceRuleKind, AdherenceSeverity, RuleOrigin, TokenBanRule } from "./adherence-rules-validate.js";

export interface LoadedRule {
  rule: AdherenceRule;
  origin: RuleOrigin;
  /** The file the rule was read from, as passed to the parser. */
  file: string;
  /** Position in that file's `rules` array. */
  index: number;
}
export interface AdherenceLoadResult {
  binding: LoadedRule[];
  proposed: LoadedRule[];
  skipped: { file: string; reason: "missing" }[];
}

/** Pure: validate one rules file's text. `file` is only used for provenance and messages. */
export function parseAdherenceRules(text: string, file: string, origin: RuleOrigin): LoadedRule[] {
  let doc: unknown;
  // Strip a BOM the way reuse-plan-parse.ts does: an invisible character must not read as "bad JSON".
  try { doc = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch (e) {
    throw new AdherenceRuleError("ADHERENCE_BAD_JSON", `${file} is not valid JSON (${(e as Error).message}). Fix the syntax and re-run.`, file);
  }
  if (!isObj(doc) || !Array.isArray(doc["rules"])) {
    throw new AdherenceRuleError("ADHERENCE_BAD_FIELD", `${file}: field 'rules' must be an array at the top level ({ "rules": [...] }).`, file, undefined, "rules");
  }
  const seen = new Map<string, number>();
  return doc["rules"].map((raw: unknown, index: number) => {
    const rule = parseRule(raw, { file, index });
    const first = seen.get(rule.id);
    if (first !== undefined) {
      throw new AdherenceRuleError(
        "ADHERENCE_DUPLICATE_ID",
        `${file}: rule id '${rule.id}' is used by rule #${first} and rule #${index}; ids attribute findings, so rename one.`,
        file, index, "id",
      );
    }
    seen.set(rule.id, index);
    return { rule, origin, file, index };
  });
}

const RULE_FILES = [["binding", "_adherence.rules.json"], ["proposed", "_adherence.proposed.json"]] as const;

/** Thin fs reader over `<designDir>/rules/`. Missing file = skipped; any other read failure throws. */
export function loadAdherenceRules(designDir: string): AdherenceLoadResult {
  const result: AdherenceLoadResult = { binding: [], proposed: [], skipped: [] };
  for (const [origin, name] of RULE_FILES) {
    const file = join(designDir, "rules", name);
    let text: string;
    try { text = readFileSync(file, "utf8"); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") { result.skipped.push({ file, reason: "missing" }); continue; }
      throw new DSError("READ_ERROR", `cannot read ${file}: ${(e as Error).message}`);
    }
    result[origin].push(...parseAdherenceRules(text, file, origin));
  }
  return result;
}

export interface TokenBanFinding {
  ruleId: string;
  token: string;
  /** 1-based line of the occurrence. */
  line: number;
  severity: AdherenceSeverity;
  message: string;
}
/** An occurrence a rule's `excludeElements` kept out of the findings. */
export interface TokenBanExclusion {
  ruleId: string;
  token: string;
  line: number;
  /** The excluding element's tag name, lower-cased. */
  element: string;
}

/**
 * Spans `[start, end)` of every `<tag ...>...</tag>` for one tag name, open tag included. Same-name
 * nesting is balanced; an element that never closes yields no span (a missed close must make the
 * ban stricter, never looser). The tag name must be followed by whitespace, `/` or `>`, so `<codex>`
 * is not a `<code>`.
 */
function elementSpans(text: string, tag: string): [number, number][] {
  const spans: [number, number][] = [];
  const tagRe = new RegExp(`<(/?)${tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=[\\s/>])[^>]*>`, "gi");
  const open: number[] = [];
  for (const m of text.matchAll(tagRe)) {
    const at = m.index ?? 0;
    if (m[1] === "/") {
      const start = open.pop();
      if (start !== undefined) spans.push([start, at + m[0].length]);
    } else if (!m[0].endsWith("/>")) {
      open.push(at);
    }
  }
  return spans;
}

/**
 * Lower-case without changing the string's length: a character whose lower-case form is longer
 * (`İ` becomes `i̇`, two UTF-16 units) is kept as it is, so an offset found in the folded text is the
 * same offset in the original and the element spans line up with it.
 */
function fold(s: string): string {
  let out = "";
  for (const ch of s) {
    const lower = ch.toLowerCase();
    out += lower.length === ch.length ? lower : ch;
  }
  return out;
}

/**
 * One finding per occurrence of a banned token, ordered by line, then rule order, then token order.
 * Literal, case-insensitive substring scan over raw text; occurrences of one token do not overlap
 * (`aa` in `aaa` is one hit). Tokens of one rule that contain each other (`ui-monospace`, `monospace`)
 * are counted separately. A rule with `excludeElements` moves occurrences inside those elements from
 * `findings` to `excluded`; a rule without it sees the whole text.
 */
export function evaluateTokenBansDetailed(
  rules: readonly TokenBanRule[],
  text: string,
): { findings: TokenBanFinding[]; excluded: TokenBanExclusion[] } {
  const findings: TokenBanFinding[] = [];
  const excluded: TokenBanExclusion[] = [];
  const spansByTag = new Map<string, [number, number][]>();
  const spansFor = (tag: string): [number, number][] => {
    const key = tag.toLowerCase();
    let spans = spansByTag.get(key);
    if (spans === undefined) { spans = elementSpans(text, key); spansByTag.set(key, spans); }
    return spans;
  };
  let lineStart = 0;
  text.split("\n").forEach((raw, i) => {
    const haystack = fold(raw);
    for (const rule of rules) {
      for (const token of rule.tokens) {
        const needle = fold(token);
        for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + needle.length)) {
          const abs = lineStart + at;
          const element = (rule.excludeElements ?? []).find((tag) => spansFor(tag).some(([s, e]) => s <= abs && abs < e));
          if (element !== undefined) excluded.push({ ruleId: rule.id, token, line: i + 1, element: element.toLowerCase() });
          else findings.push({ ruleId: rule.id, token, line: i + 1, severity: rule.severity, message: rule.message });
        }
      }
    }
    lineStart += raw.length + 1;
  });
  return { findings, excluded };
}

/** The findings of {@link evaluateTokenBansDetailed}, for callers that do not report exclusions. */
export function evaluateTokenBans(rules: readonly TokenBanRule[], text: string): TokenBanFinding[] {
  return evaluateTokenBansDetailed(rules, text).findings;
}
