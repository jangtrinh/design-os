import { readFileSync } from "node:fs";
import { join } from "node:path";

import { verifyCaptureLedger } from "./capture-ledger-integrity.mjs";
import { PILOT_POLICY, ROUTING_BASE_GIT_SHA } from "./native-mobile-proof-policy.mjs";
import { verifyRoutingEvidence } from "./routing-evidence-integrity.mjs";
import { computeSourceTree } from "./source-tree-integrity.mjs";

export { computeSourceTree, PILOT_POLICY };

function readJson(root, ref) {
  try {
    return JSON.parse(readFileSync(join(root, ...ref.path.split("/")), "utf8"));
  } catch {
    return null;
  }
}

function sameSubject(value, expected) {
  return value?.capabilityId === expected.capabilityId
    && value?.artifact === expected.artifact
    && value?.briefId === expected.briefId
    && value?.briefSha256 === expected.briefSha256
    && value?.sourceTreeSha256 === expected.sourceTreeSha256;
}

function tierById(arm, id) {
  return Array.isArray(arm?.tiers) ? arm.tiers.find((tier) => tier?.id === id) : undefined;
}

function hasExactCapabilitySet(values) {
  return Array.isArray(values)
    && values.length === 2
    && values.map((item) => item?.capabilityId).sort().join(",") === "native-ios,native-ipados";
}

function verifyBrief(arm, policy, root) {
  if (!arm?.brief || typeof arm.brief.path !== "string") return false;
  const brief = readJson(root, arm.brief);
  return arm.brief.path === policy.briefPath
    && arm.brief.sha256 === policy.briefSha256
    && brief?.id === policy.briefId
    && brief?.surface === arm.capabilityId
    && brief?.artifact === policy.artifact;
}

function verifyGeneratedEvidence(arm, policy, tier, root, sourceTree) {
  if (!Array.isArray(tier?.evidence)) return false;
  const runRef = tier.evidence.find((ref) => ref?.path === "evidence/tier-02-generated-apps.json");
  const run = runRef ? readJson(root, runRef) : null;
  if (!hasExactCapabilitySet(run?.arms)) return false;
  const entry = run.arms.find((item) => item.capabilityId === arm.capabilityId);
  const activationRef = tier.evidence.find((ref) => ref?.path === policy.activationPath);
  const activation = activationRef ? readJson(root, activationRef)?.data : null;
  const verification = entry?.controllerVerification;
  return tier.witnesses?.generatorId === policy.generatorId
    && run?.routingBaseGitSha === ROUTING_BASE_GIT_SHA
    && tier.witnesses?.controllerSourceEdits === 0
    && tier.witnesses?.sourceTreeSha256 === sourceTree.sha256
    && entry?.generatorId === policy.generatorId
    && entry?.controllerSourceEdits === 0
    && entry?.sourceTreeAlgorithm === sourceTree.algorithm
    && JSON.stringify(entry?.sourceFiles) === JSON.stringify(sourceTree.files)
    && entry?.sourceTreeSha256 === sourceTree.sha256
    && sameSubject(entry?.subject, {
      capabilityId: arm.capabilityId,
      artifact: policy.artifact,
      briefId: policy.briefId,
      briefSha256: policy.briefSha256,
      sourceTreeSha256: sourceTree.sha256,
    })
    && activation?.requestedSurface === arm.capabilityId
    && activation?.route === arm.capabilityId
    && activation?.artifact === policy.artifact
    && verification?.unitTests === policy.unitTests
    && verification?.uiTests === policy.uiTests
    && verification?.failures === 0
    && verification?.exitCode === 0;
}

function verifyCuratorEvidence(arm, policy, tier, root, sourceTree, captureLedgerValid) {
  if (!Array.isArray(tier?.evidence)) return false;
  const expectedSubject = {
    capabilityId: arm.capabilityId,
    artifact: policy.artifact,
    briefId: policy.briefId,
    briefSha256: policy.briefSha256,
    sourceTreeSha256: sourceTree.sha256,
  };
  const reviewerId = tier.witnesses?.independentReviewerId;
  const captureRef = tier.evidence.find((ref) => ref?.path === "evidence/tier-03-simulator-captures.json");
  const capture = captureRef ? readJson(root, captureRef) : null;
  if (!hasExactCapabilitySet(capture?.subjects)) return false;
  const captureSubject = capture?.subjects?.find((subject) => subject.capabilityId === arm.capabilityId);
  const curation = tier.evidence
    .filter((ref) => ref?.path?.includes("curation") && ref.path.endsWith(".json"))
    .map((ref) => readJson(root, ref))
    .find((item) => item?.reviewerId === reviewerId && hasExactCapabilitySet(item?.arms));
  const disposition = curation?.arms?.find((item) => item.capabilityId === arm.capabilityId);
  return reviewerId === "luna-native-mobile-curator-04"
    && reviewerId !== policy.generatorId
    && tier.witnesses?.generatorId === policy.generatorId
    && captureLedgerValid
    && sameSubject(captureSubject, expectedSubject)
    && disposition?.disposition === "PASS"
    && Array.isArray(disposition?.blockers)
    && disposition.blockers.length === 0
    && sameSubject(disposition?.subject, expectedSubject)
    && disposition?.captureLedgerSha256 === captureRef?.sha256;
}

