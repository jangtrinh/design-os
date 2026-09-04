import { canonicalStringify } from "./ds-manifest.js";
import { normalizeProductContextReceipt } from "./product-context-receipt-model.js";
import { resolveProductContextFields, resolveProductContextSupersession } from "./product-context-resolution.js";
import {
  CANDIDATE_STATUSES,
  CAPTURES,
  DISPOSITIONS,
  RESOLUTIONS,
  ProductContextError,
  ascii,
  canonicalDigest,
  finalizeProductContextFindings,
  finding,
  incrementCount,
  zeroCounts,
} from "./product-context-value.js";
import type { Obj } from "./product-context-value.js";

export interface CompileResult {
  atlas: Obj;
  atlasBytes: Buffer;
  findings: Obj[];
  errorCount: number;
  warningCount: number;
}

function normalizeReceipts(input: unknown[]): Obj[] {
  if (input.length < 1 || input.length > 1024) throw new ProductContextError();
  const receipts = input.map(normalizeProductContextReceipt).sort((left, right) => ascii(String(left.receiptId), String(right.receiptId)));
  if (new Set(receipts.map((receipt) => receipt.receiptId)).size !== receipts.length) {
    throw new ProductContextError();
  }
  if (new Set(receipts.map((receipt) => receipt.productId)).size !== 1) {
    const error = new ProductContextError("product mismatch");
    error.name = "ProductIdMismatch";
    throw error;
  }
  return receipts;
}

function totalOmittedCount(receipts: Obj[]): number {
  let omittedCount = 0;
  for (const receipt of receipts) {
    const receiptOmissions = Number(receipt.omittedCount);
    if (receiptOmissions > Number.MAX_SAFE_INTEGER - omittedCount) {
      const error = new ProductContextError("omitted overflow");
      error.name = "OmittedOverflow";
      throw error;
    }
    omittedCount += receiptOmissions;
  }
  return omittedCount;
}

function createCoverage(omittedCount: number): Obj {
  return {
    captureDispositions: zeroCounts(CAPTURES),
    claimDispositions: zeroCounts(DISPOSITIONS),
    candidateStatuses: zeroCounts(CANDIDATE_STATUSES),
    resolutions: zeroCounts(RESOLUTIONS),
    omittedCount,
  };
}

function collectReceiptFindings(receipts: Obj[], coverage: Obj, findings: Obj[]): void {
  for (const receipt of receipts) {
    incrementCount(coverage.captureDispositions as Obj, String(receipt.captureDisposition));
    if (receipt.captureDisposition !== "captured") {
      findings.push(finding(`capture-${receipt.captureDisposition}`, "warning", `receipt ${receipt.receiptId}: ${receipt.captureDisposition}`));
    }
    for (const claim of receipt.claims as Obj[]) {
      incrementCount(coverage.claimDispositions as Obj, String(claim.disposition));
    }
  }
}

function embedReceipts(receipts: Obj[]): Array<Obj & { receiptDigest: string }> {
  return receipts.map((receipt) => ({ ...receipt, receiptDigest: canonicalDigest(receipt) }));
}

export function compileProductContext(input: unknown[]): CompileResult {
  const receipts = normalizeReceipts(input);
  const coverage = createCoverage(totalOmittedCount(receipts));
  const findings: Obj[] = [];
  collectReceiptFindings(receipts, coverage, findings);
  const superseded = resolveProductContextSupersession(receipts);
  const fields = resolveProductContextFields(receipts, superseded, coverage, findings);
  const embeddedReceipts = embedReceipts(receipts);
  const atlas: Obj = {
    kind: "product-atlas",
    version: 1,
    productId: receipts[0]?.productId as string,
    inputSetDigest: canonicalDigest(embeddedReceipts.map((receipt) => ({ receiptId: receipt.receiptId, receiptDigest: receipt.receiptDigest }))),
    receipts: embeddedReceipts,
    fields,
    coverage,
  };
  const atlasBytes = Buffer.from(canonicalStringify(atlas), "utf8");
  return { atlas, atlasBytes, ...finalizeProductContextFindings(findings) };
}
