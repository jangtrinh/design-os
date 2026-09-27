/**
 * Structural validation for a design brief, mirroring schemas/design-brief.schema.json.
 * Hand-rolled (no ajv — the kernel takes no new dependency); a test pins the lists
 * below to the schema file so the two cannot drift apart. Fs-free and pure.
 */
import { APPROVER_ROLES } from "./rulings-validate.js";

export interface BriefFinding {
  checkId: "schema-shape" | "schema-field";
  severity: "error";
  message: string;
  /** Top-level brief field the finding is about. */
  field: string;
}

export const BRIEF_REQUIRED = [
  "kind", "version", "rawRequest", "surface", "audience", "context", "primaryOutcome", "primaryAction",
  "requiredContent", "constraints", "prohibitedClaims", "criteria", "assumptions",
] as const;
export const BRIEF_OPTIONAL = ["activationRef", "screens", "roles", "status", "copyLanguage", "requestedBy", "approvedBy"] as const;
/** 'marketing-landing' is the legacy value of 'landing'. */
export const BRIEF_SURFACES = ["marketing-landing", "landing", "web-app", "dashboard", "mobile-app", "email", "document"] as const;
export const SCREEN_STATES = ["empty", "loading", "error", "partial", "full", "permission-denied"] as const;
export const COPY_LANGUAGES = ["en", "vi", "mixed"] as const;
export const ASSUMPTION_LABELS = ["observed", "synthetic", "assumed"] as const;
export const ASSUMPTION_PROVENANCE = ["provided", "project-evidence", "inferred", "unknown"] as const;
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isTextList = (v: unknown): boolean => Array.isArray(v) && v.every(isText);
const oneOf = (list: readonly unknown[], v: unknown): boolean => list.includes(v);

type Bad = (field: string, message: string) => void;

export function validateBrief(doc: unknown): BriefFinding[] {
  const out: BriefFinding[] = [];
  const bad: Bad = (field, message) => out.push({ checkId: "schema-field", severity: "error", message, field });
  if (!isRecord(doc)) {
    return [{ checkId: "schema-shape", severity: "error", message: "brief must be a JSON object", field: "(root)" }];
  }
  for (const name of BRIEF_REQUIRED) if (doc[name] === undefined) bad(name, "is required");
  const known = new Set<string>([...BRIEF_REQUIRED, ...BRIEF_OPTIONAL]);
  for (const name of Object.keys(doc)) if (!known.has(name)) bad(name, "is not a known brief field");
  if (doc["kind"] !== undefined && doc["kind"] !== "design-brief") bad("kind", 'must be "design-brief"');
  if (doc["version"] !== undefined && doc["version"] !== 1 && doc["version"] !== 2) bad("version", "must be 1 or 2");
  if (doc["version"] === 2 && doc["activationRef"] === undefined) bad("activationRef", "is required when version is 2");
  for (const name of ["rawRequest", "activationRef", "audience", "context", "primaryOutcome", "primaryAction", "requestedBy"] as const) {
    if (doc[name] !== undefined && !isText(doc[name])) bad(name, "must be a non-empty string");
  }
  if (doc["surface"] !== undefined && !oneOf(BRIEF_SURFACES, doc["surface"])) bad("surface", `must be one of ${BRIEF_SURFACES.join("|")}`);
  if (doc["requiredContent"] !== undefined && !(isTextList(doc["requiredContent"]) && (doc["requiredContent"] as unknown[]).length > 0)) {
    bad("requiredContent", "must be a non-empty array of non-empty strings");
  }
  for (const name of ["constraints", "prohibitedClaims"] as const) {
    if (doc[name] !== undefined && !isTextList(doc[name])) bad(name, "must be an array of non-empty strings");
  }
  if (doc["copyLanguage"] !== undefined && !oneOf(COPY_LANGUAGES, doc["copyLanguage"])) bad("copyLanguage", `must be one of ${COPY_LANGUAGES.join("|")}`);
  if (doc["criteria"] !== undefined) validateCriteria(doc["criteria"], bad);
  if (doc["assumptions"] !== undefined) validateAssumptions(doc["assumptions"], bad);
  if (doc["screens"] !== undefined) validateScreens(doc["screens"], bad);
  if (doc["roles"] !== undefined) validateRoles(doc["roles"], bad);
  if (doc["status"] !== undefined) validateStatus(doc["status"], bad);
  if (doc["approvedBy"] !== undefined) validateApprovedBy(doc["approvedBy"], bad);
  return out;
}

