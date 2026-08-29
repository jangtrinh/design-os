import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolveContainedPath } from "./proof-path-integrity.mjs";
import { TIER_03_AUTO_FAILS, TIER_03_AXES, isDigestRef, isRecord } from "./tier-03-dispositions.mjs";
import { verifyTier3CaptureLedger } from "./tier-03-capture-integrity.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const strictAxes = new Set(["Layout", "Typography", "Spacing", "Consistency"]);
const nonBlank = (value) => typeof value === "string" && value.trim().length > 0;
const sameStrings = (left, right) => Array.isArray(left) && left.length === right.length
  && [...left].sort().join("\n") === [...right].sort().join("\n");
const sameSubject = (value, expected) => value?.capabilityId === expected.capabilityId
  && value?.artifact === expected.artifact && value?.briefId === expected.briefId
  && value?.briefSha256 === expected.briefSha256 && value?.sourceTreeSha256 === expected.sourceTreeSha256;

function readJsonRef(root, ref, label, findings) {
  if (!isDigestRef(ref)) {
    findings.push(`${label} is invalid`);
    return null;
  }
  try {
    const body = readFileSync(resolveContainedPath(root, ref.path, "file"));
    if (sha256(body) !== ref.sha256) {
      findings.push(`${label} digest mismatch`);
      return null;
    }
    return JSON.parse(body);
  } catch {
    findings.push(`${label} is unreadable`);
    return null;
  }
}

function identity(value, role) {
  return isRecord(value) && value.role === role
    && nonBlank(value.sessionId) && nonBlank(value.workerId);
}

function isDateTime(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && !Number.isNaN(Date.parse(value));
}

function verifyReceipt(label, receipt, refs, expectedSubject, policy, tasteRubricSha256, normal, stress, findings) {
  if (receipt?.kind !== "design-os.native-mobile-tier-03-review-receipt" || receipt?.version !== 2 || !sameSubject(receipt.subject, expectedSubject)) {
    findings.push(`${label} visual evidence requires a v2 review receipt`);
    return;
  }
  if (!isDateTime(receipt.createdAt) || !identity(receipt.controller, "controller")
    || !identity(receipt.reviewer, "independent-curator") || !isRecord(receipt.generator)
    || receipt.generator.id !== policy.generatorId || !nonBlank(receipt.generator.sessionId) || !nonBlank(receipt.generator.workerId)) {
    findings.push(`${label} v2 receipt lacks controller or independent reviewer identity`);
  } else {
    if (receipt.reviewer.sessionId === receipt.generator.sessionId || receipt.reviewer.workerId === receipt.generator.workerId) {
      findings.push(`${label} v2 receipt reuses generator identity`);
    }
    if (receipt.reviewer.sessionId === receipt.controller.sessionId || receipt.reviewer.workerId === receipt.controller.workerId) {
      findings.push(`${label} v2 receipt reuses controller identity`);
    }
    if (receipt.controller.sessionId === receipt.generator.sessionId || receipt.controller.workerId === receipt.generator.workerId) {
      findings.push(`${label} v2 receipt reuses generator identity for controller verification`);
    }
  }
  const hashes = receipt.inputHashes;
  if (!isRecord(hashes) || hashes.tasteRubricSha256 !== tasteRubricSha256 || hashes.briefSha256 !== expectedSubject.briefSha256
    || hashes.sourceTreeSha256 !== expectedSubject.sourceTreeSha256 || hashes.captureLedgerSha256 !== refs.captureLedger.sha256) {
    findings.push(`${label} v2 receipt input hashes are not immutable`);
  }
  if (!sameStrings(receipt.normalCapturePaths, normal.map((capture) => capture.path))
    || !sameStrings(receipt.stressCapturePaths, stress.map((capture) => capture.path))) {
    findings.push(`${label} v2 receipt capture paths do not match the exact normal/stress sets`);
  }
}

