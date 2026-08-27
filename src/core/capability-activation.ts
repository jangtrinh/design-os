import { createHash } from "node:crypto";
import type { CapabilityCatalog, CapabilityProfile } from "./capability-catalog.js";

export { parseCapabilityCatalog } from "./capability-catalog.js";
export type {
  CapabilityAssurance,
  CapabilityAvailability,
  CapabilityCatalog,
  CapabilityProfile,
  CatalogParseResult,
} from "./capability-catalog.js";

export interface ActivationReceiptV1 {
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

export interface ActivationReceiptV2 {
  kind: "capability-activation";
  version: 2;
  requestDigest: string;
  catalogDigest: string;
  requestedSurface: string;
  inputKind: string;
  selectionEvidence: Record<string, unknown>;
  routingDisposition: "ROUTED" | "REFUSED";
  assurance: "QUALIFIED" | "PROVISIONAL" | "UNASSESSED";
  claimPolicy: "QUALIFIED_DELIVERY_ALLOWED" | "QUALIFIED_DELIVERY_FORBIDDEN";
  route: string | null;
  artifact: string;
  selectedKnowledge: string[];
  machineWitnesses: string[];
  renderedWitnesses: string[];
  manualWitnesses: string[];
  action: string;
}

export type ActivationReceipt = ActivationReceiptV1 | ActivationReceiptV2;
export type ActivationResult =
  | { ok: true; receipt: ActivationReceiptV2 }
  | { ok: false; code: string; message: string; receipt?: ActivationReceiptV2; data?: unknown };

interface ActivationRequest extends Record<string, unknown> {
  rawRequest: string;
  requestedSurface: string;
  inputKind: string;
  selectionEvidence: Record<string, unknown>;
}

const objectValue = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const stringList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.length > 0 && value.every(nonEmpty) ? value as string[] : null;
const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]): boolean =>
  Object.keys(value).every((key) => allowed.includes(key));

export function digestText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function digestActivationRequest(request: Record<string, unknown>): string {
  return digestText(stableJson({
    kind: request["kind"], version: request["version"], rawRequest: request["rawRequest"],
    requestedSurface: request["requestedSurface"], inputKind: request["inputKind"],
    selectionEvidence: request["selectionEvidence"],
  }));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (objectValue(value)) return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function resolveCapabilityActivation(
  value: unknown,
  catalog: CapabilityCatalog,
  catalogDigest: string,
): ActivationResult {
  if (!validRequest(value)) {
    return bad("BAD_ACTIVATION", "activation request has an invalid kind, version, request, surface, input kind or selection evidence");
  }
  const evidence = value["selectionEvidence"];
  const evidenceProblem = validateSelectionEvidence(value, evidence);
  if (evidenceProblem !== null) return bad("BAD_ACTIVATION", evidenceProblem);

  const profile = catalog.profiles.find((candidate) => candidate.id === value["requestedSurface"]);
  if (profile === undefined) {
    return { ok: false, code: "UNKNOWN_CAPABILITY", message: `unknown capability '${value["requestedSurface"]}'`,
      data: { supportedProfiles: catalog.profiles.map((item) => item.id).sort() } };
  }
  if (!profile.acceptedInputKinds.includes(value["inputKind"])) {
    return bad("UNSUPPORTED_INPUT", `${profile.id} does not accept input kind '${value["inputKind"]}'`);
  }
  if (!profileIsConsistent(profile)) return bad("BAD_CATALOG", `capability '${profile.id}' is incomplete`);

  const receipt = buildReceipt(value, evidence, profile, catalogDigest);
  if (profile.availability === "unavailable") {
    return { ok: false, code: profile.refusalCode ?? "CAPABILITY_UNQUALIFIED",
      message: `${profile.id} has no available DESIGN:OS delivery route`, receipt };
  }
  return { ok: true, receipt };
}

function validRequest(value: unknown): value is ActivationRequest {
  return objectValue(value) && hasOnlyKeys(value, ["kind", "version", "rawRequest", "requestedSurface", "inputKind", "selectionEvidence"]) &&
    value["kind"] === "capability-activation-request" && value["version"] === 1 &&
    nonEmpty(value["rawRequest"]) && nonEmpty(value["requestedSurface"]) &&
    nonEmpty(value["inputKind"]) && objectValue(value["selectionEvidence"]);
}

function validateSelectionEvidence(request: ActivationRequest, evidence: Record<string, unknown>): string | null {
  if (evidence["kind"] === "quoted-request") {
    return hasOnlyKeys(evidence, ["kind", "quote", "role"]) && nonEmpty(evidence["quote"]) &&
      evidence["role"] === "requested-artifact" && request.rawRequest.includes(evidence["quote"])
      ? null : "quoted selection evidence must be a requested-artifact substring of rawRequest";
  }
  if (evidence["kind"] === "documented-default") {
    return hasOnlyKeys(evidence, ["kind", "rule"]) &&
      evidence["rule"] === "unspecified-page-output-defaults-to-web-marketing" &&
      request.requestedSurface === "web-marketing"
      ? null : "documented page default is valid only for web-marketing";
  }
  return "selectionEvidence.kind must be quoted-request or documented-default";
}

function profileIsConsistent(profile: CapabilityProfile): boolean {
  if (profile.availability === "unavailable") {
    return profile.workflow === null && profile.assurance === "unassessed" &&
      profile.refusalCode === "CAPABILITY_UNQUALIFIED" && nonEmpty(profile.action);
  }
  return profile.workflow !== null && profile.assurance !== "unassessed" &&
    stringList(profile.requiredKnowledge) !== null && stringList(profile.machineWitnesses) !== null &&
    stringList(profile.renderedWitnesses) !== null && stringList(profile.manualWitnesses) !== null;
}

function buildReceipt(
  request: Record<string, unknown>,
  evidence: Record<string, unknown>,
  profile: CapabilityProfile,
  catalogDigest: string,
): ActivationReceiptV2 {
  const routed = profile.availability === "available";
  const assurance = profile.assurance.toUpperCase() as ActivationReceiptV2["assurance"];
  return {
    kind: "capability-activation", version: 2,
    requestDigest: digestActivationRequest(request), catalogDigest,
    requestedSurface: profile.id, inputKind: String(request["inputKind"]), selectionEvidence: evidence,
    routingDisposition: routed ? "ROUTED" : "REFUSED", assurance,
    claimPolicy: assurance === "QUALIFIED" ? "QUALIFIED_DELIVERY_ALLOWED" : "QUALIFIED_DELIVERY_FORBIDDEN",
    route: routed ? profile.workflow : null, artifact: profile.artifact,
    selectedKnowledge: routed ? profile.requiredKnowledge ?? [] : profile.advisoryKnowledge ?? [],
    machineWitnesses: profile.machineWitnesses ?? [], renderedWitnesses: profile.renderedWitnesses ?? [],
    manualWitnesses: profile.manualWitnesses ?? [],
    action: profile.action ?? (routed ? `Proceed with ${profile.workflow}.` : "Stop."),
  };
}

function bad(code: string, message: string): ActivationResult {
  return { ok: false, code, message };
}
