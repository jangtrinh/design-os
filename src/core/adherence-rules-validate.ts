/**
 * adherence-rules-validate.ts — rule types, the named error, and per-rule validation for
 * adherence-rules.ts (read that header for the file shape and the error codes).
 *
 * Adding a rule kind = one union member below + one `VALIDATORS` entry. `VALIDATORS` is a mapped type
 * over the union, so a kind without a validator does not compile.
 *
 * Strictness, each from a failure mode rather than taste:
 *   - `source` is required (spec 025 UC-03: a rule with no traceable source is a build failure).
 *   - Unknown rule-level keys are rejected, so a typo like `sorce` cannot silently drop provenance.
 *   - Inherited property names (`toString`, `__proto__`) are not rule kinds (`Object.hasOwn`).
 */
import { DSError } from "./design-system.js";

export type AdherenceSeverity = "error" | "warning";
export type RuleOrigin = "binding" | "proposed";

interface RuleBase {
  id: string;
  severity: AdherenceSeverity;
  message: string;
  /** The evidence or record the rule derives from; required, preserved, not interpreted. */
  source: string;
}
export interface TokenBanRule extends RuleBase {
  kind: "token-ban";
  tokens: string[];
  /**
   * Tag names (`["code", "pre"]`): an occurrence inside one of these elements, opening tag included,
   * is not a finding. It is counted and located as an exclusion, never dropped silently.
   */
  excludeElements?: string[];
}
/** Widen here (and in VALIDATORS) when a new kind lands. */
export type AdherenceRule = TokenBanRule;
export type AdherenceRuleKind = AdherenceRule["kind"];

export class AdherenceRuleError extends DSError {
  constructor(
    code: "ADHERENCE_BAD_JSON" | "ADHERENCE_BAD_FIELD" | "ADHERENCE_UNKNOWN_KIND" | "ADHERENCE_DUPLICATE_ID",
    message: string,
    readonly file: string,
    readonly ruleIndex?: number,
    readonly field?: string,
  ) {
    super(code, message);
    this.name = "AdherenceRuleError";
  }
}

type Obj = Record<string, unknown>;
export interface RuleCtx { file: string; index: number; id?: string }

export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const where = (c: RuleCtx): string => `rule #${c.index}${c.id !== undefined ? ` (id '${c.id}')` : ""} in ${c.file}`;

function badField(c: RuleCtx, field: string, problem: string): never {
  throw new AdherenceRuleError(
    "ADHERENCE_BAD_FIELD",
    `${where(c)}: field '${field}' ${problem}. Fix '${field}' in that file and re-run.`,
    c.file, c.index, field,
  );
}
function requireString(o: Obj, field: string, c: RuleCtx): string {
  const v = o[field];
  if (typeof v !== "string" || v.trim() === "") return badField(c, field, "must be a non-empty string");
  return v;
}

/** `excludeElements`: absent, or an array of distinct (case-insensitive) HTML tag names. */
function parseExcludeElements(v: unknown, c: RuleCtx): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return badField(c, "excludeElements", "must be an array of tag names such as [\"code\", \"pre\"]");
  const seen = new Map<string, number>();
  v.forEach((t, i) => {
    const field = `excludeElements[${i}]`;
    if (typeof t !== "string" || !/^[A-Za-z][A-Za-z0-9-]*$/.test(t)) badField(c, field, "must be a tag name (letters, digits and hyphens, e.g. \"code\")");
    const key = (t as string).toLowerCase(); // tag names are case-insensitive in HTML
    const first = seen.get(key);
    if (first !== undefined) badField(c, field, `repeats excludeElements[${first}] (tag names are case-insensitive)`);
    seen.set(key, i);
  });
  return v as string[];
}

const COMMON_KEYS = ["id", "kind", "severity", "message", "source"];

interface Validator<R extends AdherenceRule> {
  /** Rule-level keys this kind adds to COMMON_KEYS. */
  keys: readonly string[];
  validate: (o: Obj, base: Pick<R, "id" | "severity" | "message" | "source">, c: RuleCtx) => R;
}
const VALIDATORS: { [K in AdherenceRuleKind]: Validator<Extract<AdherenceRule, { kind: K }>> } = {
  "token-ban": {
    keys: ["tokens", "excludeElements"],
    validate: (o, base, c) => {
      const tokens = o["tokens"];
      if (!Array.isArray(tokens) || tokens.length === 0) return badField(c, "tokens", "must be a non-empty array of strings");
      const seen = new Map<string, number>();
      tokens.forEach((t, i) => {
        const field = `tokens[${i}]`;
        if (typeof t !== "string" || t.trim() === "") badField(c, field, "must be a non-blank string");
        if (/[\r\n]/.test(t as string)) badField(c, field, "must not contain a line break (matching is per line, it could never match)");
        const key = (t as string).toLowerCase(); // matching is case-insensitive, so case variants would double-count
        const first = seen.get(key);
        if (first !== undefined) badField(c, field, `repeats tokens[${first}] (matching is case-insensitive)`);
        seen.set(key, i);
      });
      const excludeElements = parseExcludeElements(o["excludeElements"], c);
      return { ...base, kind: "token-ban", tokens: tokens as string[], ...(excludeElements !== undefined && { excludeElements }) };
    },
  },
};

/** Validate one entry of a file's `rules` array. */
export function parseRule(raw: unknown, c: RuleCtx): AdherenceRule {
  if (!isObj(raw)) return badField(c, "(rule)", "must be an object");
  if (typeof raw["id"] === "string") c.id = raw["id"];
  const kind = raw["kind"];
  if (typeof kind !== "string") return badField(c, "kind", "must be a string");
  if (!Object.hasOwn(VALIDATORS, kind)) {
    throw new AdherenceRuleError(
      "ADHERENCE_UNKNOWN_KIND",
      `${where(c)}: unknown kind '${kind}'. Supported kinds: ${Object.keys(VALIDATORS).join(", ")}. Remove the rule or change its kind.`,
      c.file, c.index, "kind",
    );
  }
  const validator = VALIDATORS[kind as AdherenceRuleKind];
  const allowed = [...COMMON_KEYS, ...validator.keys];
  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) badField(c, key, `is not a field of a '${kind}' rule (allowed: ${allowed.join(", ")})`);
  }
  const id = requireString(raw, "id", c);
  const severity = raw["severity"];
  if (severity !== "error" && severity !== "warning") return badField(c, "severity", "must be 'error' or 'warning'");
  const base = { id, severity: severity as AdherenceSeverity, message: requireString(raw, "message", c), source: requireString(raw, "source", c) };
  return validator.validate(raw, base, c);
}
