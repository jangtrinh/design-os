import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { resolveContainedPath } from "./proof-path-integrity.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const nonBlank = (value) => typeof value === "string" && value.trim().length > 0;
const sameStrings = (left, right) => Array.isArray(left) && left.length === right.length
  && [...left].sort().join("\n") === [...right].sort().join("\n");
const sameSubject = (value, expected) => value?.capabilityId === expected.capabilityId
  && value?.artifact === expected.artifact && value?.briefId === expected.briefId
  && value?.briefSha256 === expected.briefSha256 && value?.sourceTreeSha256 === expected.sourceTreeSha256;

function captureMetadataIncomplete(capture, expectedSubject) {
  return !nonBlank(capture?.screenId) || !nonBlank(capture.path) || !nonBlank(capture.device) || !nonBlank(capture.runtime)
    || !nonBlank(capture.udid) || !nonBlank(capture.appearance) || !nonBlank(capture.contentSize) || !/^[a-f0-9]{64}$/.test(capture.sha256 ?? "")
    || capture.sourceTreeSha256 !== expectedSubject.sourceTreeSha256 || !Array.isArray(capture.launchArguments) || capture.launchArguments.some((argument) => !nonBlank(argument))
    || !Number.isInteger(capture?.pixels?.width) || capture.pixels.width <= 0 || !Number.isInteger(capture?.pixels?.height) || capture.pixels.height <= 0;
}

