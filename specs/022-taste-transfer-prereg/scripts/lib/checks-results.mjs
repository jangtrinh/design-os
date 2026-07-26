// scripts/lib/checks-results.mjs
//
// PR-027, PR-028, PR-029 — result recomputation, the fail-closed truth table, and
// all-candidates-advance. REBUILT for fix-spec F4.
//
// Codex Stage-5 BLOCKER #2: PR-027 claimed to "recompute results from primary
// evidence" while actually reading three derived fields off the result file itself,
// so a fabricated `treatment_win: true` passed as long as both arms were flagged
// eligible. Nothing here trusts a derived field. Every value is recomputed from:
//
//   hash-verified run manifests and gate envelopes  ->  eligibility, artifacts
//   the commitment-verified randomization map       ->  which side is which arm
//   the exact owner-vote files                      ->  forced preference, both_fail
//   the exact curator-score files                   ->  axes, critical regressions
//   the frozen briefs                               ->  identity, contradiction role
//
// ...and then compared for exact equality with every recorded derived field.
import { readdirSync } from "node:fs";
import { finding } from "./findings.mjs";
import { validate } from "./schema.mjs";
import {
  ARMS,
  CANDIDATE_FAMILY,
  CURATOR_AXES,
  CURATOR_AXIS_VETO_DELTA,
  CURATOR_CRITICAL_REGRESSIONS,
  FAMILIES,
} from "./constants.mjs";
import { enumerateArmDirs, phasesInScope, verifyEvidenceFile } from "./evidence.mjs";
import { loadFrozenInputs } from "./frozen-inputs.mjs";
import { codenameToArm, parseRandomizationMap, resolveWinnerArm, rightArm } from "./randomization-map.mjs";

const RESULTS_DIR = "runs/results";
const SURVIVAL_FILE = "phase-a-survival.json";

/** Modes at which recorded results are required evidence rather than "not yet". */
function resultsRequired(ctx) {
  return ctx.mode === "post-phase-a" || ctx.mode === "post-render" || ctx.mode === "post-reveal";
}

// ---------------------------------------------------------------------------
// Loading primary evidence
// ---------------------------------------------------------------------------

/**
 * The assignment source for this mode.
 *
 * post-reveal: the published `runs/reveal/randomization-map.json`.
 * post-phase-a / post-render: the external secret map named by the commitment,
 * read IN PLACE and read-only, and only after its bytes hash-match
 * `secret_map_sha256` (F3). Phase-B assignments are filtered out entirely at the
 * Phase-A gate — they are never read into a Phase-A decision and never surfaced in
 * a finding.
 */
export function loadAssignments(ctx, frozen) {
  const errors = [];
  if (!frozen.commitment) {
    return { ok: false, errors: ["randomization-commitment.json is missing or unreadable — assignments cannot be verified"], byPair: new Map(), source: null };
  }

  const revealRel = "runs/reveal/randomization-map.json";
  let bytes = null;
  let source = null;
  if (ctx.exists(revealRel)) {
    const res = ctx.readBytes(revealRel);
    if (!res.ok) errors.push(`cannot read ${revealRel}: ${res.error}`);
    else {
      bytes = res.data;
      source = revealRel;
    }
  } else {
    const loc = frozen.commitment.secret_map_location;
    if (typeof loc !== "string" || loc.length === 0) {
      errors.push("commitment has no secret_map_location — assignments cannot be resolved");
    } else {
      const res = ctx.readBytesAbs(loc);
      if (!res.ok) errors.push(`cannot read the committed secret map in place: ${res.error}`);
      else {
        bytes = res.data;
        source = "secret_map_location";
      }
    }
  }
  if (bytes === null) return { ok: false, errors, byPair: new Map(), source };

  const parsed = parseRandomizationMap(bytes, frozen.commitment);
  errors.push(...parsed.errors);

  const phases = phasesInScope(ctx);
  const byPair = new Map();
  for (const p of parsed.presentations) {
    if (!phases.includes(p?.phase)) continue;
    const arr = byPair.get(p.pair_id) || [];
    arr.push(p);
    byPair.set(p.pair_id, arr);
  }
  return { ok: errors.length === 0, errors, byPair, source };
}

