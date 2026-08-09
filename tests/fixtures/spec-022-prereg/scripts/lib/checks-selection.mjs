// scripts/lib/checks-selection.mjs
//
// PR-003..PR-006 — selection-manifest count/enumeration/hash/no-substitution
// checks (architecture §H). Split out of checks-freeze.mjs per Article IX /
// BUILD-CONTRACT follow-up: pure move, no behaviour change.
import { finding } from "./findings.mjs";
import { sha256Hex, HASH_RE } from "./hash.mjs";
import { catFileBlob, lsTreeSkillPaths } from "./git.mjs";
import { PINNED_COMMIT } from "./constants.mjs";

// PR-003 selection-count — records.length === record_count === 121; paths unique
// and bytewise-sorted.
export function prSelectionCount(ctx) {
  const findings = [];
  const res = ctx.readJSON("selection-manifest.json");
  if (!res.ok) {
    findings.push(finding("PR-003", "error", `cannot read selection-manifest.json: ${res.error}`));
    return findings;
  }
  const { record_count, records } = res.data;
  if (!Array.isArray(records)) {
    findings.push(finding("PR-003", "error", "selection-manifest.json: records is not an array"));
    return findings;
  }
  if (records.length !== 121) findings.push(finding("PR-003", "error", `records.length is ${records.length}, expected 121`));
  if (record_count !== 121) findings.push(finding("PR-003", "error", `record_count is ${record_count}, expected 121`));
  if (records.length !== record_count) {
    findings.push(finding("PR-003", "error", `records.length (${records.length}) !== record_count (${record_count})`));
  }
  const paths = records.map((r) => r.path).filter((p) => typeof p === "string");
  if (new Set(paths).size !== paths.length) findings.push(finding("PR-003", "error", "duplicate paths present in records"));
  const sorted = [...paths].sort();
  for (let i = 0; i < paths.length; i++) {
    if (paths[i] !== sorted[i]) {
      findings.push(finding("PR-003", "error", "records are not bytewise-sorted by path"));
      break;
    }
  }
  return findings;
}

// PR-004 selection-enumeration — with --corpus: re-enumerate from the pinned commit
// object and assert set equality with manifest ∪ failures. Without --corpus this
// degrades to an explicit warning (never a silent pass).
export function prSelectionEnumeration(ctx) {
  const findings = [];
  if (!ctx.corpus) {
    findings.push(finding("PR-004", "warning", "enumeration not re-verified (no --corpus given)"));
    return findings;
  }
  const manifestRes = ctx.readJSON("selection-manifest.json");
  const failuresRes = ctx.readJSON("selection-failures.json");
  if (!manifestRes.ok || !failuresRes.ok) {
    findings.push(finding("PR-004", "error", "cannot re-verify enumeration: selection-manifest.json or selection-failures.json unreadable"));
    return findings;
  }
  let enumerated;
  try {
    enumerated = lsTreeSkillPaths(ctx.corpus, PINNED_COMMIT);
  } catch (err) {
    findings.push(finding("PR-004", "error", `git ls-tree failed against --corpus: ${err.message}`));
    return findings;
  }
  if (enumerated.length !== 121) findings.push(finding("PR-004", "error", `re-enumeration returned ${enumerated.length} paths, expected 121`));
  const manifestPaths = new Set((manifestRes.data.records || []).map((r) => r.path));
  const failurePaths = new Set((failuresRes.data.failures || []).map((f) => f.path));
  const union = new Set([...manifestPaths, ...failurePaths]);
  const enumeratedSet = new Set(enumerated);
  for (const p of enumerated) if (!union.has(p)) findings.push(finding("PR-004", "error", `enumerated path missing from manifest+failures: ${p}`, p));
  for (const p of union) if (!enumeratedSet.has(p)) findings.push(finding("PR-004", "error", `manifest/failures path not in re-enumeration: ${p}`, p));
  return findings;
}

// PR-005 hashes-wellformed — every hash field matches ^[0-9a-f]{64}$; with
// --corpus, recompute all 121 source hashes + 12 candidate source hashes.
export function prHashesWellformed(ctx) {
  const findings = [];
  const manifestRes = ctx.readJSON("selection-manifest.json");
  const candidateRes = ctx.readJSON("candidate-manifest.json");

  if (manifestRes.ok) {
    for (const r of manifestRes.data.records || []) {
      if (typeof r.sha256 !== "string" || !HASH_RE.test(r.sha256)) {
        findings.push(finding("PR-005", "error", `malformed sha256 for ${r.path}`, r.path));
      }
    }
  }
  if (candidateRes.ok) {
    for (const c of candidateRes.data.candidates || []) {
      for (const h of c.source_sha256 || []) {
        if (!HASH_RE.test(h)) findings.push(finding("PR-005", "error", `malformed source hash for candidate ${c.candidate_id}`, c.candidate_id));
      }
      if (c.patch_sha256 && !HASH_RE.test(c.patch_sha256)) {
        findings.push(finding("PR-005", "error", `malformed patch_sha256 for candidate ${c.candidate_id}`, c.candidate_id));
      }
    }
  }

  if (!ctx.corpus) {
    findings.push(finding("PR-005", "warning", "source hashes not re-verified against corpus (no --corpus given)"));
    return findings;
  }

  if (manifestRes.ok) {
    for (const r of manifestRes.data.records || []) {
      try {
        const actual = sha256Hex(catFileBlob(ctx.corpus, PINNED_COMMIT, r.path));
        if (actual !== r.sha256) findings.push(finding("PR-005", "error", `hash mismatch for ${r.path}: manifest=${r.sha256} actual=${actual}`, r.path));
      } catch (err) {
        findings.push(finding("PR-005", "error", `cannot recompute hash for ${r.path}: ${err.message}`, r.path));
      }
    }
  }
  if (candidateRes.ok) {
    for (const c of candidateRes.data.candidates || []) {
      (c.source_paths || []).forEach((p, i) => {
        const expected = (c.source_sha256 || [])[i];
        try {
          const actual = sha256Hex(catFileBlob(ctx.corpus, PINNED_COMMIT, p));
          if (actual !== expected) {
            findings.push(finding("PR-005", "error", `candidate ${c.candidate_id} source hash mismatch for ${p}`, p));
          }
        } catch (err) {
          findings.push(finding("PR-005", "error", `candidate ${c.candidate_id}: cannot recompute hash for ${p}: ${err.message}`, p));
        }
      });
    }
  }
  return findings;
}

// PR-006 failures-no-substitution — no selection-failure path appears in
// candidate-manifest source_paths or as disposition:selected.
export function prFailuresNoSubstitution(ctx) {
  const findings = [];
  const failuresRes = ctx.readJSON("selection-failures.json");
  const candidateRes = ctx.readJSON("candidate-manifest.json");
  const manifestRes = ctx.readJSON("selection-manifest.json");
  if (!failuresRes.ok) return findings; // reported by PR-001/PR-002
  const failurePaths = new Set((failuresRes.data.failures || []).map((f) => f.path));
  if (failurePaths.size === 0) return findings;
  if (candidateRes.ok) {
    for (const c of candidateRes.data.candidates || []) {
      for (const p of c.source_paths || []) {
        if (failurePaths.has(p)) findings.push(finding("PR-006", "error", `failed source ${p} used as candidate ${c.candidate_id} source`, p));
      }
    }
  }
  if (manifestRes.ok) {
    for (const r of manifestRes.data.records || []) {
      if (failurePaths.has(r.path) && r.disposition === "selected") {
        findings.push(finding("PR-006", "error", `failed source ${r.path} marked disposition:selected`, r.path));
      }
    }
  }
  return findings;
}