function hasPhysicalReceipt(arm, tier, root, sourceTree) {
  return Array.isArray(tier?.evidence) && tier.evidence.some((ref) => {
    const receipt = ref.path.endsWith(".json") ? readJson(root, ref) : null;
    return receipt?.kind === "design-os.native-mobile-physical-device-evidence"
      && receipt?.capabilityId === arm.capabilityId
      && receipt?.sourceTreeSha256 === sourceTree.sha256
      && receipt?.device?.transport !== "simulator"
      && typeof receipt?.device?.identifier === "string"
      && receipt.device.identifier === tier.witnesses?.physicalDevice;
  });
}

export function verifyProofSubjects(manifest, root) {
  const findings = [];
  const arms = Array.isArray(manifest?.arms) ? manifest.arms : [];
  const tier1 = readJson(root, { path: "evidence/tier-01-routing.json" });
  const tier2 = readJson(root, { path: "evidence/tier-02-generated-apps.json" });
  if (manifest?.routingBaseGitSha !== ROUTING_BASE_GIT_SHA
    || tier1?.routingBaseGitSha !== ROUTING_BASE_GIT_SHA
    || tier2?.routingBaseGitSha !== ROUTING_BASE_GIT_SHA) {
    findings.push("routing base commit identity mismatch");
  }
  if (!verifyRoutingEvidence(tier1)) findings.push("tier 1 routing evidence identity mismatch");

  const capture = readJson(root, { path: "evidence/tier-03-simulator-captures.json" });
  const captureFindings = verifyCaptureLedger(capture, root);
  findings.push(...captureFindings);

  for (const arm of arms) {
    if (!arm || typeof arm !== "object") continue;
    const policy = PILOT_POLICY[arm.capabilityId];
    if (!policy) continue;
    const routingTier = tierById(arm, 1);
    if (routingTier?.status === "PASS"
      && (!Array.isArray(routingTier.evidence)
        || routingTier.evidence.length !== 1
        || routingTier.evidence[0]?.path !== "evidence/tier-01-routing.json")) {
      findings.push(`${arm.capabilityId} tier 1 routing evidence identity mismatch`);
    }
    if (!verifyBrief(arm, policy, root)) findings.push(`${arm.capabilityId} brief identity mismatch`);

    let sourceTree;
    try {
      sourceTree = computeSourceTree(root, arm.capabilityId);
    } catch (error) {
      findings.push(`${arm.capabilityId} tier 2 source tree invalid: ${error.message}`);
      continue;
    }
    const generatedTier = tierById(arm, 2);
    if (generatedTier?.status === "PASS") {
      if (generatedTier.witnesses?.sourceTreeSha256 !== sourceTree.sha256) {
        findings.push(`${arm.capabilityId} tier 2 source tree digest mismatch`);
      }
      if (!verifyGeneratedEvidence(arm, policy, generatedTier, root, sourceTree)) {
        findings.push(`${arm.capabilityId} tier 2 generated evidence identity mismatch`);
      }
    }

    const tier3 = tierById(arm, 3);
    const captureLedgerValid = !captureFindings.some((finding) => finding.startsWith(`${arm.capabilityId} tier 3`));
    if (tier3?.status === "PASS" && !verifyCuratorEvidence(arm, policy, tier3, root, sourceTree, captureLedgerValid)) {
      findings.push(`${arm.capabilityId} tier 3 reviewer is not backed by retained PASS curation`);
    }
    for (const tierId of [4, 5]) {
      const tier = tierById(arm, tierId);
      if (tier?.status === "PASS" && !hasPhysicalReceipt(arm, tier, root, sourceTree)) {
        findings.push(`${arm.capabilityId} tier ${tierId} physical witness is not backed by retained device evidence`);
      }
    }
    const tier6 = tierById(arm, 6);
    if (tier6?.status === "PASS") {
      findings.push(`${arm.capabilityId} tier 6 owner ACCEPT is not bound to the exact source artifact`);
    }
  }
  return findings;
}
