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
  capabilityId: string;
  pilotId: string;
  surfaceCategory: string;
  evidenceDisposition: string;
  ownerVerdict: string;
  ownerDisposition: string;
}

const NATIVE_MACOS_PILOT_01: CapabilityPilotReceiptExpectation = {
  capabilityId: "native-macos",
  pilotId: "native-macos-pilot-01",
  surfaceCategory: "note-document-editor",
  evidenceDisposition: "retained",
  ownerVerdict: "OK khá ổn rồi.",
  ownerDisposition: "accept-with-reservation",
};

/** Known retained pilots are identity contracts, not delivery qualifications. */
export function expectedCapabilityPilotReceipt(capabilityId: string): CapabilityPilotReceiptExpectation | null {
  return capabilityId === "native-macos" ? NATIVE_MACOS_PILOT_01 : null;
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
const failure = (code: string, message: string): CapabilityPilotReceiptCheck => ({ ok: false, code, message });
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
  try {
    return parseCapabilityPilotReceipt(JSON.parse(bytes.toString("utf8")) as unknown, expected, seenPilotIds);
  } catch {
    return failure("PILOT_RECEIPT_JSON", "pilot receipt is not valid JSON");
  }
}
