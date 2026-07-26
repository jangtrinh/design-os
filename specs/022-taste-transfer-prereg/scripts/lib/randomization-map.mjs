// scripts/lib/randomization-map.mjs
//
// One strict parser for the randomization map, shared by the Phase-A gate, the
// reveal checks, and the judging packager. The map is never schema'd as a committed
// file (only its SHA-256 is committed), so this module IS its schema: the frozen
// record shape from spec.md §"Secret-map record shape", enforced field by field.
//
// The map is read ONLY after its bytes hash-match the committed
// `secret_map_sha256`. An unverified map is never parsed into anything trusted.
import { sha256Hex } from "./hash.mjs";

export const PRESENTATION_ID_RE = /^PR-[0-9a-f]{8}$/;
export const CODENAME_RE = /^[0-9a-f]{8}$/;
export const PAIR_ID_RE = /^(PA-(AES|MOT|DEV|MED)-[1-4]|PB-(A[123]|M[123]|D[1-4]|P[12])-[1-3])$/;

export const EXPECTED_PHASE_A_PRESENTATIONS = 20;
export const EXPECTED_PHASE_B_PRESENTATIONS = 36;
export const EXPECTED_TOTAL_PRESENTATIONS = EXPECTED_PHASE_A_PRESENTATIONS + EXPECTED_PHASE_B_PRESENTATIONS;

/**
 * Parse + strictly validate randomization-map bytes against the committed
 * commitment.
 *
 * @param {Buffer} bytes      exact map bytes as they exist on disk
 * @param {object} commitment parsed randomization-commitment.json
 * @returns {{ok: boolean, errors: string[], presentations: object[]}}
 */
