import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { resolveContainedPath } from "./proof-path-integrity.mjs";

const CATALOG_PATH = fileURLToPath(new URL("../../knowledge/capability-profiles.json", import.meta.url));
const DATA_KEYS = [
  "kind", "version", "requestDigest", "catalogDigest", "requestedSurface", "inputKind",
  "selectionEvidence", "routingDisposition", "assurance", "claimPolicy", "route", "artifact",
  "selectedKnowledge", "machineWitnesses", "renderedWitnesses", "manualWitnesses", "action",
];
const REQUEST_KEYS = ["kind", "version", "rawRequest", "requestedSurface", "inputKind", "selectionEvidence"];
const sha256 = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const sameKeys = (value, expected) => isRecord(value)
  && Object.keys(value).sort().join("\n") === [...expected].sort().join("\n");

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function validQuotedEvidence(request) {
  const evidence = request.selectionEvidence;
  return sameKeys(evidence, ["kind", "quote", "role"])
    && evidence.kind === "quoted-request"
    && typeof evidence.quote === "string"
    && evidence.quote.length > 0
    && evidence.role === "requested-artifact"
    && request.rawRequest.includes(evidence.quote);
}

function expectedReceipt(request, profile, catalogDigest) {
  const assurance = profile.assurance.toUpperCase();
  return {
    kind: "capability-activation",
    version: 2,
    requestDigest: sha256(stableJson(request)),
    catalogDigest,
    requestedSurface: profile.id,
    inputKind: request.inputKind,
    selectionEvidence: request.selectionEvidence,
    routingDisposition: "ROUTED",
    assurance,
    claimPolicy: assurance === "QUALIFIED" ? "QUALIFIED_DELIVERY_ALLOWED" : "QUALIFIED_DELIVERY_FORBIDDEN",
    route: profile.workflow,
    artifact: profile.artifact,
    selectedKnowledge: profile.requiredKnowledge,
    machineWitnesses: profile.machineWitnesses,
    renderedWitnesses: profile.renderedWitnesses,
    manualWitnesses: profile.manualWitnesses,
    action: profile.action ?? `Proceed with ${profile.workflow}.`,
  };
}

export function verifyActivationReceiptReplay(root, capabilityId, policy) {
  try {
    const request = readJson(resolveContainedPath(root, policy.activationRequestPath, "file"));
    const envelope = readJson(resolveContainedPath(root, policy.activationPath, "file"));
    const catalogBytes = readFileSync(CATALOG_PATH);
    const catalog = JSON.parse(catalogBytes);
    const profile = catalog?.profiles?.find((candidate) => candidate?.id === capabilityId);
    if (!sameKeys(request, REQUEST_KEYS)
      || request.kind !== "capability-activation-request"
      || request.version !== 1
      || request.requestedSurface !== capabilityId
      || typeof request.rawRequest !== "string"
      || request.rawRequest.length === 0
      || typeof request.inputKind !== "string"
      || request.inputKind.length === 0
      || !validQuotedEvidence(request)
      || profile?.availability !== "available"
      || profile.workflow !== capabilityId
      || profile.artifact !== policy.artifact) {
      return false;
    }
    const expected = expectedReceipt(request, profile, sha256(catalogBytes));
    return sameKeys(envelope, ["ok", "command", "data"])
      && envelope.ok === true
      && envelope.command === "knowledge activate"
      && sameKeys(envelope.data, DATA_KEYS)
      && stableJson(envelope.data) === stableJson(expected);
  } catch {
    return false;
  }
}
