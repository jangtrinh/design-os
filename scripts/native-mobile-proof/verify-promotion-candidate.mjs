import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PILOT_POLICY } from "./native-mobile-proof-policy.mjs";
import { verifyActivationReceiptReplay } from "./activation-receipt-integrity.mjs";
import { resolveContainedPath } from "./proof-path-integrity.mjs";
import { computeSourceTreeForAppRoot } from "./source-tree-integrity.mjs";
import { verifyTier3VisualEvidence } from "./tier-03-visual-integrity.mjs";

const CANDIDATE = Object.freeze({
  capabilityId: "native-ios",
  artifact: "native-ios-application",
  briefId: "native-ios-tocchien-modernization-v1",
  briefPath: "briefs/native-ios-tocchien-modernization.json",
  briefSha256: "6a07e697b0688877984a8147f05530f5f432c18e1be0ec54d7a52ee54bc87246",
  appRoot: "apps/native-ios-tocchien-modernization",
  generatorId: "terra-native-ios-tocchien-generator-03",
  activationPath: "apps/native-ios-tocchien-modernization/activation-receipt.json",
  activationRequestPath: "generator-packets/native-ios-tocchien-modernization-activation-request.json",
  unitTests: 8,
  uiTests: 8,
});

const CONTROLLER_HARNESS = Object.freeze({
  path: "TocChienModernizationUITests/TocChienLayoutUITests.swift",
  sha256: "c7ef1a6c2955271f8ae96c2479196862aed91422e9f5c74dc7d2ad036dd06226",
});

const EVIDENCE = Object.freeze({
  generatedApps: "evidence/tier-02-generated-apps.json",
  captureLedger: "evidence/tier-03-simulator-captures.json",
  reviewReceipt: "evidence/tier-03-review-receipt-tocchien-v2.json",
  currentCuration: "evidence/tier-03-curation-tocchien-v2.json",
});
const TASTE_RUBRIC_PATH = fileURLToPath(new URL("../../knowledge/taste-rubric.md", import.meta.url));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function readBytes(root, path) {
  return readFileSync(resolveContainedPath(root, path, "file"));
}

function readJson(root, path) {
  return JSON.parse(readBytes(root, path));
}

function digestRef(root, path) {
  return { path, sha256: sha256(readBytes(root, path)) };
}

function sameSubject(value, sourceTree) {
  return value?.capabilityId === CANDIDATE.capabilityId
    && value?.artifact === CANDIDATE.artifact
    && value?.briefId === CANDIDATE.briefId
    && value?.briefSha256 === CANDIDATE.briefSha256
    && value?.sourceTreeSha256 === sourceTree.sha256;
}

function hasExactControllerHarnessDeclaration(entry, sourceTree) {
  const declaration = entry?.controllerVerificationHarnessFiles;
  const source = sourceTree.files.find((file) => file.path === CONTROLLER_HARNESS.path);
  return entry?.controllerSourceEdits === 0
    && entry?.controllerVerificationHarnessEdits === 1
    && Array.isArray(declaration) && declaration.length === 1
    && declaration[0]?.path === CONTROLLER_HARNESS.path
    && declaration[0]?.sha256 === CONTROLLER_HARNESS.sha256
    && /(^|\/)[^/]+(?:UI)?Tests\//.test(declaration[0].path)
    && source?.sha256 === declaration[0].sha256;
}

function verifyGeneratedEvidence(root, sourceTree, findings) {
  const run = readJson(root, EVIDENCE.generatedApps);
  const entry = run?.arms?.find((arm) => arm?.capabilityId === CANDIDATE.capabilityId);
  const verification = entry?.controllerVerification;
  if (entry?.generatorId !== CANDIDATE.generatorId || !hasExactControllerHarnessDeclaration(entry, sourceTree)
    || entry?.sourceTreeAlgorithm !== sourceTree.algorithm || entry?.sourceTreeSha256 !== sourceTree.sha256
    || JSON.stringify(entry?.sourceFiles) !== JSON.stringify(sourceTree.files) || !sameSubject(entry?.subject, sourceTree)
    || verification?.unitTests !== CANDIDATE.unitTests || verification?.uiTests !== CANDIDATE.uiTests
    || verification?.failures !== 0 || verification?.exitCode !== 0) {
    findings.push("candidate tier 2 generated evidence identity mismatch");
  }
  if (!verifyActivationReceiptReplay(root, CANDIDATE.capabilityId, CANDIDATE)) {
    findings.push("candidate activation receipt identity mismatch");
  }
}

export function verifyPromotionCandidate(root) {
  const findings = [];
  if (PILOT_POLICY[CANDIDATE.capabilityId]?.appRoot === CANDIDATE.appRoot) {
    findings.push("candidate gate must run before policy promotion");
  }
  const briefBytes = readBytes(root, CANDIDATE.briefPath);
  const brief = JSON.parse(briefBytes);
  if (sha256(briefBytes) !== CANDIDATE.briefSha256 || brief?.id !== CANDIDATE.briefId
    || brief?.surface !== CANDIDATE.capabilityId || brief?.artifact !== CANDIDATE.artifact) {
    findings.push("candidate brief identity mismatch");
  }
  const sourceTree = computeSourceTreeForAppRoot(root, CANDIDATE.appRoot);
  verifyGeneratedEvidence(root, sourceTree, findings);
  const visual = Object.fromEntries(Object.entries({
    captureLedger: EVIDENCE.captureLedger,
    reviewReceipt: EVIDENCE.reviewReceipt,
    currentCuration: EVIDENCE.currentCuration,
  }).map(([name, path]) => [name, digestRef(root, path)]));
  findings.push(...verifyTier3VisualEvidence({
    arm: { capabilityId: CANDIDATE.capabilityId },
    policy: CANDIDATE,
    tier: { witnesses: { visual } },
    root,
    sourceTree,
    tasteRubricSha256: sha256(readFileSync(TASTE_RUBRIC_PATH)),
  }));
  return { findings, sourceTree };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../../showcase/native-mobile-proof-pilot", import.meta.url));
  try {
    const result = verifyPromotionCandidate(root);
    if (result.findings.length > 0) {
      console.error(JSON.stringify({ ok: false, findings: result.findings }, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ ok: true, sourceTreeSha256: result.sourceTree.sha256 }, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({ ok: false, findings: [error.message] }, null, 2));
    process.exitCode = 1;
  }
}
