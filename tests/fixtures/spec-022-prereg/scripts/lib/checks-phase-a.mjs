// scripts/lib/checks-phase-a.mjs
//
// PR-031 phase-a-gate — the gate that decides which families enter Phase B.
// New in fix-spec F3.
//
// Codex Stage-5 BLOCKER #3: `post-phase-a` was treated as an alias for
// `pre-render`, so it rejected any non-empty `runs/` tree — a genuinely completed
// Phase A could never pass its own gate — while none of the post-render or result
// checks ran there, so nothing determined the surviving families before Phase B.
//
// This check owns everything that is specific to that gate:
//   * the committed external secret map is verified IN PLACE, read-only, against
//     `secret_map_sha256`, and only Phase-A presentations are ever consulted;
//   * exact Phase-A owner-vote coverage (all 20 presentations) and exact Phase-A
//     curator codename coverage (2 per endpoint-primary presentation);
//   * complete, schema-valid, correctly ordered FREEZE envelopes;
//   * survival recomputed from the three ORDINARY briefs only, with the
//     contradiction brief kept diagnostic, and exact agreement with the recorded
//     `phase-a-survival.json`;
//   * Phase-B execution and any full reveal forbidden until this gate passes.
import { finding } from "./findings.mjs";
import { validate } from "./schema.mjs";
import { FAMILIES } from "./constants.mjs";
import { enumerateArmDirs, isRealDir, safeReaddir } from "./evidence.mjs";
import { loadFrozenInputs } from "./frozen-inputs.mjs";
import { loadAssignments, computeSurvival, recomputeAllResults } from "./checks-results.mjs";
import { CURATOR_DIR, VOTES_DIR, verifyFreezeEnvelope, verifyFreezeOrdering } from "./freeze.mjs";

const CHECK = "PR-031";
const SURVIVAL_REL = "runs/results/phase-a-survival.json";

export function prPhaseAGate(ctx) {
  const findings = [];
  const gateMode = ctx.mode === "post-phase-a";

  if (!gateMode && ctx.mode !== "post-render" && ctx.mode !== "post-reveal") {
    return findings; // the gate does not exist before Phase A can have run
  }

  // -------------------------------------------------------------------------
  // At the gate itself: Phase-B evidence and any reveal are forbidden outright.
  // -------------------------------------------------------------------------
  if (gateMode) {
    for (const dir of enumerateArmDirs(ctx, ["B"])) {
      findings.push(finding(CHECK, "error", `${dir.dirRel}: Phase-B evidence exists at the Phase-A gate — Phase B may not run until Phase A passes`, dir.dirRel));
    }
    if (isRealDir(ctx, "runs/reveal")) {
      findings.push(
        finding(
          CHECK,
          "error",
          "runs/reveal/ exists at the Phase-A gate — the full randomization map stays sealed until every Phase-A AND Phase-B owner/curator freeze commit exists",
        ),
      );
    }
    if (isRealDir(ctx, "runs/phase-b")) {
      findings.push(finding(CHECK, "error", "runs/phase-b/ exists at the Phase-A gate", "runs/phase-b"));
    }
  }

  const frozen = loadFrozenInputs(ctx);
  for (const e of frozen.errors) findings.push(finding(CHECK, "error", `frozen inputs unreadable: ${e}`));

  // -------------------------------------------------------------------------
  // The secret map, verified in place against the commitment, Phase A only.
  // -------------------------------------------------------------------------
  const assignments = loadAssignments(ctx, frozen);
  for (const e of assignments.errors) findings.push(finding(CHECK, "error", `randomization assignments unusable: ${e}`));

  const phaseAPresentations = [];
  for (const [pairId, list] of assignments.byPair) {
    const entry = frozen.briefs.get(pairId);
    if (!entry || entry.phase !== "A") continue;
    phaseAPresentations.push(...list);
  }
  if (assignments.ok && phaseAPresentations.length !== 20) {
    findings.push(finding(CHECK, "error", `the randomization map assigns ${phaseAPresentations.length} Phase-A presentations, expected 20 (16 pairs + 4 duplicates)`));
  }

  // -------------------------------------------------------------------------
  // Exact Phase-A vote and curator coverage, and the Phase-A freeze envelopes.
  //
  // These are enforced only AT the gate. Once Phase B has legitimately run, the
  // same directories also hold Phase-B votes and codenames and the envelopes cover
  // Phase B — demanding a Phase-A-only file set there would fail a correct program.
  // PR-025 owns coverage and ordering from the reveal onward.
  // -------------------------------------------------------------------------
  if (gateMode) {
    const expectedVoteNames = new Set();
    const expectedCuratorNames = new Set();
    for (const p of phaseAPresentations) {
      expectedVoteNames.add(`${p.presentation_id}.json`);
      if (p.endpoint_primary === true) {
        expectedCuratorNames.add(`${p.left_code}.json`);
        expectedCuratorNames.add(`${p.right_code}.json`);
      }
    }
    findings.push(...checkDirectoryCoverage(ctx, VOTES_DIR, expectedVoteNames, "owner vote"));
    findings.push(...checkDirectoryCoverage(ctx, CURATOR_DIR, expectedCuratorNames, "curator score"));

    const voteSchemaRes = ctx.readJSON("schemas/owner-vote.schema.json");
    const curatorSchemaRes = ctx.readJSON("schemas/curator-score.schema.json");
    const votesFreeze = verifyFreezeEnvelope(ctx, CHECK, {
      dirRel: VOTES_DIR,
      kind: "votes",
      phase: "A",
      itemSchema: voteSchemaRes.ok ? voteSchemaRes.data : null,
      expectedNames: expectedVoteNames.size > 0 ? expectedVoteNames : null,
    });
    findings.push(...votesFreeze.findings);
    const curatorFreeze = verifyFreezeEnvelope(ctx, CHECK, {
      dirRel: CURATOR_DIR,
      kind: "curator",
      phase: "A",
      itemSchema: curatorSchemaRes.ok ? curatorSchemaRes.data : null,
      expectedNames: expectedCuratorNames.size > 0 ? expectedCuratorNames : null,
    });
    findings.push(...curatorFreeze.findings);
    const ordering = verifyFreezeOrdering(ctx, CHECK, {
      votesCommit: votesFreeze.freezeCommit,
      curatorCommit: curatorFreeze.freezeCommit,
    });
    findings.push(...ordering.findings);
  }

  // -------------------------------------------------------------------------
  // Survival, recomputed from the three ordinary briefs only.
  // -------------------------------------------------------------------------
  const { recomputed } = recomputeAllResults(ctx, CHECK);
  const survival = computeSurvival(recomputed.filter((r) => r.phase === "A"));
  findings.push(...checkRecordedSurvival(ctx, survival));

  return findings;
}

