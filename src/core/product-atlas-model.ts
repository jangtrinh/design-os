import {
  CANDIDATE_STATUSES,
  CAPTURES,
  DISPOSITIONS,
  FIELDS,
  RESOLUTIONS,
  asObject,
  ascii,
  badProductContext,
  canonicalDigest,
  isKnownValue,
  normalizeCounter,
  requireDigest,
  requireExactKeys,
  requireIdentifier,
} from "./product-context-value.js";
import { normalizeProductContextClaim, normalizeProductContextReceipt } from "./product-context-receipt-model.js";
import type { Obj } from "./product-context-value.js";

const ATLAS_KEYS = ["kind", "version", "productId", "inputSetDigest", "receipts", "fields", "coverage"];
const EMBEDDED_RECEIPT_KEYS = ["kind", "version", "receiptId", "productId", "sourceRef", "sourceDigest", "capturedAt", "captureDisposition", "omittedCount", "reasonCodes", "claims", "receiptDigest"];
const FIELD_KEYS = ["field", "resolution", "value", "candidates"];
const CANDIDATE_KEYS = ["receiptId", "claim", "status"];
const COVERAGE_KEYS = ["captureDispositions", "claimDispositions", "candidateStatuses", "resolutions", "omittedCount"];

function normalizeEmbeddedReceipt(value: unknown, productId: string): Obj & { receiptDigest: string } {
  const embedded = asObject(value);
  requireExactKeys(embedded, EMBEDDED_RECEIPT_KEYS);
  const receiptDigest = requireDigest(embedded.receiptDigest);
  const plain = { ...embedded };
  delete plain["receiptDigest"];
  const receipt = normalizeProductContextReceipt(plain);
  if (canonicalDigest(receipt) !== receiptDigest || receipt.productId !== productId) {
    badProductContext();
  }
  return { ...receipt, receiptDigest };
}

function receiptsAreSorted(receipts: Array<Obj & { receiptDigest: string }>): boolean {
  return receipts.some((receipt, index) => index > 0 && ascii(String(receipts[index - 1]?.receiptId), String(receipt.receiptId)) >= 0);
}

function candidatesAreSorted(candidates: unknown[]): boolean {
  return candidates.some((candidate, index) => {
    if (index === 0) return false;
    const previous = asObject(candidates[index - 1]);
    const current = asObject(candidate);
    const byReceipt = ascii(String(previous.receiptId), String(current.receiptId));
    return byReceipt > 0 || (byReceipt === 0 && ascii(String(asObject(previous.claim).claimId), String(asObject(current.claim).claimId)) > 0);
  });
}

function normalizeAtlasField(value: unknown, index: number): Obj {
  const field = asObject(value);
  requireExactKeys(field, FIELD_KEYS);
  const candidates = Array.isArray(field.candidates) ? field.candidates : badProductContext();
  if (field.field !== FIELDS[index] || !isKnownValue(field.resolution, RESOLUTIONS) || (field.resolution === "resolved" ? field.value === null : field.value !== null)) {
    badProductContext();
  }
  for (const candidate of candidates) {
    const item = asObject(candidate);
    requireExactKeys(item, CANDIDATE_KEYS);
    requireIdentifier(item.receiptId);
    if (!isKnownValue(item.status, CANDIDATE_STATUSES)) badProductContext();
    normalizeProductContextClaim(item.claim);
  }
  if (candidatesAreSorted(candidates)) badProductContext();
  return { ...field, candidates } as Obj;
}

export function normalizeProductAtlas(value: unknown): Obj {
  const atlas = asObject(value);
  requireExactKeys(atlas, ATLAS_KEYS);
  if (atlas.kind !== "product-atlas" || atlas.version !== 1 || !Array.isArray(atlas.receipts) || atlas.receipts.length < 1 || atlas.receipts.length > 1024 || !Array.isArray(atlas.fields) || atlas.fields.length !== FIELDS.length) {
    badProductContext();
  }
  const productId = requireIdentifier(atlas.productId);
  const inputSetDigest = requireDigest(atlas.inputSetDigest);
  const receipts = atlas.receipts.map((receipt) => normalizeEmbeddedReceipt(receipt, productId));
  if (receiptsAreSorted(receipts) || canonicalDigest(receipts.map((receipt) => ({ receiptId: receipt.receiptId, receiptDigest: receipt.receiptDigest }))) !== inputSetDigest) {
    badProductContext();
  }
  const fields = atlas.fields.map(normalizeAtlasField);
  const coverage = asObject(atlas.coverage);
  requireExactKeys(coverage, COVERAGE_KEYS);
  if (typeof coverage.omittedCount !== "number" || !Number.isSafeInteger(coverage.omittedCount) || coverage.omittedCount < 0) {
    badProductContext();
  }
  return {
    kind: "product-atlas",
    version: 1,
    productId,
    inputSetDigest,
    receipts,
    fields,
    coverage: {
      captureDispositions: normalizeCounter(coverage.captureDispositions, CAPTURES),
      claimDispositions: normalizeCounter(coverage.claimDispositions, DISPOSITIONS),
      candidateStatuses: normalizeCounter(coverage.candidateStatuses, CANDIDATE_STATUSES),
      resolutions: normalizeCounter(coverage.resolutions, RESOLUTIONS),
      omittedCount: coverage.omittedCount,
    },
  };
}
