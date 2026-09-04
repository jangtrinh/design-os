import { canonicalStringify } from "./ds-manifest.js";
import { FIELDS, ProductContextError, ascii, finding, incrementCount } from "./product-context-value.js";
import type { Json, Obj } from "./product-context-value.js";

interface ClaimReference {
  receipt: Obj;
  claim: Obj;
  key: string;
}

function productContextClaims(receipt: Obj): Obj[] {
  return receipt.claims as Obj[];
}

export function resolveProductContextSupersession(receipts: Obj[]): Set<string> {
  const index = new Map<string, ClaimReference>();
  for (const receipt of receipts) {
    for (const claim of productContextClaims(receipt)) {
      index.set(`${receipt.receiptId}#${claim.claimId}`, { receipt, claim, key: `${receipt.receiptId}#${claim.claimId}` });
    }
  }
  const superseded = new Set<string>();
  const edges = new Map<string, string[]>();
  for (const receipt of receipts) {
    for (const claim of productContextClaims(receipt)) {
      const key = `${receipt.receiptId}#${claim.claimId}`;
      const refs = claim.supersedes as string[];
      if (refs.length > 0 && !(claim.disposition === "present" && (receipt.captureDisposition === "captured" || receipt.captureDisposition === "capped"))) {
        throw new ProductContextError();
      }
      edges.set(key, refs);
      for (const ref of refs) {
        const target = index.get(ref);
        if (target === undefined || ref === key || target.receipt.sourceRef !== receipt.sourceRef || target.claim.field !== claim.field) {
          throw new ProductContextError();
        }
        superseded.add(ref);
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visiting.has(key)) throw new ProductContextError();
    if (visited.has(key)) return;
    visiting.add(key);
    for (const next of edges.get(key) ?? []) visit(next);
    visiting.delete(key);
    visited.add(key);
  };
  for (const key of edges.keys()) visit(key);
  return superseded;
}

function candidateMatches(candidate: Obj, reference: ClaimReference): boolean {
  return candidate.receiptId === reference.receipt.receiptId && (candidate.claim as Obj).claimId === reference.claim.claimId;
}

function activeClaims(current: ClaimReference[], superseded: Set<string>): ClaimReference[] {
  return current.filter(({ receipt, claim, key }) => !superseded.has(key) && claim.disposition === "present" && (receipt.captureDisposition === "captured" || receipt.captureDisposition === "capped"));
}

function addDispositionFindings(claims: ClaimReference[], findings: Obj[]): void {
  for (const { claim } of claims) {
    const disposition = String(claim.disposition);
    if (["missing", "partial", "not-evaluated"].includes(disposition)) {
      const checkId = claim.required ? `required-context-${disposition}` : "optional-context-gap";
      findings.push(finding(checkId, claim.required ? "error" : "warning", String(claim.reason)));
    } else if (["empty", "stale", "rejected", "malformed"].includes(disposition)) {
      findings.push(finding(`context-${disposition}`, "warning", String(claim.reason)));
    }
  }
}

export function resolveProductContextFields(receipts: Obj[], superseded: Set<string>, coverage: Obj, findings: Obj[]): Obj[] {
  return FIELDS.map((field) => {
    const candidates: Obj[] = [];
    const current: ClaimReference[] = [];
    for (const receipt of receipts) {
      for (const claim of productContextClaims(receipt)) {
        if (claim.field !== field) continue;
        const key = `${receipt.receiptId}#${claim.claimId}`;
        const reference = { receipt, claim, key };
        current.push(reference);
        candidates.push({ receiptId: String(receipt.receiptId), claim, status: superseded.has(key) ? "superseded" : "excluded" });
      }
    }
    const active = activeClaims(current, superseded);
    const unsuperseded = current.filter(({ key }) => !superseded.has(key));
    let resolution = "unresolved";
    let value: Json = null;
    if (active.length === 1) {
      resolution = "resolved";
      value = active[0]?.claim.value as Json;
      for (const candidate of candidates) if (candidateMatches(candidate, active[0]!)) candidate.status = "selected";
    } else if (active.length > 1) {
      const uniqueValues = new Set(active.map((reference) => canonicalStringify(reference.claim.value)));
      if (uniqueValues.size === 1) {
        resolution = "resolved";
        value = active[0]?.claim.value as Json;
        for (const candidate of candidates) if (active.some((reference) => candidateMatches(candidate, reference))) candidate.status = "coalesced";
      } else {
        resolution = "conflicting";
        findings.push(finding("atlas-conflict", "error", `conflicting ${field}`));
        for (const candidate of candidates) if (active.some((reference) => candidateMatches(candidate, reference))) candidate.status = "conflicted";
      }
    } else if (unsuperseded.length > 0 && unsuperseded.every((reference) => reference.claim.disposition === "missing")) {
      resolution = "missing";
    }
    if (current.length === 0) findings.push(finding("context-not-evaluated", "warning", `${field}: not evaluated`));
    addDispositionFindings(unsuperseded, findings);
    candidates.sort((left, right) => ascii(String(left.receiptId), String(right.receiptId)) || ascii(String((left.claim as Obj).claimId), String((right.claim as Obj).claimId)));
    for (const candidate of candidates) incrementCount(coverage.candidateStatuses as Obj, String(candidate.status));
    incrementCount(coverage.resolutions as Obj, resolution);
    return { field, resolution, value, candidates };
  });
}
