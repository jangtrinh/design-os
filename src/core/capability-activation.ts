import { createHash } from "node:crypto";

export type CapabilityStatus = "qualified" | "unqualified";

export interface CapabilityProfile {
  id: string;
  status: CapabilityStatus;
  acceptedInputKinds: string[];
  workflow: string | null;
  artifact: string;
  requiredKnowledge?: string[];
  machineWitnesses?: string[];
  renderedWitnesses?: string[];
  manualWitnesses?: string[];
  qualificationEvidence?: string;
  refusalCode?: string;
  action?: string;
  advisoryKnowledge?: string[];
  qualificationRequirements?: string[];
}

export interface CapabilityCatalog { version: 1; profiles: CapabilityProfile[] }

export interface ActivationReceipt {
  kind: "capability-activation";
  version: 1;
  requestDigest: string;
  catalogDigest: string;
  requestedSurface: string;
  inputKind: string;
  selectionEvidence: Record<string, unknown>;
  disposition: "QUALIFIED" | "UNQUALIFIED";
  route: string | null;
  artifact: string;
  selectedKnowledge: string[];
  machineWitnesses: string[];
  renderedWitnesses: string[];
  manualWitnesses: string[];
  action: string;
}

export type CatalogParseResult =
  | { ok: true; catalog: CapabilityCatalog }
  | { ok: false; message: string };

export type ActivationResult =
  | { ok: true; receipt: ActivationReceipt }
  | { ok: false; code: string; message: string; receipt?: ActivationReceipt; data?: unknown };

const objectValue = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const stringList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.length > 0 && value.every(nonEmpty) ? value as string[] : null;
const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));
const PROFILE_KEYS = [
  "id", "status", "acceptedInputKinds", "workflow", "artifact", "requiredKnowledge",
  "machineWitnesses", "renderedWitnesses", "manualWitnesses", "qualificationEvidence",
  "refusalCode", "action", "advisoryKnowledge", "qualificationRequirements",
] as const;

export function digestText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function parseCapabilityCatalog(raw: string): CatalogParseResult {
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { ok: false, message: "capability catalog is not valid JSON" }; }
  if (!objectValue(value) || !hasOnlyKeys(value, ["version", "profiles"]) || value["version"] !== 1 ||
      !Array.isArray(value["profiles"]) || value["profiles"].length === 0) {
    return { ok: false, message: "capability catalog requires version 1 and profiles[]" };
  }
  const profiles: CapabilityProfile[] = [];
  for (const item of value["profiles"]) {
    if (!objectValue(item) || !hasOnlyKeys(item, PROFILE_KEYS) || !nonEmpty(item["id"]) ||
        !["qualified", "unqualified"].includes(String(item["status"])) ||
        stringList(item["acceptedInputKinds"]) === null ||
        !nonEmpty(item["artifact"]) ||
        !(item["workflow"] === null || nonEmpty(item["workflow"]))) {
      return { ok: false, message: "every capability profile needs id, status, acceptedInputKinds, workflow and artifact" };
    }
    const optionalLists = ["requiredKnowledge", "machineWitnesses", "renderedWitnesses", "manualWitnesses",
      "advisoryKnowledge", "qualificationRequirements"] as const;
    if (optionalLists.some((key) => item[key] !== undefined && stringList(item[key]) === null)) {
      return { ok: false, message: `capability profile '${item["id"]}' contains an invalid string list` };
    }
    if (item["status"] === "qualified" &&
        (stringList(item["requiredKnowledge"]) === null || stringList(item["machineWitnesses"]) === null ||
         stringList(item["renderedWitnesses"]) === null || stringList(item["manualWitnesses"]) === null ||
         !nonEmpty(item["qualificationEvidence"]))) {
      return { ok: false, message: `qualified capability '${item["id"]}' is incomplete` };
    }
    if (item["status"] === "unqualified" &&
        (item["workflow"] !== null || item["refusalCode"] !== "CAPABILITY_UNQUALIFIED" ||
         !nonEmpty(item["action"]) || stringList(item["qualificationRequirements"]) === null)) {
      return { ok: false, message: `unqualified capability '${item["id"]}' is incomplete` };
    }
    profiles.push(item as unknown as CapabilityProfile);
  }
  return { ok: true, catalog: { version: 1, profiles } };
}