/** Every run manifest keyed `${phase}/${pair_id}/${arm}`. */
export function loadRunIndex(ctx) {
  const index = new Map();
  for (const dir of enumerateArmDirs(ctx, phasesInScope(ctx))) {
    if (dir.malformed) continue;
    const res = ctx.readJSON(dir.manifestRel);
    if (!res.ok) continue;
    index.set(`${dir.phase}/${dir.pairId}/${dir.arm}`, { dir, manifest: res.data });
  }
  return index;
}

/** Result files under runs/results/, excluding the survival summary. */
function listResultFiles(ctx) {
  try {
    return readdirSync(ctx.abs(RESULTS_DIR))
      .filter((n) => n.endsWith(".json") && n !== SURVIVAL_FILE)
      .sort();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// The recomputation itself
// ---------------------------------------------------------------------------

/** Eligibility is the POST-protocol gate outcome, never the initial one. */
function recomputeArm(runEntry) {
  if (!runEntry) return null;
  const m = runEntry.manifest;
  const primaryKey = m.artifacts?.primary;
  const primary = primaryKey === "repaired" ? m.artifacts?.repaired : m.artifacts?.initial;
  const initialPass = m.gates?.initial?.pass;
  const postRepairPass = m.gates?.post_repair ? m.gates.post_repair.pass : null;
  return {
    run_id: m.run_id ?? null,
    primary_artifact_sha256: primary?.sha256 ?? null,
    initial_pass: typeof initialPass === "boolean" ? initialPass : null,
    post_repair_pass: typeof postRepairPass === "boolean" ? postRepairPass : null,
    eligible: postRepairPass === null ? initialPass === true : postRepairPass === true,
    repairPerformed: m.repair?.performed === true,
    gateEnvelopes: { initial: m.gates?.initial ?? null, post_repair: m.gates?.post_repair ?? null },
    dirRel: runEntry.dir.dirRel,
  };
}

/** Article-II envelope errorCount for a gate, or null when unavailable. */
function gateErrorCount(ctx, dirRel, gate) {
  if (!gate?.envelope_path) return null;
  const res = ctx.readJSON(gate.envelope_path);
  if (!res.ok) return null;
  const count = res.data?.errorCount;
  return Number.isInteger(count) ? count : null;
}

/**
 * `repair_reduction` (PREREGISTRATION.md L114): undefined correction reduction —
 * INCLUDING 0->0 — is null, never improvement. Recomputed from the two hash-verified
 * gate envelopes of the treatment arm; null whenever it is not defined.
 */
function recomputeRepairReduction(ctx, treatment) {
  if (!treatment || !treatment.repairPerformed) return { value: null, measurable: true };
  const before = gateErrorCount(ctx, treatment.dirRel, treatment.gateEnvelopes.initial);
  const after = gateErrorCount(ctx, treatment.dirRel, treatment.gateEnvelopes.post_repair);
  if (before === null || after === null) return { value: null, measurable: false };
  const delta = before - after;
  return { value: delta === 0 ? null : delta, measurable: true };
}

function curatorVeto(scoresByArm) {
  const reasons = [];
  for (const arm of ARMS) {
    const score = scoresByArm[arm];
    if (!score) continue;
    for (const key of CURATOR_CRITICAL_REGRESSIONS) {
      if (score.critical_regressions?.[key]?.fired === true) reasons.push(`curator critical regression "${key}" fired on the ${arm} arm`);
    }
  }
  const control = scoresByArm.control;
  const treatment = scoresByArm.treatment;
  if (control?.axes && treatment?.axes) {
    for (const axis of CURATOR_AXES) {
      const c = control.axes[axis];
      const t = treatment.axes[axis];
      if (Number.isInteger(c) && Number.isInteger(t) && t <= c - CURATOR_AXIS_VETO_DELTA) {
        reasons.push(`curator axis "${axis}": treatment ${t} is ${c - t} points below control ${c}`);
      }
    }
  }
  return reasons;
}

function recomputeContradiction(entry, scoresByArm) {
  const phase = entry.phase;
  if (phase === "A" && entry.brief.role !== "contradiction") return "not-applicable";
  const treatment = scoresByArm.treatment;
  if (!treatment) return null;
  const fired = treatment.critical_regressions?.contradiction_leakage?.fired === true || treatment.anti_context_leak?.fired === true;
  return fired ? "leak" : "none";
}

/**
 * Recompute one result end to end.
 * @returns {{findings: object[], recomputed: object|null}}
 */
function recomputeOne(ctx, checkId, rel, result, deps) {
  const { frozen, assignments, runIndex, resultSchema, voteSchema, curatorSchema } = deps;
  const findings = [];
  const fail = (msg) => findings.push(finding(checkId, "error", `${rel}: ${msg}`, rel));
  const failClosed = [];

  if (resultSchema) {
    for (const e of validate(result, resultSchema, "$")) fail(`${e.path}: ${e.message}`);
  }

  const entry = frozen.briefs.get(String(result.pair_id));
  if (!entry) {
    fail(`pair_id ${JSON.stringify(result.pair_id)} is not a frozen pair`);
    return { findings, recomputed: null };
  }
  if (result.phase !== entry.phase) fail(`phase ${JSON.stringify(result.phase)} does not match the frozen brief (${entry.phase})`);
  if (result.brief_hash !== entry.hash) fail(`brief_hash ${result.brief_hash} does not recompute from the frozen brief (${entry.hash})`);

  const expectedFamily = entry.phase === "A" ? entry.brief.family : CANDIDATE_FAMILY[entry.brief.candidate_id];
  if (result.family !== expectedFamily) fail(`family ${JSON.stringify(result.family)} does not match the frozen brief (${expectedFamily})`);
  const expectedCandidate = entry.phase === "A" ? null : entry.brief.candidate_id;
  if (result.candidate_id !== expectedCandidate) fail(`candidate_id ${JSON.stringify(result.candidate_id)} does not match the frozen brief (${JSON.stringify(expectedCandidate)})`);

  if (frozen.commitmentSha256 === null) {
    failClosed.push("the randomization commitment is missing");
  } else if (result.randomization_commitment_sha256 !== frozen.commitmentSha256) {
    fail(`randomization_commitment_sha256 ${result.randomization_commitment_sha256} does not match the committed randomization-commitment.json (${frozen.commitmentSha256})`);
    failClosed.push("the recorded randomization commitment hash does not match the committed one");
  }

  // --- arms, from the hash-verified run manifests ---------------------------
  const arms = {};
  for (const arm of ARMS) {
    const runEntry = runIndex.get(`${entry.phase}/${result.pair_id}/${arm}`);
    const recomputed = recomputeArm(runEntry);
    arms[arm] = recomputed;
    if (!recomputed) {
      fail(`no run manifest for the ${arm} arm — results cannot be recomputed from evidence`);
      failClosed.push(`the ${arm} arm has no run evidence`);
      continue;
    }
    const recorded = result.arms?.[arm];
    if (!recorded) {
      fail(`arms.${arm} is missing from the result`);
      failClosed.push(`the ${arm} arm is missing from the result record`);
      continue;
    }
    for (const field of ["run_id", "primary_artifact_sha256", "initial_pass", "post_repair_pass", "eligible"]) {
      if (recorded[field] !== recomputed[field]) {
        fail(`arms.${arm}.${field} recorded ${JSON.stringify(recorded[field])} but recomputes to ${JSON.stringify(recomputed[field])}`);
      }
    }
    if (!recomputed.eligible) failClosed.push(`the ${arm} arm is ineligible after the protocol`);
  }

  // --- presentations and owner votes ---------------------------------------
  const mapped = assignments.byPair.get(result.pair_id) || [];
  if (mapped.length === 0) {
    fail("no randomization-map presentation exists for this pair");
    failClosed.push("the randomization map has no presentation for this pair");
  }
  const recordedPresentations = Array.isArray(result.presentations) ? result.presentations : [];
  const mappedIds = new Set(mapped.map((p) => p.presentation_id));
  const recordedIds = new Set(recordedPresentations.map((p) => p?.presentation_id));
  if (mapped.length !== recordedPresentations.length) {
    fail(`records ${recordedPresentations.length} presentation(s) but the randomization map assigns ${mapped.length}`);
  }
  for (const id of recordedIds) {
    if (!mappedIds.has(id)) {
      fail(`presentation ${id} is not assigned to this pair by the randomization map`);
      failClosed.push("a recorded presentation is not in the randomization map");
    }
  }
  for (const id of mappedIds) {
    if (!recordedIds.has(id)) {
      fail(`presentation ${id} is assigned to this pair but has no recorded owner vote`);
      failClosed.push("an assigned presentation has no recorded vote");
    }
  }

  const votes = new Map();
  for (const rp of recordedPresentations) {
    const presentation = mapped.find((p) => p.presentation_id === rp?.presentation_id);
    const verified = verifyEvidenceFile(ctx, "runs/votes", rp?.owner_vote_path, rp?.owner_vote_sha256);
    if (!verified.ok) {
      fail(`owner vote for ${rp?.presentation_id} — ${verified.error}`);
      failClosed.push("an owner vote file is missing or does not match its recorded hash");
      continue;
    }
    const voteRes = ctx.readJSON(rp.owner_vote_path);
    if (!voteRes.ok) {
      fail(`cannot read owner vote ${rp.owner_vote_path}: ${voteRes.error}`);
      failClosed.push("an owner vote file is unreadable");
      continue;
    }
    if (voteSchema) {
      for (const e of validate(voteRes.data, voteSchema, "$")) fail(`owner vote ${rp.owner_vote_path} ${e.path}: ${e.message}`);
    }
    const vote = voteRes.data;
    if (vote.presentation_id !== rp.presentation_id) {
      fail(`owner vote ${rp.owner_vote_path} is for ${vote.presentation_id}, recorded under ${rp.presentation_id}`);
      failClosed.push("an owner vote names a different presentation");
      continue;
    }
    if (presentation) {
      if (vote.left_code !== presentation.left_code || vote.right_code !== presentation.right_code) {
        fail(`owner vote ${rp.owner_vote_path} codenames do not match the randomization map for ${rp.presentation_id}`);
        failClosed.push("an owner vote's codenames do not match the randomization map");
        continue;
      }
      if (rp.endpoint_primary !== (presentation.endpoint_primary === true)) {
        fail(`presentation ${rp.presentation_id}: endpoint_primary recorded ${rp.endpoint_primary} but the map says ${presentation.endpoint_primary}`);
      }
      votes.set(rp.presentation_id, { vote, presentation });
    }
  }

  const primaryPair = [...votes.values()].filter((v) => v.presentation.endpoint_primary === true);
  if (primaryPair.length !== 1) {
    fail(`expected exactly one endpoint-primary presentation with a verified vote, found ${primaryPair.length}`);
    failClosed.push("the endpoint-primary vote could not be resolved");
  }
  const endpoint = primaryPair[0] || null;

  // --- revealed assignment --------------------------------------------------
  if (endpoint) {
    const expectedAssignment = { left: endpoint.presentation.left_arm, right: rightArm(endpoint.presentation) };
    if (result.revealed_assignment?.left !== expectedAssignment.left || result.revealed_assignment?.right !== expectedAssignment.right) {
      fail(`revealed_assignment ${JSON.stringify(result.revealed_assignment)} does not match the randomization map (${JSON.stringify(expectedAssignment)})`);
    }
  }

  // --- duplicate self-consistency ------------------------------------------
  let duplicateConsistent = null;
  if (votes.size === 2) {
    const [a, b] = [...votes.values()];
    const winnerA = resolveWinnerArm(a.presentation, a.vote.forced_preference);
    const winnerB = resolveWinnerArm(b.presentation, b.vote.forced_preference);
    duplicateConsistent = winnerA === winnerB && a.vote.both_fail === b.vote.both_fail;
  }
  if (result.duplicate_consistent !== duplicateConsistent) {
    fail(`duplicate_consistent recorded ${JSON.stringify(result.duplicate_consistent)} but recomputes to ${JSON.stringify(duplicateConsistent)}`);
  }
  if (duplicateConsistent === false) failClosed.push("the duplicated presentation is not self-consistent");

  // --- curator scores -------------------------------------------------------
  //
  // r4 — EXACT identity coverage, not merely "two entries that each verify".
  //
  // The bypass this closes (Codex Stage-5 BLOCKER on adeec3a): `curator_scores`
  // could repeat the SAME valid codename twice. The array length stayed 2, both
  // entries resolved to real hash-valid files, the schema passed, and the missing
  // opposite arm only appended a fail-closed REASON at the end. On a
  // NON-CONFIRMATORY result a fail-closed reason is expected and absorbed by the
  // truth table — so a forged result was accepted while the treatment score was
  // never read, hiding its veto and contradiction evidence.
  //
  // Every identity defect below is therefore a deterministic ERROR, not only a
  // fail-closed reason. The reasons are kept as well, because they still feed
  // PR-028's truth table.
  const scoresByArm = { control: null, treatment: null };
  if (endpoint) {
    const codeArm = codenameToArm(endpoint.presentation);
    const recordedScores = Array.isArray(result.curator_scores) ? result.curator_scores : [];
    const expectedCodes = new Set([endpoint.presentation.left_code, endpoint.presentation.right_code]);
    if (recordedScores.length !== 2) {
      fail(`expected exactly 2 curator scores, found ${recordedScores.length}`);
      failClosed.push("curator scores are incomplete");
    }
    // Uniqueness is enforced HERE rather than with a schema `uniqueItems` keyword:
    // schema.mjs implements no such keyword (see its supported-keyword list), so
    // adding one would be a vacuous contract that reads as enforcement.
    const seenCodenames = new Set();
    const seenPaths = new Set();
    for (const rs of recordedScores) {
      if (!expectedCodes.has(rs?.codename)) {
        fail(`curator score codename ${JSON.stringify(rs?.codename)} is not one of this pair's endpoint-primary codenames`);
        failClosed.push("a curator score names an unexpected codename");
        continue;
      }
      if (seenCodenames.has(rs.codename)) {
        fail(`curator score codename ${JSON.stringify(rs.codename)} is referenced twice — each endpoint codename must appear exactly once`);
        failClosed.push("a curator score codename is referenced twice");
        continue;
      }
      seenCodenames.add(rs.codename);
      if (typeof rs.path === "string" && seenPaths.has(rs.path)) {
        fail(`curator score path ${JSON.stringify(rs.path)} is referenced twice — one score file cannot stand in for both arms`);
        failClosed.push("one curator score file is referenced for both arms");
        continue;
      }
      if (typeof rs.path === "string") seenPaths.add(rs.path);
      const verified = verifyEvidenceFile(ctx, "runs/curator", rs.path, rs.sha256);
      if (!verified.ok) {
        fail(`curator score for ${rs.codename} — ${verified.error}`);
        failClosed.push("a curator score file is missing or does not match its recorded hash");
        continue;
      }
      const scoreRes = ctx.readJSON(rs.path);
      if (!scoreRes.ok) {
        fail(`cannot read curator score ${rs.path}: ${scoreRes.error}`);
        failClosed.push("a curator score file is unreadable");
        continue;
      }
      if (curatorSchema) {
        for (const e of validate(scoreRes.data, curatorSchema, "$")) fail(`curator score ${rs.path} ${e.path}: ${e.message}`);
      }
      if (scoreRes.data.codename !== rs.codename) {
        fail(`curator score ${rs.path} is for ${scoreRes.data.codename}, recorded under ${rs.codename}`);
        failClosed.push("a curator score names a different codename");
        continue;
      }
      const arm = codeArm.get(rs.codename);
      if (arm !== "control" && arm !== "treatment") {
        fail(`curator score ${JSON.stringify(rs.codename)} does not resolve to an arm of this pair`);
        failClosed.push("a curator score does not resolve to an arm");
        continue;
      }
      if (scoresByArm[arm]) {
        fail(`two verified curator scores both resolve to the ${arm} arm — each arm must be covered exactly once`);
        failClosed.push("two curator scores resolve to the same arm");
        continue;
      }
      scoresByArm[arm] = scoreRes.data;
    }
    // Set equality: exactly the two expected endpoint codenames, each once.
    for (const code of expectedCodes) {
      if (!seenCodenames.has(code)) {
        fail(`no curator score references endpoint codename ${JSON.stringify(code)} — its evidence would go unread`);
      }
    }
    if (!scoresByArm.control || !scoresByArm.treatment) {
      const missing = !scoresByArm.control ? "control" : "treatment";
      fail(`no verified curator score resolves to the ${missing} arm — that arm's veto and contradiction evidence is unread`);
      failClosed.push("a curator score is missing for one arm");
    }
  }

  const vetoReasons = curatorVeto(scoresByArm);
  failClosed.push(...vetoReasons);

  // --- contradiction --------------------------------------------------------
  const contradiction = recomputeContradiction(entry, scoresByArm);
  if (contradiction !== null && result.contradiction_result !== contradiction) {
    fail(`contradiction_result recorded ${JSON.stringify(result.contradiction_result)} but recomputes to ${JSON.stringify(contradiction)}`);
  }
  if (result.contradiction_result === "leak" || contradiction === "leak") failClosed.push("contradiction leakage was recorded");

  // --- repair reduction -----------------------------------------------------
  const reduction = recomputeRepairReduction(ctx, arms.treatment);
  if (result.repair_reduction === 0) {
    fail("repair_reduction recorded as 0 — undefined/0-to-0 reductions must be null, never 0");
  } else if (reduction.measurable && result.repair_reduction !== reduction.value) {
    fail(`repair_reduction recorded ${JSON.stringify(result.repair_reduction)} but recomputes to ${JSON.stringify(reduction.value)} from the gate envelopes`);
  } else if (!reduction.measurable && result.repair_reduction !== null) {
    fail(`repair_reduction recorded ${JSON.stringify(result.repair_reduction)} but the gate envelopes do not define a reduction — it must be null`);
  }

  // --- both_fail and the endpoint -------------------------------------------
  let bothFail = null;
  let winnerArm = null;
  if (endpoint) {
    bothFail = endpoint.vote.both_fail === true;
    winnerArm = resolveWinnerArm(endpoint.presentation, endpoint.vote.forced_preference);
    if (bothFail) failClosed.push("the owner recorded both_fail on the endpoint presentation");
    if (winnerArm === null) failClosed.push("the endpoint vote's forced_preference does not resolve to an arm");
  }

  // --- treatment_win --------------------------------------------------------
  const expectedWin = failClosed.length > 0 ? false : winnerArm === "treatment";
  if (failClosed.length > 0) {
    if (result.treatment_win === true) {
      fail(`treatment_win is true but ${failClosed.length} fail-closed condition(s) fired: ${failClosed.join("; ")}`);
    }
  } else if (result.treatment_win !== expectedWin) {
    fail(`treatment_win recorded ${JSON.stringify(result.treatment_win)} but recomputes to ${JSON.stringify(expectedWin)} from the endpoint vote and the revealed assignment`);
  }
  if (result.treatment_win !== true) {
    const reason = result.non_confirmatory_reason;
    if (typeof reason !== "string" || reason.trim() === "") {
      fail("treatment_win is not true but non_confirmatory_reason is null/empty — every non-confirmatory pair must record why");
    }
  } else if (result.non_confirmatory_reason !== null) {
    fail(`treatment_win is true but non_confirmatory_reason is ${JSON.stringify(result.non_confirmatory_reason)} — a confirmatory pair records null`);
  }

  return {
    findings,
    recomputed: {
      pair_id: result.pair_id,
      phase: entry.phase,
      family: expectedFamily,
      candidate_id: expectedCandidate,
      role: entry.phase === "A" ? entry.brief.role : null,
      treatment_win: expectedWin,
      failClosed,
      recordedWin: result.treatment_win,
    },
  };
}

/** Shared driver for PR-027 and PR-028 — loads evidence once, recomputes once. */
export function recomputeAllResults(ctx, checkId) {
  const findings = [];
  const recomputed = [];
  if (!ctx.isDir(RESULTS_DIR)) {
    findings.push(
      finding(
        checkId,
        resultsRequired(ctx) ? "error" : "warning",
        resultsRequired(ctx)
          ? `${RESULTS_DIR}/ does not exist — recorded results are required at --mode ${ctx.mode}`
          : `${RESULTS_DIR}/ does not exist yet — nothing to recompute`,
      ),
    );
    return { findings, recomputed };
  }

  const frozen = loadFrozenInputs(ctx);
  for (const e of frozen.errors) findings.push(finding(checkId, "error", `frozen inputs unreadable: ${e}`));
  const assignments = loadAssignments(ctx, frozen);
  for (const e of assignments.errors) findings.push(finding(checkId, "error", `randomization assignments unusable: ${e}`));
  const runIndex = loadRunIndex(ctx);

  const resultSchemaRes = ctx.readJSON("schemas/result.schema.json");
  const voteSchemaRes = ctx.readJSON("schemas/owner-vote.schema.json");
  const curatorSchemaRes = ctx.readJSON("schemas/curator-score.schema.json");
  const deps = {
    frozen,
    assignments,
    runIndex,
    resultSchema: resultSchemaRes.ok ? resultSchemaRes.data : null,
    voteSchema: voteSchemaRes.ok ? voteSchemaRes.data : null,
    curatorSchema: curatorSchemaRes.ok ? curatorSchemaRes.data : null,
  };

  const seenPairs = new Set();
  for (const name of listResultFiles(ctx)) {
    const rel = `${RESULTS_DIR}/${name}`;
    const res = ctx.readJSON(rel);
    if (!res.ok) {
      findings.push(finding(checkId, "error", `cannot read ${rel}: ${res.error}`, rel));
      continue;
    }
    if (seenPairs.has(res.data.pair_id)) {
      findings.push(finding(checkId, "error", `${rel}: a second result file for pair ${res.data.pair_id}`, rel));
      continue;
    }
    seenPairs.add(res.data.pair_id);
    const one = recomputeOne(ctx, checkId, rel, res.data, deps);
    findings.push(...one.findings);
    if (one.recomputed) recomputed.push(one.recomputed);
  }

  // Coverage: every Phase-A pair must have a result once Phase A is gated.
  if (resultsRequired(ctx)) {
    for (const [pairId, entry] of frozen.briefs) {
      if (entry.phase !== "A") continue;
      if (!seenPairs.has(pairId)) findings.push(finding(checkId, "error", `no result recorded for Phase-A pair ${pairId}`, pairId));
    }
  }
  return { findings, recomputed };
}

// ---------------------------------------------------------------------------
// PR-027 result-recompute
// ---------------------------------------------------------------------------

export function prResultRecompute(ctx) {
  return recomputeAllResults(ctx, "PR-027").findings;
}

// ---------------------------------------------------------------------------
// PR-028 truth-table
// ---------------------------------------------------------------------------

export function prTruthTable(ctx) {
  const { findings, recomputed } = recomputeAllResults(ctx, "PR-028");
  for (const r of recomputed) {
    if (r.failClosed.length > 0) {
      if (r.recordedWin === true) {
        findings.push(finding("PR-028", "error", `${r.pair_id}: a fail-closed condition fired but treatment_win=true (${r.failClosed[0]})`, r.pair_id));
      }
    }
    if (r.recordedWin === true && r.treatment_win !== true) {
      findings.push(finding("PR-028", "error", `${r.pair_id}: treatment_win=true is not supported by the recomputed endpoint`, r.pair_id));
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Family survival — the Phase-A gate's actual arithmetic
// ---------------------------------------------------------------------------

/**
 * PREREGISTRATION.md L70: a family survives only if treatment wins ALL THREE
 * ORDINARY owner votes (the ordinal-4 contradiction brief is diagnostic and never
 * counts), with every arm eligible, no contradiction leakage, no curator veto, and
 * a self-consistent duplicate. Every one of those is already folded into each
 * pair's recomputed `treatment_win`, so survival is exactly "3 ordinary wins".
 */
export function computeSurvival(recomputed) {
  const byFamily = new Map();
  for (const family of FAMILIES) byFamily.set(family, { family, ordinary: [], contradiction: [] });
  for (const r of recomputed) {
    if (r.phase !== "A") continue;
    const bucket = byFamily.get(r.family);
    if (!bucket) continue;
    if (r.role === "contradiction") bucket.contradiction.push(r);
    else bucket.ordinary.push(r);
  }
  const out = [];
  for (const bucket of byFamily.values()) {
    const wins = bucket.ordinary.filter((r) => r.treatment_win === true).length;
    const complete = bucket.ordinary.length === 3;
    const leaked = bucket.contradiction.some((r) => r.failClosed.some((f) => f.includes("contradiction leakage")));
    const survives = complete && wins === 3 && !leaked;
    out.push({
      family: bucket.family,
      ordinary_pair_ids: bucket.ordinary.map((r) => r.pair_id).sort(),
      ordinary_treatment_wins: wins,
      survives,
      complete,
      leaked,
    });
  }
  return out.sort((a, b) => a.family.localeCompare(b.family));
}

// ---------------------------------------------------------------------------
// PR-029 all-candidates-advance
// ---------------------------------------------------------------------------

export function prAllCandidatesAdvance(ctx) {
  const { findings, recomputed } = recomputeAllResults(ctx, "PR-029");
  const survival = computeSurvival(recomputed);
  const surviving = new Set(survival.filter((s) => s.survives).map((s) => s.family));

  const frozen = loadFrozenInputs(ctx);
  const phaseBResults = recomputed.filter((r) => r.phase === "B");

  for (const [candidateId, family] of Object.entries(CANDIDATE_FAMILY)) {
    const forCandidate = phaseBResults.filter((r) => r.candidate_id === candidateId);
    if (surviving.has(family)) {
      if (forCandidate.length !== 3) {
        findings.push(
          finding(
            "PR-029",
            "error",
            `candidate ${candidateId} (surviving family ${family}): expected 3 Phase-B results, found ${forCandidate.length} — every candidate of a surviving family advances; there is no post-output capacity selection`,
            candidateId,
          ),
        );
      }
    } else if (forCandidate.length > 0) {
      findings.push(
        finding(
          "PR-029",
          "error",
          `candidate ${candidateId}: family ${family} did not survive Phase A but ${forCandidate.length} Phase-B result(s) exist`,
          candidateId,
        ),
      );
    }
  }

  // A non-surviving family must not have rendered Phase-B arms at all.
  if (frozen.ok || frozen.briefs.size > 0) {
    for (const dir of enumerateArmDirs(ctx, ["B"])) {
      if (dir.malformed) continue;
      const entry = frozen.briefs.get(dir.pairId);
      const family = entry ? CANDIDATE_FAMILY[entry.brief.candidate_id] : null;
      if (family && !surviving.has(family)) {
        findings.push(finding("PR-029", "error", `${dir.dirRel}: Phase-B render exists for family ${family}, which did not survive Phase A`, dir.dirRel));
      }
    }
  }
  return findings;
}
