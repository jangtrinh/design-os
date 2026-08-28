import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";

export const CAPABILITY_PILOT_RECEIPT_KIND = "design-os.capability-pilot-receipt" as const;

export interface CapabilityPilotReceipt {
  kind: typeof CAPABILITY_PILOT_RECEIPT_KIND;
  version: 1;
  capabilityId: string;
  pilotId: string;
  surfaceCategory: string;
  evidenceDisposition: string;
  ownerVerdict: string;
  ownerDisposition: string;
}

export interface CapabilityPilotReceiptExpectation {
  readonly capabilityId: string;
  readonly pilotId: string;
  readonly surfaceCategory: string;
  readonly evidenceDisposition: string;
  readonly ownerVerdict: string;
  readonly ownerDisposition: string;
  readonly profilePolicyDigest?: string;
  readonly sourceEvidencePin?: string;
}

const NATIVE_MACOS_PILOT_01: CapabilityPilotReceiptExpectation = Object.freeze({
  capabilityId: "native-macos",
  pilotId: "native-macos-pilot-01",
  surfaceCategory: "note-document-editor",
  evidenceDisposition: "retained",
  ownerVerdict: "OK khá ổn rồi.",
  ownerDisposition: "accept-with-reservation",
  profilePolicyDigest: "sha256:ca53857de1b13c51996c6d27cc43b84bab51b441f79717b3b8de26b893179b96",
});

const CAPABILITY_PILOT_RECEIPTS: Readonly<Record<string, CapabilityPilotReceiptExpectation>> = Object.freeze({
  "native-macos": NATIVE_MACOS_PILOT_01,
  "native-ios": Object.freeze({
    capabilityId: "native-ios",
    pilotId: "native-ios-pilot-01",
    surfaceCategory: "native-gallery-iphone",
    evidenceDisposition: "retained",
    ownerVerdict: "Pending owner-visible acceptance.",
    ownerDisposition: "pending-owner-review",
    profilePolicyDigest: "sha256:f072e353202c4f39911f7f8b6a11961d475b20477482a21edbeb4ca151390f0b",
    sourceEvidencePin: "knowledge/native-ios/pilot-01-source-evidence.json#sha256:bcf7af83f0cd778d7470ca84dfb0c58e8e4067a6578dff1f63003bb9a9656ec9",
  }),
  "native-ipados": Object.freeze({
    capabilityId: "native-ipados",
    pilotId: "native-ipados-pilot-01",
    surfaceCategory: "native-gallery-ipad-windowed",
    evidenceDisposition: "retained",
    ownerVerdict: "Pending owner-visible acceptance.",
    ownerDisposition: "pending-owner-review",
    profilePolicyDigest: "sha256:7e3dd66852e1dd9afb4d279cd34385e7b17c57b8cf26bcc293a59b68713ab6ee",
    sourceEvidencePin: "knowledge/native-ipados/pilot-01-source-evidence.json#sha256:2f5daf4b0bb389ad3302597908ab2abc100b9aec394a030d5bd5b7f3eb7c6b71",
  }),
});

/** Known retained pilots are identity contracts, not delivery qualifications. */
export function expectedCapabilityPilotReceipt(capabilityId: string): CapabilityPilotReceiptExpectation | null {
  return CAPABILITY_PILOT_RECEIPTS[capabilityId] ?? null;
}

export interface CapabilityPilotReceiptPin { path: string; digest: string }

export type CapabilityPilotReceiptCheck =
  | { ok: true; receipt: CapabilityPilotReceipt }
  | { ok: false; code: string; message: string };

const RECEIPT_KEYS = [
  "kind", "version", "capabilityId", "pilotId", "surfaceCategory", "evidenceDisposition", "ownerVerdict", "ownerDisposition",
] as const;
const STRING_FIELDS = RECEIPT_KEYS.filter((key) => key !== "kind" && key !== "version");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const failure = (code: string, message: string): { ok: false; code: string; message: string } => ({ ok: false, code, message });
const contained = (root: string, candidate: string): boolean => candidate.startsWith(`${root}${sep}`);

/** Parse a repository-relative `knowledge/...#sha256:<hex>` evidence pin. */
export function parseCapabilityPilotReceiptPin(value: unknown):
  | { ok: true; pin: CapabilityPilotReceiptPin }
  | { ok: false; code: "PILOT_RECEIPT_PATH"; message: string } {
  if (typeof value !== "string") return { ok: false, code: "PILOT_RECEIPT_PATH", message: "pilot receipt pin must be a string" };
  const [path, digest, extra] = value.split("#");
  const segments = path?.split("/") ?? [];
  if (extra !== undefined || path === undefined || digest === undefined || !path.endsWith(".json") ||
      isAbsolute(path) || path.includes("\\") || segments[0] !== "knowledge" || segments.length < 2 ||
      segments.some((segment) => segment === "" || segment === "." || segment === "..") ||
      !/^sha256:[a-f0-9]{64}$/.test(digest)) {
    return { ok: false, code: "PILOT_RECEIPT_PATH", message: "pilot receipt pin must stay under knowledge/ and include sha256 exact bytes" };
  }
  return { ok: true, pin: { path, digest } };
}