/** Exactly the expected `.json` payloads live in a judging-evidence directory. */
function checkDirectoryCoverage(ctx, dirRel, expected, label) {
  const findings = [];
  if (expected.size === 0) return findings;
  const entries = safeReaddir(ctx, dirRel);
  if (entries === null) {
    findings.push(finding(CHECK, "error", `${dirRel}/ does not exist — ${expected.size} ${label} file(s) are required at the Phase-A gate`, dirRel));
    return findings;
  }
  const actual = new Set(entries.filter((e) => e.isFile() && e.name.endsWith(".json") && e.name !== "FREEZE.json").map((e) => e.name));
  for (const name of expected) {
    if (!actual.has(name)) findings.push(finding(CHECK, "error", `missing ${label}: ${dirRel}/${name}`, `${dirRel}/${name}`));
  }
  for (const name of actual) {
    if (!expected.has(name)) findings.push(finding(CHECK, "error", `unexpected ${label} file ${dirRel}/${name} — it matches no Phase-A presentation or endpoint codename`, `${dirRel}/${name}`));
  }
  return findings;
}

/**
 * The recorded Phase-A gate outcome is evidence, never authority: it must agree
 * exactly with survival recomputed from the primary evidence, family by family.
 */
function checkRecordedSurvival(ctx, survival) {
  const findings = [];
  const res = ctx.readJSON(SURVIVAL_REL);
  if (!res.ok) {
    findings.push(finding(CHECK, "error", `missing/unreadable ${SURVIVAL_REL}: ${res.error} — the Phase-A gate outcome must be recorded before Phase B`, SURVIVAL_REL));
    return findings;
  }
  const schemaRes = ctx.readJSON("schemas/phase-a-survival.schema.json");
  if (schemaRes.ok) {
    for (const e of validate(res.data, schemaRes.data, "$")) findings.push(finding(CHECK, "error", `${SURVIVAL_REL} ${e.path}: ${e.message}`, SURVIVAL_REL));
  }

  const recordedByFamily = new Map();
  for (const row of res.data.families || []) {
    if (typeof row?.family !== "string") continue;
    if (recordedByFamily.has(row.family)) findings.push(finding(CHECK, "error", `${SURVIVAL_REL}: family ${row.family} recorded twice`, SURVIVAL_REL));
    recordedByFamily.set(row.family, row);
  }
  for (const family of FAMILIES) {
    if (!recordedByFamily.has(family)) findings.push(finding(CHECK, "error", `${SURVIVAL_REL}: family ${family} is not recorded`, SURVIVAL_REL));
  }

  for (const computed of survival) {
    const row = recordedByFamily.get(computed.family);
    if (!row) continue;
    if (row.survives !== computed.survives) {
      findings.push(
        finding(
          CHECK,
          "error",
          `${SURVIVAL_REL}: family ${computed.family} records survives=${row.survives} but recomputes to ${computed.survives} (${computed.ordinary_treatment_wins}/3 ordinary treatment wins from primary evidence)`,
          computed.family,
        ),
      );
    }
    if (row.ordinary_treatment_wins !== computed.ordinary_treatment_wins) {
      findings.push(
        finding(
          CHECK,
          "error",
          `${SURVIVAL_REL}: family ${computed.family} records ${row.ordinary_treatment_wins} ordinary treatment wins but recomputes to ${computed.ordinary_treatment_wins}`,
          computed.family,
        ),
      );
    }
    const recordedPairs = [...(row.ordinary_pair_ids || [])].sort();
    if (JSON.stringify(recordedPairs) !== JSON.stringify(computed.ordinary_pair_ids)) {
      findings.push(
        finding(
          CHECK,
          "error",
          `${SURVIVAL_REL}: family ${computed.family} records ordinary pairs ${JSON.stringify(recordedPairs)} but the recomputed ordinary set is ${JSON.stringify(computed.ordinary_pair_ids)} — the ordinal-4 contradiction brief is diagnostic and never counts toward survival`,
          computed.family,
        ),
      );
    }
    if (!computed.complete) {
      findings.push(finding(CHECK, "error", `family ${computed.family}: fewer than 3 ordinary Phase-A results exist — survival cannot be decided`, computed.family));
    }
    if (row.survives === false && (row.stop_reason === null || String(row.stop_reason).trim() === "")) {
      findings.push(finding(CHECK, "error", `${SURVIVAL_REL}: family ${computed.family} stopped but records no stop_reason`, computed.family));
    }
    if (row.survives === true && row.stop_reason !== null) {
      findings.push(finding(CHECK, "error", `${SURVIVAL_REL}: family ${computed.family} survives but records a stop_reason`, computed.family));
    }
  }
  return findings;
}
