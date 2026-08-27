import { expectedCapabilityPilotReceipt, parseCapabilityPilotReceiptPin } from "./capability-pilot-receipt.js";

export type CapabilityAvailability = "available" | "unavailable";
export type CapabilityAssurance = "qualified" | "provisional" | "unassessed";

export interface CapabilityProfile {
  id: string;
  availability: CapabilityAvailability;
  assurance: CapabilityAssurance;
  acceptedInputKinds: string[];
  workflow: string | null;
  artifact: string;
  requiredKnowledge?: string[];
  machineWitnesses?: string[];
  renderedWitnesses?: string[];
  manualWitnesses?: string[];
  assuranceEvidence?: string;
  refusalCode?: string;
  action?: string;
  advisoryKnowledge?: string[];
  qualificationRequirements?: string[];
}

export interface CapabilityCatalog { version: 1 | 2; profiles: CapabilityProfile[] }
export type CatalogParseResult =
  | { ok: true; catalog: CapabilityCatalog }
  | { ok: false; message: string };

const objectValue = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const stringList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.length > 0 && value.every(nonEmpty) ? value as string[] : null;
const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));
const optionalListKeys = ["requiredKnowledge", "machineWitnesses", "renderedWitnesses", "manualWitnesses", "advisoryKnowledge", "qualificationRequirements"] as const;
const v1Keys = ["id", "status", "acceptedInputKinds", "workflow", "artifact", ...optionalListKeys, "qualificationEvidence", "refusalCode", "action"] as const;
const v2Keys = ["id", "availability", "assurance", "acceptedInputKinds", "workflow", "artifact", ...optionalListKeys, "assuranceEvidence", "refusalCode", "action"] as const;

export function parseCapabilityCatalog(raw: string): CatalogParseResult {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return bad("capability catalog is not valid JSON"); }
  if (!objectValue(value) || !hasOnlyKeys(value, ["version", "profiles"]) || !Array.isArray(value["profiles"]) || value["profiles"].length === 0) {
    return bad("capability catalog requires version and profiles[]");
  }
  if (value["version"] === 1) return parseV1(value["profiles"]);
  if (value["version"] === 2) return parseV2(value["profiles"]);
  return bad("capability catalog version must be 1 or 2");
}

function parseV1(items: unknown[]): CatalogParseResult {
  const profiles: CapabilityProfile[] = [];
  for (const item of items) {
    if (!objectValue(item) || !hasOnlyKeys(item, v1Keys) || !commonFields(item)) return bad("every v1 capability profile needs id, status, acceptedInputKinds, workflow and artifact");
    if (invalidLists(item)) return bad(`capability profile '${item["id"]}' contains an invalid string list`);
    const status = item["status"];
    if (status !== "qualified" && status !== "unqualified") return bad(`capability profile '${item["id"]}' has an invalid status`);
    const profile = profileFrom(item, status === "qualified" ? "available" : "unavailable", status === "qualified" ? "qualified" : "unassessed", item["qualificationEvidence"]);
    const issue = status === "qualified" ? availableIssue(profile) : unavailableIssue(profile);
    if (issue !== null) return bad(`v1 capability '${profile.id}' ${issue}`);
    profiles.push(profile);
  }
  return { ok: true, catalog: { version: 1, profiles } };
}

function parseV2(items: unknown[]): CatalogParseResult {
  const profiles: CapabilityProfile[] = [];
  for (const item of items) {
    if (!objectValue(item) || !hasOnlyKeys(item, v2Keys) || !commonFields(item) ||
        (item["availability"] !== "available" && item["availability"] !== "unavailable") ||
        !["qualified", "provisional", "unassessed"].includes(String(item["assurance"]))) {
      return bad("every v2 capability profile needs id, availability, assurance, acceptedInputKinds, workflow and artifact");
    }
    if (invalidLists(item)) return bad(`capability profile '${item["id"]}' contains an invalid string list`);
    const profile = profileFrom(item, item["availability"] as CapabilityAvailability, item["assurance"] as CapabilityAssurance, item["assuranceEvidence"]);
    const issue = profile.availability === "available" ? availableIssue(profile) : unavailableIssue(profile);
    if (issue !== null) return bad(`v2 capability '${profile.id}' ${issue}`);
    profiles.push(profile);
  }
  return { ok: true, catalog: { version: 2, profiles } };
}

function commonFields(item: Record<string, unknown>): boolean {
  return nonEmpty(item["id"]) && stringList(item["acceptedInputKinds"]) !== null && nonEmpty(item["artifact"]) &&
    (item["workflow"] === null || nonEmpty(item["workflow"]));
}

function invalidLists(item: Record<string, unknown>): boolean {
  return optionalListKeys.some((key) => item[key] !== undefined && stringList(item[key]) === null);
}

function profileFrom(
  item: Record<string, unknown>, availability: CapabilityAvailability, assurance: CapabilityAssurance, assuranceEvidence: unknown,
): CapabilityProfile {
  return {
    id: String(item["id"]), availability, assurance, acceptedInputKinds: stringList(item["acceptedInputKinds"]) ?? [],
    workflow: item["workflow"] === null ? null : String(item["workflow"]), artifact: String(item["artifact"]),
    requiredKnowledge: list(item, "requiredKnowledge"), machineWitnesses: list(item, "machineWitnesses"),
    renderedWitnesses: list(item, "renderedWitnesses"), manualWitnesses: list(item, "manualWitnesses"),
    assuranceEvidence: typeof assuranceEvidence === "string" ? assuranceEvidence : undefined,
    refusalCode: typeof item["refusalCode"] === "string" ? item["refusalCode"] : undefined,
    action: typeof item["action"] === "string" ? item["action"] : undefined,
    advisoryKnowledge: list(item, "advisoryKnowledge"), qualificationRequirements: list(item, "qualificationRequirements"),
  };
}

function list(item: Record<string, unknown>, key: typeof optionalListKeys[number]): string[] | undefined {
  return item[key] === undefined ? undefined : stringList(item[key]) ?? undefined;
}

function availableIssue(profile: CapabilityProfile): string | null {
  if (profile.assurance === "unassessed" || profile.workflow === null || !hasAvailableEvidence(profile)) return "is incomplete";
  if (profile.assurance === "provisional" && !validPilotEvidence(profile)) return "needs a registered provisional assurance receipt";
  return null;
}

function unavailableIssue(profile: CapabilityProfile): string | null {
  if (profile.assurance !== "unassessed" || profile.workflow !== null || profile.refusalCode !== "CAPABILITY_UNQUALIFIED" || !nonEmpty(profile.action) ||
      profile.qualificationRequirements === undefined || !validPilotEvidence(profile)) return "is incomplete";
  return null;
}

function hasAvailableEvidence(profile: CapabilityProfile): boolean {
  return profile.requiredKnowledge !== undefined && profile.machineWitnesses !== undefined &&
    profile.renderedWitnesses !== undefined && profile.manualWitnesses !== undefined && nonEmpty(profile.assuranceEvidence);
}

function validPilotEvidence(profile: CapabilityProfile): boolean {
  return parseCapabilityPilotReceiptPin(profile.assuranceEvidence).ok && expectedCapabilityPilotReceipt(profile.id) !== null;
}

function bad(message: string): CatalogParseResult { return { ok: false, message }; }