export function resolveCapabilityActivation(
  value: unknown,
  catalog: CapabilityCatalog,
  catalogDigest: string,
): ActivationResult {
  if (!objectValue(value) || !hasOnlyKeys(value, ["kind", "version", "rawRequest", "requestedSurface", "inputKind", "selectionEvidence"]) ||
      value["kind"] !== "capability-activation-request" ||
      value["version"] !== 1 || !nonEmpty(value["rawRequest"]) ||
      !nonEmpty(value["requestedSurface"]) || !nonEmpty(value["inputKind"]) ||
      !objectValue(value["selectionEvidence"])) {
    return bad("BAD_ACTIVATION", "activation request has an invalid kind, version, request, surface, input kind or selection evidence");
  }
  const evidence = value["selectionEvidence"];
  if (evidence["kind"] === "quoted-request") {
    if (!hasOnlyKeys(evidence, ["kind", "quote", "role"]) || !nonEmpty(evidence["quote"]) || evidence["role"] !== "requested-artifact" ||
        !value["rawRequest"].includes(evidence["quote"])) {
      return bad("BAD_ACTIVATION", "quoted selection evidence must be a requested-artifact substring of rawRequest");
    }
  } else if (evidence["kind"] === "documented-default") {
    if (!hasOnlyKeys(evidence, ["kind", "rule"]) || evidence["rule"] !== "unspecified-page-output-defaults-to-web-marketing" ||
        value["requestedSurface"] !== "web-marketing") {
      return bad("BAD_ACTIVATION", "documented page default is valid only for web-marketing");
    }
  } else return bad("BAD_ACTIVATION", "selectionEvidence.kind must be quoted-request or documented-default");

  const profile = catalog.profiles.find((candidate) => candidate.id === value["requestedSurface"]);
  if (profile === undefined) {
    return { ok: false, code: "UNKNOWN_CAPABILITY", message: `unknown capability '${value["requestedSurface"]}'`,
      data: { supportedProfiles: catalog.profiles.map((item) => item.id).sort() } };
  }
  if (!profile.acceptedInputKinds.includes(value["inputKind"])) {
    return bad("UNSUPPORTED_INPUT", `${profile.id} does not accept input kind '${value["inputKind"]}'`);
  }
  if (profile.status === "qualified" && (!nonEmpty(profile.workflow) ||
      stringList(profile.requiredKnowledge) === null || stringList(profile.machineWitnesses) === null ||
      stringList(profile.renderedWitnesses) === null || stringList(profile.manualWitnesses) === null)) {
    return bad("BAD_CATALOG", `qualified capability '${profile.id}' is incomplete`);
  }
  if (profile.status === "unqualified" && profile.workflow !== null) {
    return bad("BAD_CATALOG", `unqualified capability '${profile.id}' must have workflow:null`);
  }
  const receipt = buildReceipt(value, evidence, profile, catalogDigest);
  if (profile.status === "unqualified") {
    return { ok: false, code: profile.refusalCode ?? "CAPABILITY_UNQUALIFIED",
      message: `${profile.id} has no qualified DESIGN:OS delivery profile`, receipt };
  }
  return { ok: true, receipt };
}

function buildReceipt(
  request: Record<string, unknown>,
  evidence: Record<string, unknown>,
  profile: CapabilityProfile,
  catalogDigest: string,
): ActivationReceipt {
  const qualified = profile.status === "qualified";
  return {
    kind: "capability-activation", version: 1,
    requestDigest: digestText(String(request["rawRequest"])), catalogDigest,
    requestedSurface: profile.id, inputKind: String(request["inputKind"]),
    selectionEvidence: evidence,
    disposition: qualified ? "QUALIFIED" : "UNQUALIFIED",
    route: qualified ? profile.workflow : null, artifact: profile.artifact,
    selectedKnowledge: qualified ? profile.requiredKnowledge ?? [] : profile.advisoryKnowledge ?? [],
    machineWitnesses: profile.machineWitnesses ?? [],
    renderedWitnesses: profile.renderedWitnesses ?? [],
    manualWitnesses: profile.manualWitnesses ?? [],
    action: profile.action ?? (qualified ? `Proceed with ${profile.workflow}.` : "Stop."),
  };
}

function bad(code: string, message: string): ActivationResult {
  return { ok: false, code, message };
}
