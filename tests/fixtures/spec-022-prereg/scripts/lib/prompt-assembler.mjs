// scripts/lib/prompt-assembler.mjs
//
// The ONE canonical arm-prompt assembler for spec 022.
//
// Both the (future) generation tooling and the validator's PR-020 recomputation
// import this module. There is exactly one implementation of the P7 arm-visible
// projection and of the D5 byte-concatenation rule in this pilot, and it is here.
// Any second implementation would let a raw brief — carrying `candidate_id` and,
// on a probe brief, the leak definition itself — reach an arm while still passing
// the gate. That was Codex Stage-5 BLOCKER #1.
//
// Assembly (arm-prompt-template.md §"Assembly rule", spec.md §P7), byte-exact:
//
//   prompt = template bytes
//          + JSON.stringify(projection(brief)) bytes
//          + [treatment only] exactly one patch file's bytes
//
// Control arms receive NO patch bytes. No other ingredient may enter, and no
// normalization is applied anywhere — `prompt_hash` is SHA-256 over those bytes.
import { sha256Hex } from "./hash.mjs";
import { CANDIDATE_FAMILY } from "./constants.mjs";
import { boundaryTokenRegex } from "./identity-tokens.mjs";

// P7 removal lists. Frozen in spec.md and transcribed in arm-prompt-template.md;
// the two documents and this constant must stay in sync.
export const PHASE_A_REMOVED_KEYS = Object.freeze([
  "brief_id",
  "candidate_id",
  "family",
  "ordinal",
  "role",
  "is_duplicate_source",
  "anti_context_condition",
]);

export const PHASE_B_REMOVED_KEYS = Object.freeze(["brief_id", "candidate_id", "family", "ordinal"]);

export const PHASE_B_REMOVED_ANTI_CONTEXT_KEYS = Object.freeze(["leak_definition", "deterministic_leak_checks"]);

// Retained deliberately in Phase B: the arm must build the embedded state and know
// it stays plain. Both arms receive these identically (spec.md §P7).
export const PHASE_B_RETAINED_ANTI_CONTEXT_KEYS = Object.freeze(["embedded_state", "inactive_requirement"]);

// -------------------------------------------------------------------------
// Amendment item 1 (Fable Stage-6 B4/B5) — neutral role-indexed supplied-asset
// naming, role read from the FROZEN MEDIA MANIFEST, never inferred from
// substrings of the committed id.
//
// Removing the identity KEYS was not enough. `supplied_assets[].asset_id` and
// `.manifest_ref` survived a first-pass projection carrying values like
// "PA-MED-1-wide-1" and "PB-P2-1-headshot-1", from which an arm reconstructs its
// own brief_id, family and candidate — exactly what P7 exists to hide. Nine
// media briefs leaked this way. A second defect in that first pass inferred the
// asset's role from a regex over the id's own suffix — itself an identity
// signal the arm should never see derived from — instead of the manifest's
// authoritative `role` field.
//
// The fix: every `supplied_assets[]` entry becomes exactly
// `{ "asset_ref": "asset-<role>-<n>", "role": "<role>" }` — `<role>` read from
// the frozen `assets/brief-media-manifest.json` record for that asset_id,
// `<n>` the 1-based index within its role group in the brief's own committed
// order, `manifest_ref` dropped entirely, no other key survives. The rename is
// a pure function of the brief plus the frozen manifest and is applied
// identically to both arms, so it can never itself create an arm differential.
// -------------------------------------------------------------------------

/** Map<asset_id, role>, built from the frozen `assets/brief-media-manifest.json` object. */
export function assetRoleMap(manifestObject) {
  const map = new Map();
  for (const a of manifestObject?.assets || []) {
    if (typeof a?.asset_id === "string" && typeof a?.role === "string") map.set(a.asset_id, a.role);
  }
  return map;
}

