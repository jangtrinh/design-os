#!/usr/bin/env node
/**
 * make-randomization-map.mjs — spec 022 (architecture §J)
 *
 * Generates the ONE-TIME secret randomization map (presentation IDs, codenames,
 * left/right assignment, presentation order) before any rendering happens, and
 * writes the public commitment (hash + structural counts only) into the spec dir.
 *
 * HARD RULES — do not relax:
 *   - Refuses to run if the secret map file already exists. The map is generated
 *     EXACTLY ONCE and is NEVER regenerated (a lost/altered map fails every
 *     affected pair at reveal — that is by design, not a bug to work around).
 *   - Refuses to run if randomization-commitment.json already exists.
 *   - Writes NOTHING if either output already exists (no partial writes).
 *
 * BUILD-CONTRACT: this script is written in Stage 3 of spec 022 but MUST NOT be
 * executed in this build stage — running it would create the second-commit
 * artifact ahead of schedule and is explicitly out of scope.
 *
 * Usage: node make-randomization-map.mjs
 */
import { randomBytes, randomInt, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { ownerSecretMapPath } from "./lib/constants.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = resolve(__dirname, "..");
// R7 (amendment item 7) — single source of truth with PR-016's check: both
// import `ownerSecretMapPath` from constants.mjs rather than each hardcoding
// the segments, so the generator and the gate can never silently drift apart.
const SECRET_MAP_PATH = ownerSecretMapPath(homedir());
const COMMITMENT_PATH = join(SPEC_DIR, "randomization-commitment.json");

function hex8() {
  return randomBytes(4).toString("hex");
}

function readBriefs(fileName, expectedCount) {
  const data = JSON.parse(readFileSync(join(SPEC_DIR, fileName), "utf8"));
  if (!Array.isArray(data.briefs) || data.briefs.length !== expectedCount) {
    throw new Error(`${fileName}: expected exactly ${expectedCount} briefs, got ${data.briefs?.length}`);
  }
  return data.briefs;
}

// CSPRNG Fisher-Yates shuffle, assigning presentation_order = offset..offset+n-1.
function fisherYatesOrder(n, offset) {
  const order = Array.from({ length: n }, (_, i) => offset + i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function uniqueCodename(used) {
  let code;
  do {
    code = hex8();
  } while (used.has(code));
  used.add(code);
  return code;
}

function buildPresentation(pairId, phase, briefId, family, usedCodenames) {
  return {
    presentation_id: `PR-${hex8()}`,
    pair_id: pairId,
    phase,
    brief_id: briefId,
    family,
    left_code: uniqueCodename(usedCodenames),
    right_code: uniqueCodename(usedCodenames),
    left_arm: randomInt(0, 2) === 0 ? "control" : "treatment",
    is_duplicate: false,
    endpoint_primary: true,
  };
}

function main() {
  if (existsSync(SECRET_MAP_PATH)) {
    process.stderr.write(`FATAL: secret map already exists at ${SECRET_MAP_PATH} — it is generated exactly once and never regenerated. Writing nothing.\n`);
    process.exit(1);
    return;
  }
  if (existsSync(COMMITMENT_PATH)) {
    process.stderr.write(`FATAL: ${COMMITMENT_PATH} already exists — refusing to overwrite the commitment. Writing nothing.\n`);
    process.exit(1);
    return;
  }

  const phaseABriefs = readBriefs("phase-a-briefs.json", 16);
  const phaseBBriefs = readBriefs("phase-b-briefs.json", 36);

  const usedCodenames = new Set();
  const phaseAPresentations = [];

  for (const brief of phaseABriefs) {
    const p1 = buildPresentation(brief.brief_id, "A", brief.brief_id, brief.family, usedCodenames);
    phaseAPresentations.push(p1);
    if (brief.is_duplicate_source) {
      // Second, fully independent presentation of the same pair: fresh codenames,
      // independent left/right coin (protocol L133). Exactly one of the two gets
      // endpoint_primary:true, by its own CSPRNG coin.
      const p2 = buildPresentation(brief.brief_id, "A", brief.brief_id, brief.family, usedCodenames);
      p1.is_duplicate = true;
      p2.is_duplicate = true;
      const primaryIsFirst = randomInt(0, 2) === 0;
      p1.endpoint_primary = primaryIsFirst;
      p2.endpoint_primary = !primaryIsFirst;
      phaseAPresentations.push(p2);
    }
  }

  const phaseBPresentations = phaseBBriefs.map((brief) => buildPresentation(brief.brief_id, "B", brief.brief_id, brief.family, usedCodenames));

  if (phaseAPresentations.length !== 20) throw new Error(`internal error: expected 20 Phase-A presentations, got ${phaseAPresentations.length}`);
  if (phaseBPresentations.length !== 36) throw new Error(`internal error: expected 36 Phase-B presentations, got ${phaseBPresentations.length}`);

  const aOrder = fisherYatesOrder(phaseAPresentations.length, 1);
  const bOrder = fisherYatesOrder(phaseBPresentations.length, 21);
  phaseAPresentations.forEach((p, i) => (p.presentation_order = aOrder[i]));
  phaseBPresentations.forEach((p, i) => (p.presentation_order = bOrder[i]));

  const map = {
    version: "1",
    created_at: new Date().toISOString(),
    presentations: [...phaseAPresentations, ...phaseBPresentations],
  };

  const mapBytes = Buffer.from(JSON.stringify(map, null, 2), "utf8");
  mkdirSync(dirname(SECRET_MAP_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(SECRET_MAP_PATH, mapBytes, { mode: 0o600, flag: "wx" });
  chmodSync(SECRET_MAP_PATH, 0o600);

  const secretMapSha256 = createHash("sha256").update(mapBytes).digest("hex");
  process.stdout.write(`secret_map_sha256: ${secretMapSha256}\n`);
  process.stdout.write(`secret_map_location: ${SECRET_MAP_PATH}\n`);

  const commitment = {
    version: "1",
    created_at: map.created_at,
    csprng: "node:crypto.randomBytes",
    secret_map_location: SECRET_MAP_PATH,
    secret_map_sha256: secretMapSha256,
    phase_a_pairs: 16,
    phase_a_presentations: 20,
    phase_b_pairs: 36,
    phase_b_presentations: 36,
    codename_format: "8-hex-lowercase",
    presentation_id_format: "PR-8hex",
    committed_before_render: true,
  };
  writeFileSync(COMMITMENT_PATH, JSON.stringify(commitment, null, 2) + "\n", { flag: "wx" });
  process.stdout.write(`wrote ${COMMITMENT_PATH}\n`);
}

main();
