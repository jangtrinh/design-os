import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

import { resolveContainedPath } from "./proof-path-integrity.mjs";
import { verifyProofSubjects } from "./verify-proof-subjects.mjs";

const STATUSES = new Set(["PASS", "FAIL", "PENDING", "NOT RUN"]);
const ARM_ARTIFACTS = new Map([
  ["native-ios", "native-ios-application"],
  ["native-ipados", "native-ipados-application"],
]);
const FORBIDDEN_CLAIM = /\b(qualified|production[- ]ready|every device|all devices|universally)\b/i;
const TOP_LEVEL_KEYS = new Set(["kind", "version", "routingBaseGitSha", "assurance", "claimPolicy", "generatedAt", "knownFailures", "arms"]);
const ARM_KEYS = new Set(["capabilityId", "artifact", "brief", "tiers"]);
const TIER_KEYS = new Set(["id", "status", "authorizedClaim", "environment", "evidence", "witnesses"]);
const DIGEST_KEYS = new Set(["path", "sha256"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasDigest = (value) => isRecord(value)
  && typeof value.path === "string"
  && value.path.length > 0
  && typeof value.sha256 === "string"
  && /^[a-f0-9]{64}$/.test(value.sha256);
const sha256 = (body) => createHash("sha256").update(body).digest("hex");

function unexpectedProperties(value, allowed, label) {
  if (!isRecord(value)) return [];
  return Object.keys(value)
    .filter((key) => !allowed.has(key))
    .map((key) => `${label} has unexpected property: ${key}`);
}

function isDateTime(value) {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, , offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12
    && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 60
    && (offsetHourText === undefined || (Number(offsetHourText) <= 23 && Number(offsetMinuteText) <= 59));
}

function validateDigestRef(ref, label) {
  if (!isRecord(ref)) return [`${label} is invalid`];
  return [
    ...unexpectedProperties(ref, DIGEST_KEYS, label),
    ...(!hasDigest(ref) ? [`${label} is invalid`] : []),
  ];
}

function validateTier(armId, tier) {
  const findings = [];
  const label = `${armId} tier ${String(tier?.id ?? "?")}`;
  if (!isRecord(tier) || !Number.isInteger(tier.id) || tier.id < 1 || tier.id > 6) return [`${label} is invalid`];
  findings.push(...unexpectedProperties(tier, TIER_KEYS, label));
  if (!STATUSES.has(tier.status)) findings.push(`${label} has invalid status`);
  if (typeof tier.authorizedClaim !== "string" || tier.authorizedClaim.length === 0) findings.push(`${label} requires authorizedClaim`);
  if (FORBIDDEN_CLAIM.test(tier.authorizedClaim ?? "")) findings.push(`${label} authorizedClaim exceeds its evidence tier`);
  if (typeof tier.environment !== "string" || tier.environment.length === 0) findings.push(`${label} requires environment`);
  if (!Array.isArray(tier.evidence) || tier.evidence.some((item) => !hasDigest(item))) findings.push(`${label} has invalid evidence references`);
  else {
    for (const ref of tier.evidence) findings.push(...validateDigestRef(ref, `${label} evidence`));
    if (new Set(tier.evidence.map((ref) => `${ref.path}:${ref.sha256}`)).size !== tier.evidence.length) {
      findings.push(`${label} has duplicate evidence references`);
    }
  }
  if (tier.status === "PASS" && (!Array.isArray(tier.evidence) || tier.evidence.length === 0)) findings.push(`${label} PASS requires evidence`);
  if (tier.witnesses !== undefined && !isRecord(tier.witnesses)) findings.push(`${label} witnesses must be an object`);

  const witnesses = isRecord(tier.witnesses) ? tier.witnesses : {};
  if (tier.status === "PASS" && tier.id === 2) {
    if (witnesses.controllerSourceEdits !== 0 || typeof witnesses.generatorId !== "string" || !/^[a-f0-9]{64}$/.test(witnesses.sourceTreeSha256 ?? "")) {
      findings.push(`${label} PASS requires generator identity, source digest, and zero controller source edits`);
    }
  }
  if (tier.status === "PASS" && tier.id === 3) {
    if (typeof witnesses.generatorId !== "string" || typeof witnesses.independentReviewerId !== "string"
      || witnesses.generatorId === witnesses.independentReviewerId || !Array.isArray(witnesses.blockers) || witnesses.blockers.length !== 0) {
      findings.push(`${label} PASS requires an independent zero-blocker visual witness`);
    }
  }
  if (tier.status === "PASS" && (tier.id === 4 || tier.id === 5)) {
    if (typeof witnesses.physicalDevice !== "string" || witnesses.physicalDevice.length === 0) findings.push(`${label} PASS requires physical device evidence`);
  }
  if (tier.status === "PASS" && tier.id === 6 && witnesses.ownerDisposition !== "ACCEPT") {
    findings.push(`${label} PASS requires an explicit owner ACCEPT witness`);
  }
  return findings;
}

export function validateNativeMobileProofManifest(manifest) {
  const findings = [];
  if (!isRecord(manifest)) return ["manifest must be an object"];
  findings.push(...unexpectedProperties(manifest, TOP_LEVEL_KEYS, "manifest"));
  if (manifest.kind !== "design-os.native-mobile-proof" || manifest.version !== 1) findings.push("manifest identity is invalid");
  if (!/^[a-f0-9]{40}$/.test(manifest.routingBaseGitSha ?? "")) findings.push("routingBaseGitSha must be a full Git SHA");
  if (!isDateTime(manifest.generatedAt)) findings.push("generatedAt must be a date-time");
  if (manifest.assurance !== "PROVISIONAL") findings.push("assurance must remain PROVISIONAL");
  if (manifest.claimPolicy !== "QUALIFIED_DELIVERY_FORBIDDEN") findings.push("claimPolicy must forbid qualified delivery");
  if (!Array.isArray(manifest.knownFailures) || manifest.knownFailures.some((item) => typeof item !== "string" || item.length === 0)
    || new Set(manifest.knownFailures).size !== manifest.knownFailures.length
    || !manifest.knownFailures.includes("unfiltered Xcode 26.5 accessibility audit")) {
    findings.push("known full Xcode accessibility audit failure must remain visible");
  }

  if (!Array.isArray(manifest.arms)) return [...findings, "arms must contain native-ios and native-ipados exactly once"];
  const ids = manifest.arms.map((arm) => arm?.capabilityId).sort();
  if (ids.join(",") !== "native-ios,native-ipados") findings.push("arms must contain native-ios and native-ipados exactly once");
  for (const arm of manifest.arms) {
    if (!isRecord(arm) || !ARM_ARTIFACTS.has(arm.capabilityId)) continue;
    findings.push(...unexpectedProperties(arm, ARM_KEYS, `${arm.capabilityId} arm`));
    if (arm.artifact !== ARM_ARTIFACTS.get(arm.capabilityId)) findings.push(`${arm.capabilityId} artifact identity is invalid`);
    findings.push(...validateDigestRef(arm.brief, `${arm.capabilityId} brief reference`));
    if (!Array.isArray(arm.tiers) || arm.tiers.map((tier) => tier?.id).join(",") !== "1,2,3,4,5,6") {
      findings.push(`${arm.capabilityId} must contain tiers 1 through 6 exactly once`);
      continue;
    }
    for (const tier of arm.tiers) findings.push(...validateTier(arm.capabilityId, tier));
  }
  return findings;
}

function verifyRef(ref, root, label) {
  if (!hasDigest(ref) || isAbsolute(ref.path) || normalize(ref.path).startsWith("..")) return [`${label} has unsafe evidence path`];
  const absolute = join(root, ref.path);
  if (!existsSync(absolute)) return [`${label} missing: ${ref.path}`];
  let contained;
  try {
    contained = resolveContainedPath(root, ref.path, "file");
  } catch {
    return [`${label} is not a regular file: ${ref.path}`];
  }
  return sha256(readFileSync(contained)) === ref.sha256 ? [] : [`${label} digest mismatch: ${ref.path}`];
}

export function verifyNativeMobileProofManifest(manifest, root) {
  const findings = validateNativeMobileProofManifest(manifest);
  if (!isRecord(manifest) || !Array.isArray(manifest.arms)) return findings;
  for (const arm of manifest.arms) {
    if (!isRecord(arm)) continue;
    findings.push(...verifyRef(arm.brief, root, `${arm.capabilityId} brief`));
    for (const tier of Array.isArray(arm.tiers) ? arm.tiers : []) {
      if (!isRecord(tier) || !Array.isArray(tier.evidence)) continue;
      for (const ref of tier.evidence) findings.push(...verifyRef(ref, root, `${arm.capabilityId} tier ${tier.id} evidence`));
    }
  }
  findings.push(...verifyProofSubjects(manifest, root));
  return findings;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const manifestPath = process.argv[2] ?? "showcase/native-mobile-proof-pilot/proof-manifest.json";
  const root = process.argv[3] ?? "showcase/native-mobile-proof-pilot";
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const findings = verifyNativeMobileProofManifest(manifest, root);
  if (findings.length > 0) {
    for (const finding of findings) process.stderr.write(`ERROR ${finding}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`OK native mobile proof manifest (${manifest.arms.length} arms × 6 tiers)\n`);
  }
}
