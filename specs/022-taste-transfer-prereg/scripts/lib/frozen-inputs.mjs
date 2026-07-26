// scripts/lib/frozen-inputs.mjs
//
// One loader for the frozen inputs every post-render check recomputes against:
// the two brief files, the arm-prompt template, the patch bytes, the candidate
// manifest, and the public commitment. Loading them once per check run keeps the
// recomputation cheap and — more importantly — guarantees PR-020, PR-027 and
// PR-031 all recompute against the SAME bytes.
import { briefHash, sha256Hex } from "./hash.mjs";
import { CANDIDATE_FAMILY } from "./constants.mjs";

/**
 * @returns {{
 *   ok: boolean, errors: string[],
 *   briefs: Map<string, {brief: object, phase: "A"|"B", hash: string}>,
 *   templateBytes: Buffer|null,
 *   candidates: Map<string, object>,
 *   commitment: object|null,
 *   commitmentSha256: string|null
 * }}
 */
export function loadFrozenInputs(ctx) {
  const errors = [];
  const briefs = new Map();

  for (const [phase, rel] of [["A", "phase-a-briefs.json"], ["B", "phase-b-briefs.json"]]) {
    const res = ctx.readJSON(rel);
    if (!res.ok) {
      errors.push(`cannot read ${rel}: ${res.error}`);
      continue;
    }
    for (const brief of res.data.briefs || []) {
      if (typeof brief?.brief_id !== "string") {
        errors.push(`${rel}: a brief has no brief_id`);
        continue;
      }
      if (briefs.has(brief.brief_id)) {
        errors.push(`${rel}: duplicate brief_id ${brief.brief_id}`);
        continue;
      }
      briefs.set(brief.brief_id, { brief, phase, hash: briefHash(brief) });
    }
  }

  const templateRes = ctx.readBytes("arm-prompt-template.md");
  if (!templateRes.ok) errors.push(`cannot read arm-prompt-template.md: ${templateRes.error}`);

  // The frozen media manifest — the sole authority for supplied-asset roles
  // (amendment item 1 / R1). Required to recompute the P7 projection for any
  // brief carrying supplied_assets.
  let mediaManifest = null;
  const mediaManifestRes = ctx.readJSON("assets/brief-media-manifest.json");
  if (!mediaManifestRes.ok) errors.push(`cannot read assets/brief-media-manifest.json: ${mediaManifestRes.error}`);
  else mediaManifest = mediaManifestRes.data;

  const candidates = new Map();
  const candidateRes = ctx.readJSON("candidate-manifest.json");
  if (!candidateRes.ok) errors.push(`cannot read candidate-manifest.json: ${candidateRes.error}`);
  else for (const c of candidateRes.data.candidates || []) {
    if (typeof c?.candidate_id === "string") candidates.set(c.candidate_id, c);
  }

  let commitment = null;
  let commitmentSha256 = null;
  const commitmentBytes = ctx.readBytes("randomization-commitment.json");
  if (commitmentBytes.ok) {
    commitmentSha256 = sha256Hex(commitmentBytes.data);
    try {
      commitment = JSON.parse(commitmentBytes.data.toString("utf8"));
    } catch (err) {
      errors.push(`randomization-commitment.json is not valid JSON: ${err.message}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    briefs,
    templateBytes: templateRes.ok ? templateRes.data : null,
    mediaManifest,
    candidates,
    commitment,
    commitmentSha256,
    upstreamCommit: candidateRes.ok ? candidateRes.data.upstream_commit : null,
  };
}

/** Patch bytes for a spec-relative patch path, or {ok:false}. */
export function loadPatchBytes(ctx, patchPath) {
  if (typeof patchPath !== "string" || patchPath.length === 0) return { ok: false, error: "no patch path" };
  return ctx.readBytes(patchPath);
}

/**
 * The source SHA-256 set a treatment arm's `source_hashes` must reproduce.
 *  - Phase B: exactly the candidate's own frozen `source_sha256`.
 *  - Phase A: the union across every candidate in the family (the family patch is a
 *    bundle of that family's candidates' contracts — PREREGISTRATION.md §Phase A).
 */
export function expectedTreatmentSourceHashes(frozen, phase, family, candidateId) {
  const out = new Set();
  if (phase === "B") {
    const c = frozen.candidates.get(candidateId);
    for (const h of c?.source_sha256 || []) out.add(h);
    return out;
  }
  for (const [id, c] of frozen.candidates) {
    if (CANDIDATE_FAMILY[id] !== family) continue;
    for (const h of c?.source_sha256 || []) out.add(h);
  }
  return out;
}

/** Every source hash of every candidate — a control arm must contain none of them. */
export function allCandidateSourceHashes(frozen) {
  const out = new Set();
  for (const c of frozen.candidates.values()) {
    for (const h of c?.source_sha256 || []) out.add(h);
  }
  return out;
}
