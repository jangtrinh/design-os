import { canonicalStringify } from "./ds-manifest.js";
import { TRIGGERS } from "./flow-model.js";
import {
  CAPTURES,
  DISPOSITIONS,
  FIELDS,
  asObject,
  ascii,
  badProductContext,
  isDigest,
  isKnownValue,
  isRfc3339,
  requireExactKeys,
  requireIdentifier,
  requireReasonCode,
  requireScalar,
  requireSortedStrings,
  requireStringList,
} from "./product-context-value.js";
import type { Json, Obj } from "./product-context-value.js";

const RECEIPT_KEYS = ["kind", "version", "receiptId", "productId", "sourceRef", "sourceDigest", "capturedAt", "captureDisposition", "omittedCount", "reasonCodes", "claims"];
const CLAIM_KEYS = ["claimId", "field", "required", "disposition", "value", "reason", "supersedes"];
const PRODUCT_TRUTH_LIST_FIELDS = ["productTruth.availableProof", "productTruth.prohibitedClaims", "productTruth.contentInventory"];
const SUPERSEDES_ID = /^[a-z0-9][a-z0-9._-]{0,127}#[a-z0-9][a-z0-9._-]{0,127}$/;

function requireFlowString(value: unknown, required: boolean): string {
  return requireScalar(value, required ? 1 : 0, 500);
}

function compareFlowMembers(left: Json, right: Json): number {
  const byId = ascii(String((left as Obj).id), String((right as Obj).id));
  return byId !== 0 ? byId : ascii(canonicalStringify(left), canonicalStringify(right));
}

function optionalFlowStrings(item: Record<string, unknown>, keys: readonly string[]): Obj {
  return Object.fromEntries(
    keys.filter((key) => key in item).map((key) => [key, requireFlowString(item[key], false)]),
  ) as Obj;
}

function normalizeScreen(item: Record<string, unknown>): Json {
  const keys = ["id", "name", "mode", "artifact", "states", "terminal"];
  if (Object.keys(item).some((key) => !keys.includes(key)) || !("id" in item) || ("terminal" in item && typeof item.terminal !== "boolean")) {
    badProductContext();
  }
  if ("states" in item && (!Array.isArray(item.states) || item.states.length > 64)) {
    badProductContext();
  }
  return {
    id: requireFlowString(item.id, true),
    ...optionalFlowStrings(item, ["name", "mode", "artifact"]),
    ...("states" in item ? { states: (item.states as unknown[]).map((value) => requireFlowString(value, false)).sort(ascii) } : {}),
    ...("terminal" in item ? { terminal: item.terminal } : {}),
  } as Json;
}

function normalizeTransition(item: Record<string, unknown>): Json {
  const keys = ["id", "from", "to", "trigger", "label", "source", "guard", "async"];
  if (Object.keys(item).some((key) => !keys.includes(key)) || !("id" in item && "from" in item && "to" in item && "trigger" in item) || !TRIGGERS.includes(String(item.trigger) as (typeof TRIGGERS)[number]) || ("async" in item && typeof item.async !== "boolean")) {
    badProductContext();
  }
  return {
    id: requireFlowString(item.id, true),
    from: requireFlowString(item.from, true),
    to: requireFlowString(item.to, true),
    trigger: requireFlowString(item.trigger, true),
    ...optionalFlowStrings(item, ["label", "source", "guard"]),
    ...("async" in item ? { async: item.async } : {}),
  } as Json;
}

function normalizeEntryPoint(item: Record<string, unknown>): Json {
  const keys = ["id", "screen", "name"];
  if (Object.keys(item).some((key) => !keys.includes(key)) || !("id" in item && "screen" in item)) {
    badProductContext();
  }
  return {
    id: requireFlowString(item.id, true),
    screen: requireFlowString(item.screen, true),
    ...optionalFlowStrings(item, ["name"]),
  } as Json;
}

