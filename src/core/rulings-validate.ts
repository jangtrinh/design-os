/**
 * Structural validation for a rulings file, mirroring schemas/rulings.schema.json.
 * Hand-rolled (no ajv — the kernel takes no new dependency); a test pins the field
 * lists below to the schema file so the two cannot drift apart.
 */

export interface RulingsFinding {
  checkId: string;
  severity: "error" | "warning";
  message: string;
  /** Ruling id the finding is about, when it has one. */
  id?: string;
}

export const REQUIRED_FIELDS = ["id", "category", "text", "scope", "source", "since", "verified_by"] as const;
export const OPTIONAL_FIELDS = [
  "status", "verified_at", "approved_by", "principle", "supersedes", "superseded_by", "conflicts_with", "detail", "tag",
] as const;
export const STATUS_VALUES = ["active", "superseded", "retired"] as const;
export const APPROVER_ROLES = ["PM", "design-lead", "BA", "owner", "source"] as const;
export const SCOPE_KEYS = ["apps", "features", "screens"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isNonEmptyString);

export function validateRulingsFile(doc: unknown): RulingsFinding[] {
  const out: RulingsFinding[] = [];
  const bad = (checkId: string, message: string, id?: string): void => {
    out.push(id === undefined ? { checkId, severity: "error", message } : { checkId, severity: "error", message, id });
  };
  if (!isRecord(doc)) { bad("schema-shape", "rulings file must be a JSON object"); return out; }
  if (doc["schema"] !== "rulings/1") bad("schema-shape", `'schema' must be "rulings/1", got ${JSON.stringify(doc["schema"])}`);
  if (doc["at"] !== undefined && typeof doc["at"] !== "number") bad("schema-shape", "'at' must be a number (epoch ms)");
  const rulings = doc["rulings"];
  if (!Array.isArray(rulings)) { bad("schema-shape", "'rulings' must be an array"); return out; }
  rulings.forEach((r, i) => validateRuling(r, i, bad));
  return out;
}

type Bad = (checkId: string, message: string, id?: string) => void;

function validateRuling(r: unknown, index: number, bad: Bad): void {
  if (!isRecord(r)) { bad("schema-ruling", `rulings[${index}] must be an object`); return; }
  const id = isNonEmptyString(r["id"]) ? r["id"] : undefined;
  const at = id ?? `rulings[${index}]`;
  const field = (name: string, message: string): void => bad("schema-field", `${at}: '${name}' ${message}`, id);
  for (const name of REQUIRED_FIELDS) if (r[name] === undefined) field(name, "is required");
  for (const name of ["id", "category", "text", "verified_by"] as const) {
    if (r[name] !== undefined && !isNonEmptyString(r[name])) field(name, "must be a non-empty string");
  }
  if (r["since"] !== undefined && !(typeof r["since"] === "string" && DATE_RE.test(r["since"]))) field("since", "must be a YYYY-MM-DD date");
  if (r["verified_at"] !== undefined && !(typeof r["verified_at"] === "string" && DATE_RE.test(r["verified_at"]))) field("verified_at", "must be a YYYY-MM-DD date");
  if (r["source"] !== undefined && !(isStringArray(r["source"]) && r["source"].length > 0)) field("source", "must be a non-empty array of non-empty strings");
  if (r["scope"] !== undefined) validateScope(r["scope"], field);
  if (r["status"] !== undefined && !(STATUS_VALUES as readonly unknown[]).includes(r["status"])) field("status", `must be one of ${STATUS_VALUES.join("|")}`);
  for (const name of ["principle", "supersedes", "conflicts_with"] as const) {
    if (r[name] !== undefined && !isStringArray(r[name])) field(name, "must be an array of non-empty strings");
  }
  if (r["superseded_by"] !== undefined && !isNonEmptyString(r["superseded_by"])) field("superseded_by", "must be a non-empty string");
  if (r["approved_by"] !== undefined) validateApprovals(r["approved_by"], field);
}

function validateScope(scope: unknown, field: (n: string, m: string) => void): void {
  if (scope === "global") return;
  if (!isRecord(scope)) { field("scope", 'must be "global" or an object of apps/features/screens arrays'); return; }
  for (const key of SCOPE_KEYS) {
    if (scope[key] !== undefined && !isStringArray(scope[key])) field(`scope.${key}`, "must be an array of non-empty strings");
  }
}

function validateApprovals(value: unknown, field: (n: string, m: string) => void): void {
  if (!Array.isArray(value)) { field("approved_by", "must be an array"); return; }
  value.forEach((a, i) => {
    if (!isRecord(a)) { field(`approved_by[${i}]`, "must be an object"); return; }
    if (!(APPROVER_ROLES as readonly unknown[]).includes(a["role"])) field(`approved_by[${i}].role`, `must be one of ${APPROVER_ROLES.join("|")}`);
    if (!isNonEmptyString(a["person"])) field(`approved_by[${i}].person`, "must be a non-empty string");
    if (!(typeof a["at"] === "string" && DATE_RE.test(a["at"]))) field(`approved_by[${i}].at`, "must be a YYYY-MM-DD date");
  });
}
