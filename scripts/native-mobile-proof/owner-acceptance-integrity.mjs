import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { resolveContainedPath } from "./proof-path-integrity.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sameRef = (left, right) => left?.path === right?.path && left?.sha256 === right?.sha256;
const sameSet = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && [...left].sort().join("\n") === [...right].sort().join("\n");
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && sameSet(Object.keys(value), keys);
const sameSubject = (value, expected) => value?.capabilityId === expected.capabilityId
  && value?.artifact === expected.artifact && value?.briefId === expected.briefId
  && value?.briefSha256 === expected.briefSha256 && value?.sourceTreeSha256 === expected.sourceTreeSha256;

function isDateTime(value) {
  const match = typeof value === "string"
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value)
    : null;
  if (!match) return false;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const instant = new Date(value);
  return !Number.isNaN(instant.valueOf()) && instant.getUTCFullYear() === year
    && instant.getUTCMonth() + 1 === month && instant.getUTCDate() === day
    && instant.getUTCHours() === hour && instant.getUTCMinutes() === minute
    && instant.getUTCSeconds() === second;
}

function readBoundJson(root, ref) {
  try {
    const body = readFileSync(resolveContainedPath(root, ref.path, "file"));
    return sha256(body) === ref.sha256 ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

function exactOwnerRecord(record, expectedSubject, expectedOwner, tier3Refs, normalCaptures) {
  if (!exactKeys(record, ["kind", "version", "recordedAt", "owner", "statement", "subject", "tier3Evidence", "screenVerdicts", "excludedClaims"])
    || record.kind !== "design-os.native-mobile-tier-06-owner-verdict" || record.version !== 1
    || !isDateTime(record.recordedAt) || record.recordedAt !== expectedOwner?.recordedAt
    || !sameSubject(record.subject, expectedSubject)) return false;
  if (!exactKeys(record.owner, ["id", "role"]) || record.owner.id !== expectedOwner?.ownerId
    || record.owner.role !== "product-owner" || !exactKeys(record.statement, ["verbatim", "language", "scope"])
    || record.statement.verbatim !== expectedOwner?.verbatim
    || record.statement.language !== expectedOwner?.language || record.statement.scope !== expectedOwner?.scope) return false;
  if (!exactKeys(record.tier3Evidence, ["captureLedger", "reviewReceipt", "curation"])
    || !sameRef(record.tier3Evidence.captureLedger, tier3Refs.captureLedger)
    || !sameRef(record.tier3Evidence.reviewReceipt, tier3Refs.reviewReceipt)
    || !sameRef(record.tier3Evidence.curation, tier3Refs.currentCuration)) return false;
  const expectedScreens = ["champion-catalogue", "champion-detail", "game-dictionary"];
  const verdicts = Array.isArray(record.screenVerdicts) ? record.screenVerdicts : [];
  if (!sameSet(verdicts.map((item) => item?.screenId), expectedScreens)) return false;
  for (const verdict of verdicts) {
    if (!exactKeys(verdict, ["screenId", "disposition", "normalCaptures"]) || verdict.disposition !== "ACCEPT") return false;
    const captures = Array.isArray(verdict.normalCaptures) ? verdict.normalCaptures : [];
    if (!sameSet(captures.map((item) => item?.appearance), ["light", "dark"])) return false;
    for (const capture of captures) {
      if (!exactKeys(capture, ["appearance", "path", "sha256", "reviewBasis"])) return false;
      const ledgerCapture = normalCaptures.find((item) => item.screenId === verdict.screenId && item.appearance === capture.appearance);
      const expectedBasis = capture.appearance === "light" ? "owner-direct" : "independent-tier-03";
      if (!ledgerCapture || capture.path !== ledgerCapture.path || capture.sha256 !== ledgerCapture.sha256
        || capture.reviewBasis !== expectedBasis) return false;
    }
  }
  return sameSet(record.excludedClaims, [
    "physical-device", "live-assistive-technology", "native-ipados-visual", "assurance-upgrade", "qualified-delivery",
  ]);
}

function ownerScreenVerdicts(record) {
  return record.screenVerdicts.map((verdict) => ({
    screenId: verdict.screenId,
    disposition: verdict.disposition,
    lightReviewBasis: verdict.normalCaptures.find((capture) => capture.appearance === "light")?.reviewBasis,
    darkReviewBasis: verdict.normalCaptures.find((capture) => capture.appearance === "dark")?.reviewBasis,
  }));
}

export function verifyTier6OwnerEvidence({ arm, policy, tier, tier3, root, sourceTree, capture }) {
  if (tier?.status !== "PASS") return [];
  const finding = `${arm.capabilityId} tier 6 owner ACCEPT is not bound to the exact source artifact`;
  const ownerRef = Array.isArray(tier.evidence) && tier.evidence.length === 1 ? tier.evidence[0] : null;
  const witnesses = tier.witnesses;
  const tier3Refs = tier3?.witnesses?.visual;
  if (!policy.ownerVerdictPath || ownerRef?.path !== policy.ownerVerdictPath
    || !exactKeys(witnesses, ["ownerDisposition", "ownerScreenVerdicts", "sourceTreeSha256", "ownerVerdict"])
    || witnesses.ownerDisposition !== "ACCEPT" || witnesses.sourceTreeSha256 !== sourceTree.sha256
    || !sameRef(witnesses.ownerVerdict, ownerRef) || !exactKeys(tier3Refs, ["currentCuration", "reviewReceipt", "captureLedger"])) {
    return [finding];
  }
  const expectedSubject = {
    capabilityId: arm.capabilityId,
    artifact: policy.artifact,
    briefId: policy.briefId,
    briefSha256: policy.briefSha256,
    sourceTreeSha256: sourceTree.sha256,
  };
  const normalCaptures = Array.isArray(capture?.captures)
    ? capture.captures.filter((item) => item?.capabilityId === arm.capabilityId && item?.captureClass === "normal")
    : [];
  const record = readBoundJson(root, ownerRef);
  return record && exactOwnerRecord(record, expectedSubject, policy.ownerAcceptance, tier3Refs, normalCaptures)
    && JSON.stringify(witnesses.ownerScreenVerdicts) === JSON.stringify(ownerScreenVerdicts(record))
    ? []
    : [finding];
}