function normalizeFlow(value: unknown, field: string): Json[] {
  if (!Array.isArray(value)) badProductContext();
  const max = field === "flow.entryPoints" ? 1024 : 4096;
  if (value.length > max) badProductContext();
  const normalize = field === "flow.screens" ? normalizeScreen : field === "flow.transitions" ? normalizeTransition : normalizeEntryPoint;
  return value.map((item) => normalize(asObject(item))).sort(compareFlowMembers);
}

export function normalizeProductContextClaim(value: unknown): Obj {
  const claim = asObject(value);
  requireExactKeys(claim, CLAIM_KEYS);
  const field = isKnownValue(claim.field, FIELDS) ? claim.field : badProductContext();
  const disposition = isKnownValue(claim.disposition, DISPOSITIONS) ? claim.disposition : badProductContext();
  if (typeof claim.required !== "boolean") badProductContext();
  const hasValue = ["present", "partial", "stale", "rejected"].includes(disposition);
  if ((hasValue && claim.value === null) || (!hasValue && claim.value !== null)) badProductContext();
  const normalizedValue = !hasValue ? null : field.startsWith("productTruth.") ? PRODUCT_TRUTH_LIST_FIELDS.includes(field) ? requireStringList(claim.value) : requireScalar(claim.value, 1, 2000) : normalizeFlow(claim.value, field);
  return {
    claimId: requireIdentifier(claim.claimId),
    field,
    required: claim.required,
    disposition,
    value: normalizedValue,
    reason: requireScalar(claim.reason, 1, 500),
    supersedes: requireSortedStrings(
      claim.supersedes,
      (item) => {
        if (typeof item !== "string" || !SUPERSEDES_ID.test(item)) badProductContext();
        return item;
      },
      64,
    ),
  };
}

export function normalizeProductContextReceipt(value: unknown): Obj {
  const receipt = asObject(value);
  requireExactKeys(receipt, RECEIPT_KEYS);
  if (receipt.kind !== "product-context-receipt" || receipt.version !== 1 || !isKnownValue(receipt.captureDisposition, CAPTURES) || typeof receipt.omittedCount !== "number" || !Number.isSafeInteger(receipt.omittedCount) || receipt.omittedCount < 0 || (receipt.sourceDigest !== null && !isDigest(receipt.sourceDigest)) || (receipt.capturedAt !== null && !isRfc3339(receipt.capturedAt))) {
    badProductContext();
  }
  const claims = !Array.isArray(receipt.claims) || receipt.claims.length > 256 ? badProductContext() : receipt.claims.map(normalizeProductContextClaim).sort((left, right) => ascii(String(left.claimId), String(right.claimId)));
  if (new Set(claims.map((claim) => claim.claimId)).size !== claims.length) badProductContext();
  const reasonCodes = requireSortedStrings(receipt.reasonCodes, requireReasonCode, 64);
  const captured = receipt.captureDisposition === "captured";
  const capped = receipt.captureDisposition === "capped";
  if ((captured && (receipt.sourceDigest === null || claims.length === 0 || receipt.omittedCount !== 0 || reasonCodes.length !== 0)) || (capped && (receipt.sourceDigest === null || receipt.omittedCount === 0 || reasonCodes.length === 0)) || (!captured && !capped && (claims.length !== 0 || receipt.omittedCount !== 0 || reasonCodes.length === 0))) {
    badProductContext();
  }
  return {
    kind: "product-context-receipt",
    version: 1,
    receiptId: requireIdentifier(receipt.receiptId),
    productId: requireIdentifier(receipt.productId),
    sourceRef: requireIdentifier(receipt.sourceRef),
    sourceDigest: receipt.sourceDigest as Json,
    capturedAt: receipt.capturedAt as Json,
    captureDisposition: receipt.captureDisposition,
    omittedCount: receipt.omittedCount,
    reasonCodes,
    claims,
  };
}