function verifyCuration(label, curation, refs, expectedSubject, receipt, normal, stress, screenIds, findings) {
  if (curation?.kind !== "design-os.native-mobile-tier-03-visual-curation" || curation?.version !== 2) {
    findings.push(`${label} visual evidence requires a v2 current curation`);
    return;
  }
  if (curation.capabilityId !== expectedSubject.capabilityId || !sameSubject(curation.subject, expectedSubject)
    || curation.captureLedgerSha256 !== refs.captureLedger.sha256 || curation.reviewReceiptSha256 !== refs.reviewReceipt.sha256
    || !Array.isArray(curation.blockers) || curation.blockers.length !== 0
    || curation?.reviewer?.sessionId !== receipt?.reviewer?.sessionId || curation?.reviewer?.workerId !== receipt?.reviewer?.workerId) {
    findings.push(`${label} v2 curation identity is invalid`);
  }
  const reviews = Array.isArray(curation.screenReviews) ? curation.screenReviews : [];
  if (!sameStrings(reviews.map((review) => review?.screenId), screenIds)) {
    findings.push(`${label} v2 curation must score the exact three normal screens`);
  }
  for (const review of reviews) {
    const captures = normal.filter((capture) => capture.screenId === review?.screenId);
    const hashFor = (appearance) => captures.find((capture) => capture.appearance === appearance)?.sha256;
    if (review?.normalCaptureHashes?.light !== hashFor("light") || review?.normalCaptureHashes?.dark !== hashFor("dark")) {
      findings.push(`${label} ${review?.screenId ?? "?"} must bind both normal light and dark hashes`);
    }
    if (!nonBlank(review?.appearanceObservations?.light) || !nonBlank(review?.appearanceObservations?.dark)) {
      findings.push(`${label} ${review?.screenId ?? "?"} requires non-empty light and dark observations`);
    }
    if (!isRecord(review?.axes) || !sameStrings(Object.keys(review.axes), TIER_03_AXES)) {
      findings.push(`${label} ${review?.screenId ?? "?"} axes must match the exact rubric`);
    }
    for (const axis of TIER_03_AXES) {
      const result = review?.axes?.[axis];
      if (strictAxes.has(axis) && result?.disposition === "NOT_APPLICABLE") {
        findings.push(`${label} ${review?.screenId ?? "?"} ${axis} cannot be NOT_APPLICABLE`);
        continue;
      }
      if (!strictAxes.has(axis) && result?.disposition === "NOT_APPLICABLE" && (typeof result.rationale !== "string" || result.rationale.length === 0)) {
        findings.push(`${label} ${review?.screenId ?? "?"} ${axis} NOT_APPLICABLE requires rationale`);
      } else if (!strictAxes.has(axis) && result?.disposition === "NOT_APPLICABLE") {
        if (!sameStrings(Object.keys(result), ["disposition", "rationale"]) || !nonBlank(result.rationale)) {
          findings.push(`${label} ${review?.screenId ?? "?"} ${axis} has an invalid NOT_APPLICABLE result`);
        }
      } else if (result?.disposition !== "NOT_APPLICABLE") {
        if (!isRecord(result) || !sameStrings(Object.keys(result), ["score", "evidence"])) {
          findings.push(`${label} ${review?.screenId ?? "?"} ${axis} has an invalid scored result`);
        }
        if (!Number.isInteger(result?.score) || result.score < 0 || result.score > 10) {
          findings.push(`${label} ${review?.screenId ?? "?"} ${axis} score must be an integer from 0 to 10`);
        } else if (result.score < (strictAxes.has(axis) ? 8 : 7)) {
          findings.push(`${label} ${review?.screenId ?? "?"} ${axis} is below threshold`);
        }
        if (!nonBlank(result?.evidence)) {
          findings.push(`${label} ${review?.screenId ?? "?"} ${axis} requires score evidence`);
        }
      }
    }
  }
  const autoFails = curation.autoFails;
  if (!isRecord(autoFails) || !sameStrings(Object.keys(autoFails), TIER_03_AUTO_FAILS) || TIER_03_AUTO_FAILS.some((name) => autoFails[name] !== false)) {
    findings.push(`${label} v2 curation auto-fails are incomplete or triggered`);
  }
  const stressObservations = Array.isArray(curation?.stressObservations) ? curation.stressObservations : [];
  if (!sameStrings(stressObservations.map((item) => item?.capturePath), stress.map((capture) => capture.path))
    || stressObservations.some((item) => !nonBlank(item?.observation))) {
    findings.push(`${label} v2 curation stress observations must bind the exact stress set`);
  }
}

export function verifyTier3VisualEvidence({ arm, policy, tier, root, sourceTree, tasteRubricSha256 }) {
  const findings = [];
  const label = `${arm.capabilityId} tier 3`;
  const refs = tier.witnesses.visual;
  if (!isRecord(refs)) return [`${label} visual evidence state is invalid`];
  const expectedSubject = { capabilityId: arm.capabilityId, artifact: policy.artifact, briefId: policy.briefId, briefSha256: policy.briefSha256, sourceTreeSha256: sourceTree.sha256 };
  const curation = readJsonRef(root, refs.currentCuration, `${label} current curation`, findings);
  const receipt = readJsonRef(root, refs.reviewReceipt, `${label} review receipt`, findings);
  const ledger = readJsonRef(root, refs.captureLedger, `${label} capture ledger`, findings);
  const { normal, stress, screenIds } = verifyTier3CaptureLedger(label, ledger, root, expectedSubject, findings);
  verifyReceipt(label, receipt, refs, expectedSubject, policy, tasteRubricSha256, normal, stress, findings);
  verifyCuration(label, curation, refs, expectedSubject, receipt, normal, stress, screenIds, findings);
  return findings;
}