function pngDimensions(bytes) {
  const signature = "89504e470d0a1a0a";
  if (bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature || bytes.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function verifyGeometry(label, geometry, screenIds, findings) {
  const screens = Array.isArray(geometry?.screens) ? geometry.screens : [];
  if (geometry?.coordinateSpace !== "points") findings.push(`${label} point-space geometry is required`);
  if (!sameStrings(screens.map((screen) => screen?.screenId), screenIds)
    || screens.map((screen) => screen?.kind).sort().join(",") !== "catalog,detail,dictionary") {
    findings.push(`${label} point-space geometry must cover catalog, detail, and dictionary screens exactly once`);
    return;
  }
  for (const screen of screens) {
    const fold = screen?.aboveFold;
    const viewport = screen?.viewport;
    if (!Number.isFinite(viewport?.widthPoints) || viewport.widthPoints <= 0
      || !Number.isFinite(viewport?.heightPoints) || viewport.heightPoints <= 0
      || !Number.isInteger(fold?.completeRows) || fold.completeRows < 0) {
      findings.push(`${label} ${screen?.screenId ?? "?"} has invalid point-space measurements`);
      continue;
    }
    if (screen.kind === "catalog" && fold.completeRows < 2) findings.push(`${label} catalog requires two complete above-fold rows`);
    if (screen.kind === "detail" && (!Number.isFinite(fold.heroHeightPoints) || fold.heroHeightPoints <= 0
      || !Number.isFinite(fold.nextSectionStartYPoints) || fold.nextSectionStartYPoints <= 0
      || fold.nextSectionStartYPoints < fold.heroHeightPoints
      || fold.heroHeightPoints / viewport.heightPoints > 0.33 || fold.nextSectionStartYPoints > viewport.heightPoints)) {
      findings.push(`${label} detail violates above-fold hero or next-section bounds`);
    }
    if (screen.kind === "dictionary" && (!Number.isFinite(fold.chromeHeightPoints) || fold.chromeHeightPoints <= 0 || fold.chromeHeightPoints > 160 || fold.completeRows < 4)) {
      findings.push(`${label} dictionary violates chrome or above-fold row bounds`);
    }
  }
}

function validFrame(frame) {
  return Number.isFinite(frame?.minX) && Number.isFinite(frame?.minY)
    && Number.isFinite(frame?.maxX) && Number.isFinite(frame?.maxY)
    && frame.maxX > frame.minX && frame.maxY > frame.minY;
}

function verifyStressCaptureState(label, stress, geometry, findings) {
  const kindByScreen = new Map((geometry?.screens ?? []).map((screen) => [screen?.screenId, screen?.kind]));
  for (const capture of stress) {
    const kind = kindByScreen.get(capture?.screenId);
    if (kind === "detail") {
      if (capture?.captureState !== "top-of-scroll") findings.push(`${label} detail stress capture must preserve the top-of-scroll state`);
      continue;
    }
    if (!["catalog", "dictionary"].includes(kind)) continue;
    const target = capture?.targetFramePoints;
    const boundary = capture?.lowerBoundaryFramePoints;
    if (capture?.captureState !== "representative-content-fully-visible"
      || !nonBlank(capture?.scrollTargetId) || !nonBlank(capture?.lowerBoundaryId)
      || !Number.isFinite(capture?.minimumGapPoints) || capture.minimumGapPoints < 8
      || capture?.targetFrameIntersectsChrome !== false || !validFrame(target) || !validFrame(boundary)) {
      findings.push(`${label} ${kind} stress capture lacks auditable representative-content state`);
      continue;
    }
    if (target.maxY > boundary.minY - capture.minimumGapPoints) {
      findings.push(`${label} ${kind} stress target is not fully visible above persistent chrome`);
    }
  }
}

export function verifyTier3CaptureLedger(label, ledger, root, expectedSubject, findings, options = {}) {
  if (ledger?.kind !== "design-os.native-mobile-simulator-capture-evidence" || ledger?.version !== 2) {
    findings.push(`${label} visual evidence requires a v2 capture ledger`);
    return { normal: [], stress: [], screenIds: [] };
  }
  const subjects = Array.isArray(ledger.subjects) ? ledger.subjects : [];
  const allCaptures = Array.isArray(ledger.captures) ? ledger.captures : [];
  const subjectCapabilities = subjects.map((subject) => subject?.capabilityId);
  const captureCapabilities = [...new Set(allCaptures.map((capture) => capture?.capabilityId))];
  if (!subjects.some((subject) => sameSubject(subject, expectedSubject))) {
    findings.push(`${label} v2 capture ledger subject mismatch`);
  }
  if (new Set(subjectCapabilities).size !== subjects.length || !sameStrings(subjectCapabilities, captureCapabilities)) {
    findings.push(`${label} v2 capture ledger subjects must match captured capabilities exactly`);
  }
  const captures = allCaptures.filter((capture) => capture?.capabilityId === expectedSubject.capabilityId);
  const normal = captures.filter((capture) => capture.captureClass === "normal");
  const stress = captures.filter((capture) => capture.captureClass === "stress");
  const key = (capture) => [capture?.screenId, capture?.captureClass, capture?.appearance, capture?.device].join("|");
  const validStressSet = stress.length === 0 || stress.length === 3;
  if (captures.length !== normal.length + stress.length || normal.length !== 6 || !validStressSet
    || (options.stressRequired === true && stress.length !== 3)
    || new Set(captures.map((capture) => capture?.path)).size !== captures.length
    || new Set(captures.map(key)).size !== captures.length) {
    findings.push(`${label} v2 capture ledger has invalid normal/stress set`);
  }
  const screenIds = [...new Set(normal.map((capture) => capture?.screenId))].sort();
  for (const capture of captures) {
    if (typeof capture?.path !== "string" || !capture.path.startsWith("screenshots/") || capture.path.includes("..")) {
      findings.push(`${label} v2 capture path is unsafe`);
      continue;
    }
    try {
      const bytes = readFileSync(resolveContainedPath(root, `evidence/${capture.path}`, "file"));
      if (sha256(bytes) !== capture.sha256) findings.push(`${label} v2 capture digest mismatch: ${capture.path}`);
      const dimensions = pngDimensions(bytes);
      if (!dimensions || dimensions.width !== capture?.pixels?.width || dimensions.height !== capture?.pixels?.height) {
        findings.push(`${label} v2 capture pixel metadata mismatch: ${capture.path}`);
      }
    } catch {
      findings.push(`${label} v2 capture path is unreadable: ${capture.path}`);
    }
  }
  if (screenIds.length !== 3 || normal.some((capture) => captureMetadataIncomplete(capture, expectedSubject) || !["light", "dark"].includes(capture.appearance))) {
    findings.push(`${label} v2 normal capture metadata is incomplete`);
  }
  if (normal.some((capture) => capture.contentSize !== "large")) {
    findings.push(`${label} v2 normal captures require the exact content-size class`);
  }
  for (const screenId of screenIds) {
    if (!sameStrings(normal.filter((capture) => capture.screenId === screenId).map((capture) => capture.appearance), ["light", "dark"])) {
      findings.push(`${label} ${screenId} must have light and dark normal captures`);
    }
  }
  if (stress.length > 0) {
    if (stress.some((capture) => captureMetadataIncomplete(capture, expectedSubject))) findings.push(`${label} v2 stress capture metadata is incomplete`);
    if (stress.some((capture) => capture.contentSize !== "accessibility-extra-extra-extra-large")) {
      findings.push(`${label} v2 stress captures require the exact content-size class`);
    }
    if (!sameStrings(stress.map((capture) => capture?.screenId), screenIds)) {
      findings.push(`${label} v2 stress captures must cover each normal screen exactly once`);
    }
  }
  verifyGeometry(label, ledger.pointSpaceGeometry, screenIds, findings);
  verifyStressCaptureState(label, stress, ledger.pointSpaceGeometry, findings);
  return { normal, stress, screenIds };
}