export function parseRandomizationMap(bytes, commitment) {
  const errors = [];
  const actualHash = sha256Hex(bytes);
  if (!commitment || typeof commitment.secret_map_sha256 !== "string") {
    return { ok: false, errors: ["commitment is missing secret_map_sha256 — cannot verify the map"], presentations: [] };
  }
  if (actualHash !== commitment.secret_map_sha256) {
    return {
      ok: false,
      errors: [`map sha256 ${actualHash} does not match the committed secret_map_sha256 ${commitment.secret_map_sha256}`],
      presentations: [],
    };
  }

  let map;
  try {
    map = JSON.parse(bytes.toString("utf8"));
  } catch (err) {
    return { ok: false, errors: [`map is not valid JSON: ${err.message}`], presentations: [] };
  }
  const presentations = Array.isArray(map?.presentations) ? map.presentations : null;
  if (presentations === null) {
    return { ok: false, errors: ["map has no presentations array"], presentations: [] };
  }

  const expectedA = commitment.phase_a_presentations ?? EXPECTED_PHASE_A_PRESENTATIONS;
  const expectedB = commitment.phase_b_presentations ?? EXPECTED_PHASE_B_PRESENTATIONS;
  const expectedTotal = expectedA + expectedB;
  if (presentations.length !== expectedTotal) {
    errors.push(`map has ${presentations.length} presentations, expected ${expectedTotal}`);
  }

  const seenIds = new Set();
  const seenCodes = new Set();
  const seenOrders = new Set();
  let countA = 0;
  let countB = 0;

  presentations.forEach((p, i) => {
    const at = `presentation[${i}]`;
    if (p === null || typeof p !== "object" || Array.isArray(p)) {
      errors.push(`${at} is not an object`);
      return;
    }
    if (!PRESENTATION_ID_RE.test(String(p.presentation_id))) errors.push(`${at}: presentation_id ${JSON.stringify(p.presentation_id)} does not match ^PR-[0-9a-f]{8}$`);
    else if (seenIds.has(p.presentation_id)) errors.push(`${at}: duplicate presentation_id ${p.presentation_id}`);
    else seenIds.add(p.presentation_id);

    if (!PAIR_ID_RE.test(String(p.pair_id))) errors.push(`${at}: pair_id ${JSON.stringify(p.pair_id)} is not a frozen pair id`);
    if (p.phase !== "A" && p.phase !== "B") errors.push(`${at}: phase ${JSON.stringify(p.phase)} is not "A" or "B"`);
    else if (p.phase === "A") countA++;
    else countB++;

    if (typeof p.brief_id !== "string" || !PAIR_ID_RE.test(p.brief_id)) errors.push(`${at}: brief_id ${JSON.stringify(p.brief_id)} is not a frozen brief id`);
    else if (p.brief_id !== p.pair_id) errors.push(`${at}: brief_id ${p.brief_id} does not equal pair_id ${p.pair_id}`);

    for (const side of ["left_code", "right_code"]) {
      const code = p[side];
      if (!CODENAME_RE.test(String(code))) errors.push(`${at}: ${side} ${JSON.stringify(code)} is not an 8-hex codename`);
      else if (seenCodes.has(code)) errors.push(`${at}: codename ${code} is reused (codenames must be globally unique)`);
      else seenCodes.add(code);
    }
    if (p.left_code === p.right_code) errors.push(`${at}: left_code and right_code are identical`);

    if (p.left_arm !== "control" && p.left_arm !== "treatment") errors.push(`${at}: left_arm ${JSON.stringify(p.left_arm)} is not control|treatment`);
    if (typeof p.is_duplicate !== "boolean") errors.push(`${at}: is_duplicate is not a boolean`);
    if (typeof p.endpoint_primary !== "boolean") errors.push(`${at}: endpoint_primary is not a boolean`);

    const order = p.presentation_order;
    if (!Number.isInteger(order) || order < 1 || order > expectedTotal) {
      errors.push(`${at}: presentation_order ${JSON.stringify(order)} is not an integer in 1..${expectedTotal}`);
    } else if (seenOrders.has(order)) {
      errors.push(`${at}: duplicate presentation_order ${order}`);
    } else {
      seenOrders.add(order);
    }
  });

  if (countA !== expectedA) errors.push(`map has ${countA} Phase-A presentations, expected ${expectedA}`);
  if (countB !== expectedB) errors.push(`map has ${countB} Phase-B presentations, expected ${expectedB}`);

  // Exactly one endpoint_primary per pair, and duplicated pairs carry exactly two
  // presentations both flagged is_duplicate (spec.md §"Duplicate-self-consistency").
  const byPair = new Map();
  for (const p of presentations) {
    if (typeof p?.pair_id !== "string") continue;
    const arr = byPair.get(p.pair_id) || [];
    arr.push(p);
    byPair.set(p.pair_id, arr);
  }
  for (const [pairId, arr] of byPair) {
    const primaries = arr.filter((p) => p.endpoint_primary === true);
    if (primaries.length !== 1) errors.push(`pair ${pairId}: expected exactly one endpoint_primary presentation, found ${primaries.length}`);
    if (arr.length > 2) errors.push(`pair ${pairId}: ${arr.length} presentations — at most two are permitted`);
    const dupFlags = new Set(arr.map((p) => p.is_duplicate === true));
    if (arr.length === 2 && (dupFlags.size !== 1 || !dupFlags.has(true))) {
      errors.push(`pair ${pairId}: two presentations exist but is_duplicate is not true on both`);
    }
    if (arr.length === 1 && arr[0].is_duplicate === true) {
      errors.push(`pair ${pairId}: is_duplicate is true but only one presentation exists`);
    }
  }

  return { ok: errors.length === 0, errors, presentations };
}

/** The right-hand arm implied by a presentation's `left_arm`. */
export function rightArm(presentation) {
  return presentation.left_arm === "control" ? "treatment" : "control";
}

/** Resolve a forced left|right preference into the arm it actually names. */
export function resolveWinnerArm(presentation, forcedPreference) {
  if (forcedPreference === "left") return presentation.left_arm;
  if (forcedPreference === "right") return rightArm(presentation);
  return null;
}

/** codename -> arm, for one presentation. */
export function codenameToArm(presentation) {
  return new Map([
    [presentation.left_code, presentation.left_arm],
    [presentation.right_code, rightArm(presentation)],
  ]);
}