/** { assetIds: string[], assetPaths: string[] } — the full frozen media identity universe. */
export function mediaIdentitySets(manifestObject) {
  const assetIds = [];
  const assetPaths = [];
  for (const a of manifestObject?.assets || []) {
    if (typeof a?.asset_id === "string") assetIds.push(a.asset_id);
    if (typeof a?.path === "string") assetPaths.push(a.path);
  }
  return { assetIds, assetPaths };
}

/**
 * committed asset_id -> neutral "asset-<role>-<n>" alias, for one brief.
 * `<n>` is 1-based, per role, in the brief's own committed `supplied_assets`
 * order — stable and derived only from committed bytes. Both the prompt
 * assembler and the judging packager (build-judging-bundle.mjs) resolve
 * neutral names through THIS map, so there is exactly one naming rule in the
 * pilot; a second implementation would reintroduce the leak in the bundle.
 *
 * Fails closed: throws if a supplied `asset_id` is absent from `assetRoles`
 * (the frozen manifest) — never emit an alias for an unknown asset.
 */
export function assetIdToNeutral(brief, assetRoles) {
  const map = new Map();
  const counters = new Map();
  for (const supplied of brief?.supplied_assets || []) {
    const id = supplied?.asset_id;
    if (typeof id !== "string") throw new Error("assetIdToNeutral: a supplied_assets entry has no string asset_id");
    if (map.has(id)) continue;
    const role = assetRoles instanceof Map ? assetRoles.get(id) : undefined;
    if (role === undefined) {
      throw new Error(`assetIdToNeutral: asset_id ${JSON.stringify(id)} is not in the frozen media manifest — refusing to project an unknown asset`);
    }
    const next = (counters.get(role) || 0) + 1;
    counters.set(role, next);
    map.set(id, `asset-${role}-${next}`);
  }
  return map;
}

function projectSuppliedAssets(brief, assetRoles) {
  const idToNeutral = assetIdToNeutral(brief, assetRoles);
  return (brief.supplied_assets || []).map((supplied) => {
    const id = supplied?.asset_id;
    const asset_ref = typeof id === "string" ? idToNeutral.get(id) : undefined;
    const role = assetRoles instanceof Map ? assetRoles.get(id) : undefined;
    if (asset_ref === undefined || role === undefined) {
      throw new Error(`projectBrief: supplied_assets entry ${JSON.stringify(supplied)} cannot be neutrally projected`);
    }
    // Exactly these two keys survive — manifest_ref is dropped entirely, and no
    // other key from the committed entry (there is none today, but this is a
    // structural guarantee, not an accident of the current schema).
    return { asset_ref, role };
  });
}

/**
 * The arm-visible projection of a committed brief object.
 *
 * `assetRoles` (a `Map<asset_id, role>` from `assetRoleMap()`) is REQUIRED
 * whenever the brief carries a non-empty `supplied_assets[]`.
 *
 * Retained keys keep their committed insertion order (JSON.parse preserves source
 * order, and this rebuild only skips keys — it never reorders or re-adds), so
 * `JSON.stringify` over the result is byte-deterministic.
 */
