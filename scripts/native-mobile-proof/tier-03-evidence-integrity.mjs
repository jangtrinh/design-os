import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { URL, fileURLToPath } from "node:url";

import { verifyTier3VisualEvidence } from "./tier-03-visual-integrity.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const sameSubject = (value, expected) => value?.capabilityId === expected.capabilityId
  && value?.artifact === expected.artifact && value?.briefId === expected.briefId
  && value?.briefSha256 === expected.briefSha256 && value?.sourceTreeSha256 === expected.sourceTreeSha256;
const sameRef = (left, right) => left?.path === right?.path && left?.sha256 === right?.sha256;

export function tasteRubricDigest() {
  return sha256(readFileSync(fileURLToPath(new URL("../../knowledge/taste-rubric.md", import.meta.url))));
}

function verifyBehaviorEvidence(arm, policy, tier, root, sourceTree, capture) {
  const findings = [];
  const label = `${arm.capabilityId} tier 3`;
  const behavior = tier.witnesses.behavior;
  const expectedSubject = {
    capabilityId: arm.capabilityId,
    artifact: policy.artifact,
    briefId: policy.briefId,
    briefSha256: policy.briefSha256,
    sourceTreeSha256: sourceTree.sha256,
  };
  const verification = behavior?.controllerVerification;
  if (!sameSubject(behavior?.subject, expectedSubject)
    || behavior?.environment !== tier.environment
    || verification?.unitTests !== policy.unitTests || verification?.uiTests !== policy.uiTests
    || verification?.failures !== 0 || verification?.exitCode !== 0) {
    findings.push(`${label} behavior PASS is not bound to exact zero-failure subject evidence`);
  }
  const evidence = Array.isArray(behavior?.evidence) ? behavior.evidence : [];
  const captureRef = evidence.find((ref) => ref?.path === "evidence/tier-03-simulator-captures.json");
  if (!captureRef || !Array.isArray(tier.evidence) || !tier.evidence.some((ref) => sameRef(ref, captureRef))) {
    findings.push(`${label} behavior PASS lacks retained capture evidence`);
  }
  const subject = capture?.subjects?.find((candidate) => candidate?.capabilityId === arm.capabilityId);
  if (!sameSubject(subject, expectedSubject)) findings.push(`${label} behavior capture subject mismatch`);
  return findings;
}

export function verifyTier3Evidence({ arm, policy, tier, root, sourceTree, capture }) {
  const witnesses = tier?.witnesses;
  if (!witnesses || typeof witnesses !== "object") return [];
  const findings = [];
  if (witnesses.generatorId !== policy.generatorId) findings.push(`${arm.capabilityId} tier 3 generator identity mismatch`);
  if (witnesses.behaviorDisposition === "PASS") {
    findings.push(...verifyBehaviorEvidence(arm, policy, tier, root, sourceTree, capture));
  }
  if (witnesses.visualDisposition === "PASS") {
    findings.push(...verifyTier3VisualEvidence({ arm, policy, tier, root, sourceTree, tasteRubricSha256: tasteRubricDigest() }));
  }
  return findings;
}
