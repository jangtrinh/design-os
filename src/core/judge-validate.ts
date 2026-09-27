/**
 * Validation for the System One shadow judge: a judgment record and the persona-families table.
 * Both are checked against their bundled schemas first; the rules a schema cannot express
 * (pick is one of the candidates, nearest family resolves, no unreliable attribute leaks in)
 * are checked here so one finding list covers everything.
 */
import judgmentSchema from "../../schemas/judgment.schema.json" with { type: "json" };
import familiesSchema from "../../schemas/persona-families.schema.json" with { type: "json" };
import { validateAgainstSchema } from "./json-schema-subset.js";

export interface JudgeFinding {
  field: string;
  message: string;
}

export const DECISION_POINTS = ["art-direction", "persona-family", "layout-archetype", "copy-language"] as const;
export type DecisionPoint = (typeof DECISION_POINTS)[number];

export interface EvidenceRef { type: "persona-dossier" | "pattern-card" | "ruling"; ref: string }
export interface HumanDecision { decision: "accepted" | "changed-to" | "rejected"; changedTo?: string; ts: string }
export interface Judgment {
  kind: "judgment";
  version: 1;
  id: string;
  ts: string;
  mode: "shadow";
  decisionPoint: DecisionPoint;
  candidates: string[];
  pick: { candidate: string; evidenceRefs: EvidenceRef[] };
  kernelConstraints: string[];
  human?: HumanDecision;
}

export interface PersonaFamily {
  slug: string;
  platform: "web" | "ios";
  nearest: string;
  attributes: { attribute: string }[];
  mobbinUrls: string[];
}
export interface PersonaFamilies {
  unreliableAttributes: { attribute: string; agreement: number }[];
  families: PersonaFamily[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

export function validateJudgment(doc: unknown): JudgeFinding[] {
  if (!isRecord(doc)) return [{ field: "(root)", message: "judgment must be a JSON object" }];
  const findings = validateAgainstSchema(doc, judgmentSchema);
  if (findings.length > 0) return findings;
  const j = doc as unknown as Judgment;
  const out: JudgeFinding[] = [];
  if (new Set(j.candidates).size !== j.candidates.length) out.push({ field: "candidates", message: "must not repeat a candidate" });
  if (!j.candidates.includes(j.pick.candidate)) out.push({ field: "pick.candidate", message: "must be one of candidates" });
  if (j.human !== undefined) {
    if (j.human.decision !== "changed-to" && j.human.changedTo !== undefined) {
      out.push({ field: "human.changedTo", message: "is only allowed when decision is 'changed-to'" });
    }
    if (j.human.changedTo === j.pick.candidate) out.push({ field: "human.changedTo", message: "must differ from the shadow pick (that is 'accepted')" });
  }
  return out;
}

export function validateFamilies(doc: unknown): JudgeFinding[] {
  if (!isRecord(doc)) return [{ field: "(root)", message: "families file must be a JSON object" }];
  const findings = validateAgainstSchema(doc, familiesSchema);
  if (findings.length > 0) return findings;
  const { families, unreliableAttributes } = doc as unknown as PersonaFamilies;
  const out: JudgeFinding[] = [];
  const slugs = new Map(families.map((f) => [f.slug, f]));
  if (slugs.size !== families.length) out.push({ field: "families", message: "slugs must be unique" });
  const unreliable = new Set(unreliableAttributes.map((a) => a.attribute));
  for (const a of unreliableAttributes) {
    if (a.agreement >= 0.6) out.push({ field: `unreliableAttributes.${a.attribute}`, message: "agreement is >= 60%, so the attribute is reliable; remove it from this list" });
  }
  families.forEach((f, i) => {
    const at = `families[${i}]`;
    if (!f.slug.startsWith(`${f.platform}-`)) out.push({ field: `${at}.slug`, message: `must start with '${f.platform}-'` });
    const near = slugs.get(f.nearest);
    if (near === undefined) out.push({ field: `${at}.nearest`, message: `'${f.nearest}' is not a family in this file` });
    else if (f.nearest === f.slug) out.push({ field: `${at}.nearest`, message: "must be a different family" });
    else if (near.platform !== f.platform) out.push({ field: `${at}.nearest`, message: "must be a family on the same platform" });
    for (const a of f.attributes) {
      if (unreliable.has(a.attribute)) out.push({ field: `${at}.attributes`, message: `'${a.attribute}' is listed as unreliable and must not appear in a family` });
    }
    if (new Set(f.mobbinUrls).size !== f.mobbinUrls.length) out.push({ field: `${at}.mobbinUrls`, message: "must not repeat a URL" });
  });
  return out;
}
