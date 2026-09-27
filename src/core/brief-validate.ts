/**
 * Structural validation for a design brief: the whole document is checked against
 * schemas/design-brief.schema.json (bundled at build time), so every nested
 * `additionalProperties:false`, `required` and enum is enforced from one source.
 * The lists below are kept for the route rules; a test pins them to the schema.
 */
import schema from "../../schemas/design-brief.schema.json" with { type: "json" };
import { validateAgainstSchema } from "./json-schema-subset.js";

export interface BriefFinding {
  checkId: "schema-shape" | "schema-field";
  severity: "error";
  message: string;
  /** Path of the offending value, e.g. `screens[0].states`. */
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

export function validateBrief(doc: unknown): BriefFinding[] {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    return [{ checkId: "schema-shape", severity: "error", message: "brief must be a JSON object", field: "(root)" }];
  }
  return validateAgainstSchema(doc, schema).map((f) => ({ checkId: "schema-field" as const, severity: "error" as const, message: f.message, field: f.field }));
}