/** Validate an external receipt's exact v1 shape and the expected pilot identity. */
export function parseCapabilityPilotReceipt(
  value: unknown,
  expected: CapabilityPilotReceiptExpectation,
  seenPilotIds: ReadonlySet<string> = new Set(),
): CapabilityPilotReceiptCheck {
  if (!isRecord(value) || Object.keys(value).length !== RECEIPT_KEYS.length ||
      Object.keys(value).some((key) => !RECEIPT_KEYS.includes(key as typeof RECEIPT_KEYS[number])) ||
      STRING_FIELDS.some((key) => !nonEmpty(value[key]))) {
    return failure("PILOT_RECEIPT_SHAPE", "pilot receipt must contain exactly the typed v1 fields");
  }
  if (value["kind"] !== CAPABILITY_PILOT_RECEIPT_KIND) {
    return failure("PILOT_RECEIPT_KIND", "pilot receipt kind is not recognized");
  }
  if (value["version"] !== 1) return failure("PILOT_RECEIPT_VERSION", "pilot receipt version is not recognized");
  const receipt: CapabilityPilotReceipt = {
    kind: CAPABILITY_PILOT_RECEIPT_KIND,
    version: 1,
    capabilityId: String(value["capabilityId"]),
    pilotId: String(value["pilotId"]),
    surfaceCategory: String(value["surfaceCategory"]),
    evidenceDisposition: String(value["evidenceDisposition"]),
    ownerVerdict: String(value["ownerVerdict"]),
    ownerDisposition: String(value["ownerDisposition"]),
  };
  if (receipt.capabilityId !== expected.capabilityId) {
    return failure("PILOT_RECEIPT_CAPABILITY", `pilot receipt capability '${receipt.capabilityId}' is not expected`);
  }
  if (seenPilotIds.has(receipt.pilotId)) return failure("PILOT_RECEIPT_DUPLICATE", `duplicate pilot ID '${receipt.pilotId}'`);
  if (receipt.pilotId !== expected.pilotId || receipt.surfaceCategory !== expected.surfaceCategory ||
      receipt.evidenceDisposition !== expected.evidenceDisposition || receipt.ownerVerdict !== expected.ownerVerdict ||
      receipt.ownerDisposition !== expected.ownerDisposition) {
    return failure("PILOT_RECEIPT_IDENTITY", "pilot receipt identity or owner disposition differs from the expected record");
  }
  return { ok: true, receipt };
}

/** Resolve one pinned receipt below knowledge/ and verify its exact bytes before parsing it. */
export function verifyCapabilityPilotReceipt(
  knowledgeRoot: string,
  pinValue: unknown,
  expected: CapabilityPilotReceiptExpectation,
  seenPilotIds: ReadonlySet<string> = new Set(),
): CapabilityPilotReceiptCheck {
  const pinned = readPinnedEvidence(knowledgeRoot, pinValue);
  if (!pinned.ok) return pinned;
  let receipt: CapabilityPilotReceiptCheck;
  try {
    receipt = parseCapabilityPilotReceipt(JSON.parse(pinned.bytes.toString("utf8")) as unknown, expected, seenPilotIds);
  } catch {
    return failure("PILOT_RECEIPT_JSON", "pilot receipt is not valid JSON");
  }
  if (!receipt.ok || expected.sourceEvidencePin === undefined) return receipt;

  const source = readPinnedEvidence(knowledgeRoot, expected.sourceEvidencePin);
  if (!source.ok) return source;
  try {
    const value = JSON.parse(source.bytes.toString("utf8")) as unknown;
    if (!isRecord(value) || value["kind"] !== "design-os.capability-pilot-source-evidence" || value["version"] !== 1 ||
        value["capabilityId"] !== expected.capabilityId || value["pilotId"] !== expected.pilotId ||
        value["sourceRevision"] !== null || value["sourceRevisionState"] !== "no-git-head" ||
        !Array.isArray(value["knownFailures"]) || !value["knownFailures"].includes("unfiltered Xcode 26.5 accessibility audit") ||
        !Array.isArray(value["pendingWitnesses"]) || !value["pendingWitnesses"].includes("owner-visible-acceptance")) {
      return failure("PILOT_SOURCE_EVIDENCE_IDENTITY", "pilot source evidence does not preserve its platform identity and pending gates");
    }
  } catch {
    return failure("PILOT_SOURCE_EVIDENCE_JSON", "pilot source evidence is not valid JSON");
  }
  return receipt;
}

function readPinnedEvidence(
  knowledgeRoot: string,
  pinValue: unknown,
): { ok: true; bytes: Buffer } | { ok: false; code: string; message: string } {
  const parsedPin = parseCapabilityPilotReceiptPin(pinValue);
  if (!parsedPin.ok) return failure(parsedPin.code, parsedPin.message);
  let root: string;
  let candidate: string;
  try {
    root = realpathSync(knowledgeRoot);
    candidate = resolve(root, parsedPin.pin.path.slice("knowledge/".length));
    if (!contained(root, candidate) || !lstatSync(candidate).isFile() || lstatSync(candidate).isSymbolicLink()) {
      return failure("PILOT_RECEIPT_PATH", "pilot receipt path is not a contained regular file");
    }
    candidate = realpathSync(candidate);
    if (!contained(root, candidate)) return failure("PILOT_RECEIPT_PATH", "pilot receipt resolves outside knowledge/");
  } catch {
    return failure("PILOT_RECEIPT_PATH", "pilot receipt path cannot be resolved under knowledge/");
  }
  let bytes: Buffer;
  try { bytes = readFileSync(candidate); }
  catch { return failure("PILOT_RECEIPT_PATH", "pilot receipt bytes cannot be read"); }
  const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (digest !== parsedPin.pin.digest) return failure("PILOT_RECEIPT_DIGEST", "pilot receipt digest does not match exact stored bytes");
  return { ok: true, bytes };
}