export function projectBrief(brief, phase, { assetRoles } = {}) {
  if (brief === null || typeof brief !== "object" || Array.isArray(brief)) {
    throw new Error("projectBrief: brief must be a plain object");
  }
  if (phase !== "A" && phase !== "B") throw new Error(`projectBrief: unknown phase ${JSON.stringify(phase)}`);

  const removed = phase === "A" ? PHASE_A_REMOVED_KEYS : PHASE_B_REMOVED_KEYS;
  const out = {};
  for (const key of Object.keys(brief)) {
    if (removed.includes(key)) continue;
    const value = brief[key];
    if (key === "supplied_assets" && Array.isArray(value)) {
      if (value.length > 0 && !(assetRoles instanceof Map)) {
        throw new Error("projectBrief: assetRoles map is required to project a non-empty supplied_assets list");
      }
      out[key] = projectSuppliedAssets(brief, assetRoles || new Map());
      continue;
    }
    if (phase === "B" && key === "anti_context" && value !== null && typeof value === "object" && !Array.isArray(value)) {
      const anti = {};
      for (const antiKey of Object.keys(value)) {
        if (PHASE_B_REMOVED_ANTI_CONTEXT_KEYS.includes(antiKey)) continue;
        anti[antiKey] = value[antiKey];
      }
      out[key] = anti;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Compact, no pretty-printing, no key sorting — the committed key order survives. */
export function serializeProjection(projection) {
  return Buffer.from(JSON.stringify(projection), "utf8");
}

/**
 * Structural leak audit of a projection. Returns an array of human-readable strings
 * (empty === clean). This is the assembler auditing itself: it proves the removal
 * list actually removed, rather than trusting that it did.
 */
export function projectionLeaks(projection, phase) {
  const leaks = [];
  const removed = phase === "A" ? PHASE_A_REMOVED_KEYS : PHASE_B_REMOVED_KEYS;
  for (const key of removed) {
    if (Object.prototype.hasOwnProperty.call(projection, key)) leaks.push(`projection retains identity key "${key}"`);
  }
  if (phase === "B") {
    const anti = projection.anti_context;
    if (anti !== null && typeof anti === "object" && !Array.isArray(anti)) {
      for (const key of PHASE_B_REMOVED_ANTI_CONTEXT_KEYS) {
        if (Object.prototype.hasOwnProperty.call(anti, key)) leaks.push(`projection retains probe key "anti_context.${key}"`);
      }
      for (const key of PHASE_B_RETAINED_ANTI_CONTEXT_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(anti, key)) leaks.push(`projection dropped required key "anti_context.${key}"`);
      }
    }
  }
  if (Array.isArray(projection.supplied_assets)) {
    for (const entry of projection.supplied_assets) {
      if (entry === null || typeof entry !== "object") {
        leaks.push("projection's supplied_assets entry is not an object");
        continue;
      }
      const keys = Object.keys(entry);
      if (keys.length !== 2 || !keys.includes("asset_ref") || !keys.includes("role")) {
        leaks.push(`projection's supplied_assets entry does not have exactly {asset_ref, role}: ${JSON.stringify(keys)}`);
      }
      if (typeof entry.asset_ref !== "string" || !/^asset-[a-z-]+-\d+$/.test(entry.asset_ref)) {
        leaks.push(`projection's supplied_assets entry has a malformed asset_ref: ${JSON.stringify(entry.asset_ref)}`);
      }
    }
  }
  return leaks;
}

/**
 * Substring/boundary audit of the fully assembled prompt against every value
 * P7 exists to hide (amendment item 1 / Fable B4, B5).
 *
 *  - `brief_id` — boundary-matched standalone token (a bare substring search
 *    would false-positive if one brief_id were ever a prefix of another).
 *  - every one of the pilot's frozen `asset_id`s (all 30, not just this
 *    brief's own supplied assets — a leak via any route, including this
 *    template's own prose, must be caught) — boundary-matched.
 *  - every one of the pilot's frozen manifest `path`s — plain substring (it
 *    contains "/" and is unambiguous; boundary semantics would only weaken it).
 *  - the literal `manifest_ref` prefix `assets/brief-media-manifest.json#` —
 *    defends a mutated assembler that leaves a raw manifest_ref in place
 *    instead of dropping it, as R1 requires.
 *  - the existing probe-prose checks (contradiction condition / anti-context
 *    leak definition and its deterministic checks) — unchanged.
 */
export function promptTextLeaks(promptBytes, brief, phase, { assetIds = [], assetPaths = [] } = {}) {
  const leaks = [];
  const text = promptBytes.toString("utf8");

  if (typeof brief.brief_id === "string" && brief.brief_id.length > 0 && boundaryTokenRegex(brief.brief_id).test(text)) {
    leaks.push("assembled prompt contains the brief_id");
  }

  for (const id of assetIds) {
    if (typeof id === "string" && id.length > 0 && boundaryTokenRegex(id).test(text)) {
      leaks.push(`assembled prompt contains the committed asset id "${id}" — supplied assets must be neutrally renamed`);
    }
  }
  for (const path of assetPaths) {
    if (typeof path === "string" && path.length > 0 && text.includes(path)) {
      leaks.push(`assembled prompt contains the committed media path "${path}"`);
    }
  }
  if (text.includes("assets/brief-media-manifest.json#")) {
    leaks.push('assembled prompt contains a raw manifest_ref ("assets/brief-media-manifest.json#...")');
  }

  const probe = (label, value) => {
    if (typeof value !== "string" || value.trim().length < 8) return;
    if (text.includes(value)) leaks.push(`assembled prompt contains ${label}`);
  };
  if (phase === "A") probe("the contradiction probe (anti_context_condition)", brief.anti_context_condition);
  if (phase === "B") {
    probe("the anti-context leak_definition", brief.anti_context?.leak_definition);
    for (const check of brief.anti_context?.deterministic_leak_checks || []) {
      if (typeof check === "string") probe("a deterministic_leak_check", check);
      else if (check && typeof check === "object") {
        for (const v of Object.values(check)) probe("a deterministic_leak_check field", v);
      }
    }
  }
  return leaks;
}

/**
 * The frozen patch a treatment arm receives, spec-relative. Control arms get null.
 *  - Phase A: the family patch for the brief's family.
 *  - Phase B: the candidate patch for the brief's candidate.
 */
export function expectedPatchPath(brief, phase, arm) {
  if (arm === "control") return null;
  if (arm !== "treatment") throw new Error(`expectedPatchPath: unknown arm ${JSON.stringify(arm)}`);
  if (phase === "A") {
    if (!brief.family) return null;
    return `patches/phase-a/${brief.family}.md`;
  }
  if (phase === "B") {
    if (!brief.candidate_id) return null;
    return `patches/phase-b/${brief.candidate_id}.md`;
  }
  throw new Error(`expectedPatchPath: unknown phase ${JSON.stringify(phase)}`);
}

/** The family a Phase-B candidate belongs to, from the frozen constant table. */
export function familyOfCandidate(candidateId) {
  return CANDIDATE_FAMILY[candidateId] || null;
}

/**
 * Assemble the exact per-arm prompt bytes.
 *
 * @param {Buffer} templateBytes committed bytes of arm-prompt-template.md
 * @param {object} brief         the committed brief object (raw — projected here)
 * @param {"A"|"B"} phase
 * @param {"control"|"treatment"} arm
 * @param {Buffer|null} patchBytes committed patch bytes; MUST be null for control
 * @param {object} mediaManifest the frozen `assets/brief-media-manifest.json` object
 * @returns {{bytes: Buffer, hash: string, projection: object, leaks: string[]}}
 */
export function assembleArmPrompt({ templateBytes, brief, phase, arm, patchBytes, mediaManifest }) {
  if (!Buffer.isBuffer(templateBytes)) throw new Error("assembleArmPrompt: templateBytes must be a Buffer");
  if (arm === "control" && patchBytes !== null && patchBytes !== undefined) {
    throw new Error("assembleArmPrompt: a control arm never receives patch bytes");
  }
  if (arm === "treatment" && !Buffer.isBuffer(patchBytes)) {
    throw new Error("assembleArmPrompt: a treatment arm requires exactly one patch file's bytes");
  }
  const assetRoles = assetRoleMap(mediaManifest);
  const projection = projectBrief(brief, phase, { assetRoles });
  const projectionBytes = serializeProjection(projection);
  const parts = [templateBytes, projectionBytes];
  if (arm === "treatment") parts.push(patchBytes);
  const bytes = Buffer.concat(parts);
  const { assetIds, assetPaths } = mediaIdentitySets(mediaManifest);
  const leaks = [...projectionLeaks(projection, phase), ...promptTextLeaks(bytes, brief, phase, { assetIds, assetPaths })];
  return { bytes, hash: sha256Hex(bytes), projection, leaks };
}
