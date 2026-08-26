import { isDeepStrictEqual } from "node:util";
import { digestText, resolveCapabilityActivation } from "../capability-activation.js";
import type { DeliveryFinding, DeliveryValidationContext } from "./delivery-types.js";
import { finding, nonEmptyString as str, objectValue as obj, requireBase } from "./delivery-shared-validation.js";
import { validateBriefBase } from "./delivery-v1-validation.js";

export function validateBriefV2(
  brief: Record<string, unknown>,
  context: DeliveryValidationContext,
): DeliveryFinding[] {
  requireBase(brief, "design-brief", 2);
  const out = validateBriefBase(brief);
  if (!str(brief["activationRef"])) {
    out.push(finding("missing-activation-ref", "design-brief v2 requires activationRef"));
    return out;
  }
  const envelope = context.activation;
  if (!obj(envelope) || envelope["ok"] !== true || envelope["command"] !== "knowledge activate" || !obj(envelope["data"])) {
    out.push(finding("activation-unreadable", "activationRef must resolve to a successful knowledge activate envelope"));
    return out;
  }
  const receipt = envelope["data"];
  if (receipt["kind"] !== "capability-activation" || receipt["version"] !== 1 || receipt["disposition"] !== "QUALIFIED") {
    out.push(finding("activation-unqualified", "design-brief v2 requires a qualified activation receipt"));
  }
  if (receipt["requestedSurface"] !== "web-marketing" || receipt["route"] !== "generate" || receipt["artifact"] !== "html") {
    out.push(finding("activation-route-mismatch", "marketing brief requires web-marketing -> generate -> html activation"));
  }
  if (str(brief["rawRequest"]) && receipt["requestDigest"] !== digestText(brief["rawRequest"])) {
    out.push(finding("activation-request-drift", "activation request digest does not match design-brief rawRequest"));
  }
  if (!str(context.catalogDigest) || receipt["catalogDigest"] !== context.catalogDigest) {
    out.push(finding("activation-catalog-drift", "activation catalog digest does not match the installed capability catalog"));
  }
  if (context.capabilityCatalog === undefined || !str(context.catalogDigest)) {
    out.push(finding("activation-catalog-unavailable", "installed capability catalog is unavailable for activation replay"));
    return out;
  }
  const replay = resolveCapabilityActivation({
    kind: "capability-activation-request",
    version: 1,
    rawRequest: brief["rawRequest"],
    requestedSurface: receipt["requestedSurface"],
    inputKind: receipt["inputKind"],
    selectionEvidence: receipt["selectionEvidence"],
  }, context.capabilityCatalog, context.catalogDigest);
  if (!replay.ok) {
    out.push(finding("activation-invalid", `activation receipt cannot be replayed: ${replay.code}`));
  } else if (!isDeepStrictEqual(receipt, replay.receipt)) {
    out.push(finding("activation-receipt-mismatch", "activation receipt differs from deterministic catalog resolution"));
  }
  return out;
}