function eachItem(field: string, value: unknown, bad: Bad, check: (item: Record<string, unknown>, at: string) => void): void {
  if (!Array.isArray(value)) { bad(field, "must be an array"); return; }
  value.forEach((item, i) => {
    if (!isRecord(item)) { bad(`${field}[${i}]`, "must be an object"); return; }
    check(item, `${field}[${i}]`);
  });
}

function need(item: Record<string, unknown>, at: string, names: readonly string[], bad: Bad): void {
  for (const n of names) if (!isText(item[n])) bad(`${at}.${n}`, "must be a non-empty string");
}

function validateCriteria(value: unknown, bad: Bad): void {
  eachItem("criteria", value, bad, (c, at) => {
    need(c, at, ["id", "text"], bad);
    if (!oneOf(["must", "should"], c["priority"])) bad(`${at}.priority`, "must be must|should");
  });
  if (Array.isArray(value) && value.length === 0) bad("criteria", "must be non-empty");
}

function validateAssumptions(value: unknown, bad: Bad): void {
  eachItem("assumptions", value, bad, (a, at) => {
    need(a, at, ["facet", "value"], bad);
    if (!oneOf(ASSUMPTION_PROVENANCE, a["provenance"])) bad(`${at}.provenance`, `must be one of ${ASSUMPTION_PROVENANCE.join("|")}`);
    if (!oneOf(CONFIDENCE_LEVELS, a["confidence"])) bad(`${at}.confidence`, `must be one of ${CONFIDENCE_LEVELS.join("|")}`);
    if (a["label"] !== undefined && !oneOf(ASSUMPTION_LABELS, a["label"])) bad(`${at}.label`, `must be one of ${ASSUMPTION_LABELS.join("|")}`);
  });
}

function validateScreens(value: unknown, bad: Bad): void {
  eachItem("screens", value, bad, (s, at) => {
    need(s, at, ["id", "name"], bad);
    if (s["purpose"] !== undefined && !isText(s["purpose"])) bad(`${at}.purpose`, "must be a non-empty string");
    if (!Array.isArray(s["states"]) || !s["states"].every((x) => oneOf(SCREEN_STATES, x))) {
      bad(`${at}.states`, `must be an array of ${SCREEN_STATES.join("|")}`);
    }
  });
}

function validateRoles(value: unknown, bad: Bad): void {
  eachItem("roles", value, bad, (r, at) => need(r, at, ["name", "scope"], bad));
}

function validateStatus(value: unknown, bad: Bad): void {
  if (!isRecord(value)) { bad("status", "must be an object"); return; }
  if (!(isTextList(value["states"]) && (value["states"] as unknown[]).length > 0)) bad("status.states", "must be a non-empty array of non-empty strings");
  if (value["transitions"] !== undefined) eachItem("status.transitions", value["transitions"], bad, (t, at) => need(t, at, ["from", "to"], bad));
}

function validateApprovedBy(value: unknown, bad: Bad): void {
  eachItem("approvedBy", value, bad, (a, at) => {
    if (!oneOf(APPROVER_ROLES, a["role"])) bad(`${at}.role`, `must be one of ${APPROVER_ROLES.join("|")}`);
    need(a, at, ["person"], bad);
    if (!(typeof a["at"] === "string" && DATE_RE.test(a["at"]))) bad(`${at}.at`, "must be a YYYY-MM-DD date");
  });
}
