import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { verifyCaptureLedger } from "./capture-ledger-integrity.mjs";
import { verifyActivationReceiptReplay } from "./activation-receipt-integrity.mjs";
import { PILOT_POLICY, ROUTING_BASE_GIT_SHA } from "./native-mobile-proof-policy.mjs";
import { verifyTier6OwnerEvidence } from "./owner-acceptance-integrity.mjs";
import { verifyRoutingEvidence } from "./routing-evidence-integrity.mjs";
import { computeSourceTree } from "./source-tree-integrity.mjs";
import { verifyTier3Evidence } from "./tier-03-evidence-integrity.mjs";

export { computeSourceTree, PILOT_POLICY };

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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

function verifyTierContract(arm, tier, contract) {
  const label = `${arm.capabilityId} tier ${tier?.id ?? "?"}`;
  const evidencePaths = Array.isArray(tier?.evidence) ? tier.evidence.map((ref) => ref?.path) : [];
  const witnessKeys = tier?.witnesses && typeof tier.witnesses === "object" && !Array.isArray(tier.witnesses)
    ? Object.keys(tier.witnesses).sort()
    : [];
  return tier?.status === contract.status
    && tier?.authorizedClaim === contract.authorizedClaim
    && JSON.stringify(evidencePaths) === JSON.stringify(contract.evidencePaths)
    && JSON.stringify(witnessKeys) === JSON.stringify([...contract.witnessKeys].sort())
    ? []
    : [`${label} state, claim, evidence, or witness contract mismatch`];
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

function verifyControllerHarness(entry, policy, sourceTree) {
  const expected = policy.controllerVerificationHarnessFiles ?? [];
  const declared = entry?.controllerVerificationHarnessFiles;
  if (expected.length === 0) {
    return (entry?.controllerVerificationHarnessEdits ?? 0) === 0
      && (declared === undefined || (Array.isArray(declared) && declared.length === 0));
  }
  return entry?.controllerVerificationHarnessEdits === expected.length
    && JSON.stringify(declared) === JSON.stringify(expected)
    && expected.every((record) => /(^|\/)[^/]+(?:UI)?Tests\//.test(record.path)
      && sourceTree.files.some((file) => file.path === record.path && file.sha256 === record.sha256));
}

function verifyGeneratedEvidence(arm, policy, tier, root, sourceTree) {
  if (!Array.isArray(tier?.evidence)) return false;
  const runRef = tier.evidence.find((ref) => ref?.path === "evidence/tier-02-generated-apps.json");
  const run = runRef ? readJson(root, runRef) : null;
  if (!hasExactCapabilitySet(run?.arms)) return false;
  const entry = run.arms.find((item) => item.capabilityId === arm.capabilityId);
  const activationRef = tier.evidence.find((ref) => ref?.path === policy.activationPath);
  const verification = entry?.controllerVerification;
  return tier.witnesses?.generatorId === policy.generatorId
    && run?.routingBaseGitSha === ROUTING_BASE_GIT_SHA
    && tier.witnesses?.controllerSourceEdits === 0
    && tier.witnesses?.sourceTreeSha256 === sourceTree.sha256
    && entry?.generatorId === policy.generatorId
    && entry?.controllerSourceEdits === 0
    && verifyControllerHarness(entry, policy, sourceTree)
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
    && activationRef !== undefined
    && verifyActivationReceiptReplay(root, arm.capabilityId, policy)
    && verification?.unitTests === policy.unitTests
    && verification?.uiTests === policy.uiTests
    && verification?.failures === 0
    && verification?.exitCode === 0;
}

function verifyMixedAuthorshipEvidence(arm, policy, tier, root, sourceTree) {
  if (!Array.isArray(tier?.evidence) || typeof policy.sourceLineagePath !== "string") return false;
  const runRef = tier.evidence.find((ref) => ref?.path === "evidence/tier-02-generated-apps.json");
  const lineageRef = tier.evidence.find((ref) => ref?.path === policy.sourceLineagePath);
  const activationRef = tier.evidence.find((ref) => ref?.path === policy.activationPath);
  const run = runRef ? readJson(root, runRef) : null;
  const lineage = lineageRef ? readJson(root, lineageRef) : null;
  if (!hasExactCapabilitySet(run?.arms)) return false;
  const entry = run.arms.find((item) => item.capabilityId === arm.capabilityId);
  const originFiles = Array.isArray(entry?.sourceFiles) ? entry.sourceFiles : [];
  const originTreeSha256 = sha256(JSON.stringify({ algorithm: entry?.sourceTreeAlgorithm, files: originFiles }));
  const currentFiles = new Map(sourceTree.files.map((file) => [file.path, file.sha256]));
  const repairs = Array.isArray(lineage?.productionRepairs) ? lineage.productionRepairs : [];
  const additional = Array.isArray(lineage?.additionalChangedPaths) ? lineage.additionalChangedPaths : [];
  const harness = Array.isArray(lineage?.controllerVerificationHarness) ? lineage.controllerVerificationHarness : [];
  const postGenerationHarness = Array.isArray(lineage?.postGenerationVerificationHarness)
    ? lineage.postGenerationVerificationHarness
    : [];
  const originHarness = harness.map((record) => ({ path: record.path, sha256: record.originSha256 }));
  const currentHarness = [...postGenerationHarness, ...harness];
  const currentHarnessFiles = currentHarness.map((record) => ({
    path: record.path,
    sha256: record.finalSha256,
  }));
  const allFinalPaths = [...repairs, ...additional, ...currentHarness];
  return lineage?.kind === "design-os.native-mobile-source-lineage"
    && lineage?.version === 1
    && lineage?.capabilityId === arm.capabilityId
    && lineage?.artifact === policy.artifact
    && lineage?.briefId === policy.briefId
    && lineage?.originGenerator === policy.generatorId
    && lineage?.disposition === "MIXED_AUTHORSHIP_UNQUALIFIED"
    && lineage?.intermediateCheckpoint === "UNVERIFIED_INTERMEDIATE"
    && lineage?.qualification?.tier2GenerationProvenance === "FAIL"
    && lineage?.originCheckpoint?.sourceTreeSha256 === entry?.sourceTreeSha256
    && originTreeSha256 === entry?.sourceTreeSha256
    && lineage?.finalCheckpoint?.sourceTreeSha256 === sourceTree.sha256
    && tier?.witnesses?.originSourceTreeSha256 === entry?.sourceTreeSha256
    && tier?.witnesses?.finalSourceTreeSha256 === sourceTree.sha256
    && tier?.witnesses?.controllerSourceEdits === repairs.length
    && tier?.witnesses?.controllerVerificationHarnessEdits === currentHarness.length
    && tier?.witnesses?.lineageDisposition === "UNVERIFIED_INTERMEDIATE"
    && entry?.generatorId === policy.generatorId
    && entry?.controllerSourceEdits === 0
    && JSON.stringify(entry?.controllerVerificationHarnessFiles) === JSON.stringify(originHarness)
    && JSON.stringify(policy.controllerVerificationHarnessFiles) === JSON.stringify(currentHarnessFiles)
    && repairs.length > 0
    && harness.length > 0
    && allFinalPaths.every((record) => currentFiles.get(record.path) === record.finalSha256)
    && activationRef !== undefined
    && verifyActivationReceiptReplay(root, arm.capabilityId, policy);
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
    for (const [tierId, contract] of Object.entries(policy.tierContracts)) {
      findings.push(...verifyTierContract(arm, tierById(arm, Number(tierId)), contract));
    }
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
    } else if (generatedTier?.status === "FAIL" && policy.sourceLineagePath) {
      if (generatedTier.witnesses?.finalSourceTreeSha256 !== sourceTree.sha256) {
        findings.push(`${arm.capabilityId} tier 2 source tree digest mismatch`);
      }
      if (!verifyMixedAuthorshipEvidence(arm, policy, generatedTier, root, sourceTree)) {
        findings.push(`${arm.capabilityId} tier 2 generated evidence identity mismatch`);
      }
    } else if (generatedTier?.status === "FAIL"
      && (generatedTier?.witnesses?.generatorId !== policy.generatorId
        || generatedTier.evidence?.some((ref) => ref?.path?.includes("source-lineage")))) {
      findings.push(`${arm.capabilityId} tier 2 generated evidence identity mismatch`);
    }

    const tier3 = tierById(arm, 3);
    if (tier3) findings.push(...verifyTier3Evidence({ arm, policy, tier: tier3, root, sourceTree, capture }));
    for (const tierId of [4, 5]) {
      const tier = tierById(arm, tierId);
      if (tier?.status === "PASS" && !hasPhysicalReceipt(arm, tier, root, sourceTree)) {
        findings.push(`${arm.capabilityId} tier ${tierId} physical witness is not backed by retained device evidence`);
      }
    }
    const tier6 = tierById(arm, 6);
    if (tier6) findings.push(...verifyTier6OwnerEvidence({
      arm, policy, tier: tier6, tier3, root, sourceTree, capture,
    }));
  }
  return findings;
}
