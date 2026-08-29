const BEHAVIOR_DISPOSITIONS = new Set(["PASS", "FAIL", "NOT_RUN"]);
const VISUAL_DISPOSITIONS = new Set(["PASS", "FAIL", "UNASSESSED"]);

export const TIER_03_AUTO_FAILS = Object.freeze([
  "duplicate-screen-title",
  "duplicate-search-surface",
  "wrong-or-missing-authorized-asset",
  "missing-historical-notice",
  "normal-large-clipping-or-overlap",
  "excessive-chrome-or-padding",
  "below-fold-density",
  "oversized-detail-hero",
  "placeholder-or-generic-scaffold",
  "below-axis-threshold",
]);

export const TIER_03_AXES = Object.freeze([
  "Layout",
  "Typography",
  "Spacing",
  "Consistency",
  "Motion",
  "Iconography",
  "Depth-Surface",
]);

export const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
export const isDigestRef = (value) => isRecord(value)
  && typeof value.path === "string" && value.path.length > 0
  && typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256);

function unexpectedProperties(value, keys, label) {
  return isRecord(value) ? Object.keys(value).filter((key) => !keys.has(key)).map((key) => `${label} has unexpected property: ${key}`) : [];
}

export function deriveTier3Status(behaviorDisposition, visualDisposition) {
  if (behaviorDisposition === "FAIL" || visualDisposition === "FAIL") return "FAIL";
  if (behaviorDisposition === "PASS" && visualDisposition === "PASS") return "PASS";
  if (behaviorDisposition === "NOT_RUN" && visualDisposition === "UNASSESSED") return "NOT RUN";
  return "PENDING";
}

function validSubject(subject) {
  return isRecord(subject)
    && typeof subject.capabilityId === "string"
    && typeof subject.artifact === "string"
    && typeof subject.briefId === "string"
    && /^[a-f0-9]{64}$/.test(subject.briefSha256 ?? "")
    && /^[a-f0-9]{64}$/.test(subject.sourceTreeSha256 ?? "");
}

function validVerification(value) {
  return isRecord(value)
    && Number.isInteger(value.unitTests) && value.unitTests >= 0
    && Number.isInteger(value.uiTests) && value.uiTests >= 0
    && Number.isInteger(value.failures) && value.failures >= 0
    && Number.isInteger(value.exitCode);
}

export function validateTier3Witnesses(armId, tier) {
  const findings = [];
  const label = `${armId} tier 3`;
  const witnesses = tier?.witnesses;
  if (!isRecord(witnesses)) return [`${label} witnesses must be an object`];
  findings.push(...unexpectedProperties(witnesses, new Set([
    "generatorId", "behaviorDisposition", "visualDisposition", "behavior", "visual",
  ]), `${label} witnesses`));

  if (typeof witnesses.generatorId !== "string" || witnesses.generatorId.length === 0) {
    findings.push(`${label} requires generator identity`);
  }
  if (!BEHAVIOR_DISPOSITIONS.has(witnesses.behaviorDisposition)) {
    findings.push(`${label} witnesses require behaviorDisposition`);
  }
  if (!VISUAL_DISPOSITIONS.has(witnesses.visualDisposition)) {
    findings.push(`${label} witnesses require visualDisposition`);
  }

  const behavior = witnesses.behavior;
  findings.push(...unexpectedProperties(behavior, new Set([
    "subject", "controllerVerification", "environment", "evidence",
  ]), `${label} behavior`));
  if (witnesses.behaviorDisposition === "PASS") {
    if (!isRecord(behavior) || !validSubject(behavior.subject) || !validVerification(behavior.controllerVerification)
      || typeof behavior.environment !== "string" || behavior.environment.length === 0
      || !Array.isArray(behavior.evidence) || behavior.evidence.length === 0
      || behavior.evidence.some((ref) => !isDigestRef(ref))) {
      findings.push(`${label} behavior PASS requires exact subject, zero-failure verification, environment, and evidence`);
    }
  }

  const visual = witnesses.visual;
  findings.push(...unexpectedProperties(visual, new Set([
    "reason", "currentCuration", "reviewReceipt", "captureLedger",
  ]), `${label} visual`));
  if (!isRecord(visual)) findings.push(`${label} requires visual evidence state`);
  if (witnesses.visualDisposition === "UNASSESSED" && (!isRecord(visual) || typeof visual.reason !== "string" || visual.reason.length === 0)) {
    findings.push(`${label} visual UNASSESSED requires a reason`);
  }
  if (witnesses.visualDisposition === "PASS" && (!isRecord(visual)
    || !isDigestRef(visual.currentCuration) || !isDigestRef(visual.reviewReceipt) || !isDigestRef(visual.captureLedger))) {
    findings.push(`${label} visual PASS requires current curation, review receipt, and capture ledger`);
  }

  const expectedStatus = deriveTier3Status(witnesses.behaviorDisposition, witnesses.visualDisposition);
  if (tier?.status !== expectedStatus) findings.push(`${label} aggregate status must be ${expectedStatus}`);
  return findings;
}
