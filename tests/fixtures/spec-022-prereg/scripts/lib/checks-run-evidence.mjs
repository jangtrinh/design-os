// scripts/lib/checks-run-evidence.mjs
//
// PR-019..PR-022 — post-render run evidence, REBUILT for fix-spec F1 + F2.
//
// What changed, and why:
//   * PR-019 no longer merely proves `prereg_commit` is an ancestor of HEAD. It
//     proves that commit IS the commitment commit (the unique, single revision that
//     introduced randomization-commitment.json) and that its tree carries every
//     frozen file with the exact bytes we validate against today.
//   * PR-020 no longer validates only schema shape + `tree_clean` + provider
//     equality. It reconstructs the P7 arm-visible prompt through the one canonical
//     assembler and recomputes `prompt_hash`, `brief_hash`, `patch_hash`, and every
//     artifact/gate/console/screenshot/reduced-motion hash; it enforces the pinned
//     cross-field relationships (path==manifest, control_commit==prereg_commit,
//     upstream==pinned, Phase-A candidate null); it enforces exactly one manifest
//     per expected arm directory with no aliases; and it verifies tree cleanliness
//     with git rather than believing the manifest's own boast.
//
// Codex Stage-5 BLOCKERs #1 and #4.
import { readdirSync } from "node:fs";
import { finding } from "./findings.mjs";
import { validate } from "./schema.mjs";
import { sha256File, SHA1_RE } from "./hash.mjs";
import { git } from "./git.mjs";
import {
  ARMS,
  CANDIDATE_FAMILY,
  FROZEN_FILES,
  PHASE_A_PAIRS,
  PINNED_COMMIT,
  SPEC_DIR_REL,
} from "./constants.mjs";
import {
  commitsTouching,
  enumerateArmDirs,
  gitOrNull,
  isAncestor,
  phasesInScope,
  verifyEvidenceFile,
} from "./evidence.mjs";
import { loadFrozenInputs, allCandidateSourceHashes, expectedTreatmentSourceHashes } from "./frozen-inputs.mjs";
import { assembleArmPrompt, expectedPatchPath } from "./prompt-assembler.mjs";

const COMMITMENT_REPO_PATH = `${SPEC_DIR_REL}/randomization-commitment.json`;

/**
 * Is run evidence for `phase` REQUIRED at this mode, or merely not-yet-applicable?
 *
 * F8: warning-only absence is permitted ONLY where the evidence genuinely cannot
 * exist yet. Phase-A evidence at the Phase-A gate and later is required. Phase-B
 * evidence is never required — a program where no family survives Phase A renders
 * zero Phase-B arms, and that is a legitimate outcome, not a missing artifact.
 */
function phaseARequired(ctx) {
  return ctx.mode === "post-phase-a" || ctx.mode === "post-render" || ctx.mode === "post-reveal";
}

/** All arm dirs in scope, with their parsed manifests. Malformed entries included. */
function collectRuns(ctx) {
  const runs = [];
  for (const dir of enumerateArmDirs(ctx, phasesInScope(ctx))) {
    if (dir.malformed) {
      runs.push({ ...dir, manifest: null, readError: dir.malformed });
      continue;
    }
    const res = ctx.readJSON(dir.manifestRel);
    runs.push({ ...dir, manifest: res.ok ? res.data : null, readError: res.ok ? null : res.error });
  }
  return runs;
}

function absenceFinding(ctx, checkId, phase) {
  const required = phase === "A" && phaseARequired(ctx);
  return finding(
    checkId,
    required ? "error" : "warning",
    required
      ? `no Phase-${phase} run manifests found under runs/phase-a/ — Phase-A evidence is required at --mode ${ctx.mode}`
      : `no Phase-${phase} run manifests found under runs/phase-${phase.toLowerCase()}/`,
  );
}

// ---------------------------------------------------------------------------
// PR-019 — prereg-commit recorded, and provably the commitment commit
// ---------------------------------------------------------------------------

export function prPreregCommitRecorded(ctx) {
  const findings = [];
  const runs = collectRuns(ctx);
  if (runs.length === 0) {
    for (const phase of phasesInScope(ctx)) findings.push(absenceFinding(ctx, "PR-019", phase));
    return findings;
  }

  // The commitment commit: the single revision that introduced the commitment blob.
  const commitmentCommits = commitsTouching(ctx, COMMITMENT_REPO_PATH);
  let commitmentCommit = null;
  if (commitmentCommits.length === 0) {
    findings.push(finding("PR-019", "error", `${COMMITMENT_REPO_PATH} has no commit history — no commitment commit exists to record`));
  } else if (commitmentCommits.length > 1) {
    findings.push(finding("PR-019", "error", `${COMMITMENT_REPO_PATH} has ${commitmentCommits.length} revisions — the commitment commit must be unique and never amended`));
  } else {
    commitmentCommit = commitmentCommits[0];
  }

  const seen = new Set();
  for (const run of runs) {
    const rel = run.manifestRel || run.dirRel;
    if (!run.manifest) {
      findings.push(finding("PR-019", "error", `cannot read ${rel}: ${run.readError}`, rel));
      continue;
    }
    const commit = run.manifest.prereg_commit;
    if (typeof commit !== "string" || !SHA1_RE.test(commit)) {
      findings.push(finding("PR-019", "error", `${rel}: malformed prereg_commit`, rel));
      continue;
    }
    if (!isAncestor(ctx, commit, "HEAD")) {
      findings.push(finding("PR-019", "error", `${rel}: prereg_commit ${commit} is not an ancestor of HEAD`, rel));
      continue;
    }
    if (commitmentCommit !== null && commit !== commitmentCommit) {
      findings.push(finding("PR-019", "error", `${rel}: prereg_commit ${commit} is not the commitment commit ${commitmentCommit}`, rel));
      continue;
    }
    seen.add(commit);
  }

  if (seen.size > 1) {
    findings.push(finding("PR-019", "error", `run manifests record ${seen.size} different prereg_commit values — every run must cite the one commitment commit`));
  }

  // The prereg commit's TREE must carry every frozen file, byte-identical to the
  // working inputs these checks recompute against. Asserting ancestry proved
  // nothing about content (Codex #4).
  for (const commit of seen) {
    findings.push(...verifyFrozenTree(ctx, commit));
  }
  return findings;
}

function verifyFrozenTree(ctx, commit) {
  const findings = [];
  const listed = gitOrNull(["-C", ctx.repoRoot, "ls-tree", "-r", "--name-only", commit], ctx.repoRoot);
  if (listed === null) {
    findings.push(finding("PR-019", "error", `cannot list the tree of prereg_commit ${commit}`));
    return findings;
  }
  const treeSet = new Set(listed.split("\n").filter(Boolean));
  for (const rel of FROZEN_FILES) {
    const repoRel = `${SPEC_DIR_REL}/${rel}`;
    if (!treeSet.has(repoRel)) {
      findings.push(finding("PR-019", "error", `prereg_commit ${commit} does not contain frozen file ${repoRel}`, repoRel));
      continue;
    }
    let committedSha;
    try {
      committedSha = git(["-C", ctx.repoRoot, "rev-parse", `${commit}:${repoRel}`], ctx.repoRoot);
    } catch (err) {
      findings.push(finding("PR-019", "error", `cannot read ${repoRel} at ${commit}: ${err.message}`, repoRel));
      continue;
    }
    let workingSha;
    try {
      workingSha = git(["-C", ctx.repoRoot, "hash-object", "--", ctx.abs(rel)], ctx.repoRoot);
    } catch (err) {
      findings.push(finding("PR-019", "error", `cannot hash the working copy of ${rel}: ${err.message}`, rel));
      continue;
    }
    if (committedSha !== workingSha) {
      findings.push(finding("PR-019", "error", `frozen file ${rel} differs between prereg_commit ${commit} and the inputs being validated`, rel));
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// PR-020 — manifest completeness, byte-verified, with the prompt recomputed
// ---------------------------------------------------------------------------

export function prManifestComplete(ctx) {
  const findings = [];
  const runs = collectRuns(ctx);
  const phases = phasesInScope(ctx);
  if (runs.length === 0) {
    for (const phase of phases) findings.push(absenceFinding(ctx, "PR-020", phase));
    return findings;
  }

  const frozen = loadFrozenInputs(ctx);
  for (const e of frozen.errors) findings.push(finding("PR-020", "error", `frozen inputs unreadable: ${e}`));
  const schemaRes = ctx.readJSON("schemas/run-manifest.schema.json");
  if (!schemaRes.ok) findings.push(finding("PR-020", "error", `cannot read schemas/run-manifest.schema.json: ${schemaRes.error}`));

  findings.push(...checkArmDirectoryTopology(ctx, runs, frozen, phases));

  // Tree cleanliness is verified here, not believed. A manifest claiming
  // `tree_clean: true` proves nothing about the tree (Codex #4).
  const status = gitOrNull(["-C", ctx.repoRoot, "status", "--porcelain"], ctx.repoRoot);
  const treeActuallyClean = status !== null && status.trim() === "";
  if (status === null) findings.push(finding("PR-020", "error", "cannot run git status to verify tree cleanliness independently of the manifests"));

  let providerRef = null;
  let providerRefRel = null;
  const candidateSourceHashes = allCandidateSourceHashes(frozen);

  for (const run of runs) {
    const rel = run.manifestRel || run.dirRel;
    if (run.malformed) continue; // reported by topology
    if (!run.manifest) {
      findings.push(finding("PR-020", "error", `cannot read ${rel}: ${run.readError}`, rel));
      continue;
    }
    const m = run.manifest;
    if (schemaRes.ok) {
      for (const e of validate(m, schemaRes.data)) findings.push(finding("PR-020", "error", `${rel} ${e.path}: ${e.message}`, rel));
    }

    // --- path/manifest agreement (no aliases) ---------------------------------
    if (m.phase !== run.phase) findings.push(finding("PR-020", "error", `${rel}: phase ${JSON.stringify(m.phase)} does not match its directory (${run.phase})`, rel));
    if (m.pair_id !== run.pairId) findings.push(finding("PR-020", "error", `${rel}: pair_id ${JSON.stringify(m.pair_id)} does not match its directory ${run.pairId}`, rel));
    if (m.arm !== run.arm) findings.push(finding("PR-020", "error", `${rel}: arm ${JSON.stringify(m.arm)} does not match its directory ${run.arm}`, rel));
    if (m.brief_id !== run.pairId) findings.push(finding("PR-020", "error", `${rel}: brief_id ${JSON.stringify(m.brief_id)} does not match its directory ${run.pairId}`, rel));
    const expectedRunId = `${run.pairId}-${run.arm}`;
    if (m.run_id !== expectedRunId) findings.push(finding("PR-020", "error", `${rel}: run_id ${JSON.stringify(m.run_id)} is not ${expectedRunId}`, rel));

    if (m.tree_clean !== true) findings.push(finding("PR-020", "error", `${rel}: tree_clean is not true`, rel));
    else if (!treeActuallyClean) findings.push(finding("PR-020", "error", `${rel}: tree_clean claims true but git reports a dirty tree`, rel));

    // --- provider identity is one object across the whole program -------------
    const providerStr = JSON.stringify(m.provider);
    if (providerRef === null) {
      providerRef = providerStr;
      providerRefRel = rel;
    } else if (providerStr !== providerRef) {
      findings.push(finding("PR-020", "error", `${rel}: provider object differs from ${providerRefRel}`, rel));
    }

    // --- pinned commits -------------------------------------------------------
    if (m.upstream_commit !== PINNED_COMMIT) {
      findings.push(finding("PR-020", "error", `${rel}: upstream_commit ${m.upstream_commit} is not the pinned ${PINNED_COMMIT}`, rel));
    }
    if (m.control_commit !== m.prereg_commit) {
      findings.push(finding("PR-020", "error", `${rel}: control_commit must equal prereg_commit (pinned rule P2) — got ${m.control_commit} vs ${m.prereg_commit}`, rel));
    }

    // --- brief identity, family, candidate ------------------------------------
    const entry = frozen.briefs.get(String(m.brief_id));
    if (!entry) {
      findings.push(finding("PR-020", "error", `${rel}: brief_id ${JSON.stringify(m.brief_id)} is not a frozen brief`, rel));
      continue;
    }
    if (entry.phase !== m.phase) findings.push(finding("PR-020", "error", `${rel}: brief ${m.brief_id} belongs to Phase ${entry.phase}, manifest says ${m.phase}`, rel));
    if (m.brief_hash !== entry.hash) {
      findings.push(finding("PR-020", "error", `${rel}: brief_hash ${m.brief_hash} does not recompute from the frozen brief (${entry.hash})`, rel));
    }
    const expectedFamily = entry.phase === "A" ? entry.brief.family : CANDIDATE_FAMILY[entry.brief.candidate_id];
    if (m.family !== expectedFamily) {
      findings.push(finding("PR-020", "error", `${rel}: family ${JSON.stringify(m.family)} does not match the frozen brief's ${JSON.stringify(expectedFamily)}`, rel));
    }
    if (entry.phase === "A") {
      if (m.candidate_id !== null) findings.push(finding("PR-020", "error", `${rel}: Phase-A candidate_id must be null, got ${JSON.stringify(m.candidate_id)}`, rel));
    } else {
      if (m.candidate_id !== entry.brief.candidate_id) {
        findings.push(finding("PR-020", "error", `${rel}: candidate_id ${JSON.stringify(m.candidate_id)} does not match the frozen brief's ${JSON.stringify(entry.brief.candidate_id)}`, rel));
      } else if (!frozen.candidates.has(m.candidate_id)) {
        findings.push(finding("PR-020", "error", `${rel}: candidate_id ${m.candidate_id} is not in candidate-manifest.json`, rel));
      }
    }

    // --- patch: exactly one for treatment, none for control -------------------
    const expectedPatch = expectedPatchPath(entry.brief, entry.phase, m.arm);
    let patchBytes = null;
    if (m.arm === "control") {
      if (m.patch_path !== null) findings.push(finding("PR-020", "error", `${rel}: a control arm must record patch_path null, got ${JSON.stringify(m.patch_path)}`, rel));
      if (m.patch_hash !== null) findings.push(finding("PR-020", "error", `${rel}: a control arm must record patch_hash null, got ${JSON.stringify(m.patch_hash)}`, rel));
    } else {
      if (m.patch_path !== expectedPatch) {
        findings.push(finding("PR-020", "error", `${rel}: patch_path ${JSON.stringify(m.patch_path)} is not the frozen patch for this arm (${expectedPatch})`, rel));
      } else {
        const bytes = ctx.readBytes(expectedPatch);
        if (!bytes.ok) findings.push(finding("PR-020", "error", `${rel}: cannot read patch ${expectedPatch}: ${bytes.error}`, rel));
        else {
          patchBytes = bytes.data;
          const actual = sha256File(ctx.abs(expectedPatch));
          if (m.patch_hash !== actual) findings.push(finding("PR-020", "error", `${rel}: patch_hash ${m.patch_hash} does not match ${expectedPatch} (${actual})`, rel));
        }
      }
    }

    // --- source hashes --------------------------------------------------------
    const recorded = new Set(Array.isArray(m.source_hashes) ? m.source_hashes : []);
    if (m.arm === "treatment") {
      const expected = expectedTreatmentSourceHashes(frozen, entry.phase, expectedFamily, entry.brief.candidate_id);
      const missing = [...expected].filter((h) => !recorded.has(h));
      const extra = [...recorded].filter((h) => !expected.has(h));
      if (missing.length > 0) findings.push(finding("PR-020", "error", `${rel}: source_hashes is missing ${missing.length} frozen candidate source hash(es)`, rel));
      if (extra.length > 0) findings.push(finding("PR-020", "error", `${rel}: source_hashes carries ${extra.length} hash(es) that are not this arm's frozen sources`, rel));
    } else {
      const leaked = [...recorded].filter((h) => candidateSourceHashes.has(h));
      if (leaked.length > 0) findings.push(finding("PR-020", "error", `${rel}: a control arm records ${leaked.length} candidate source hash(es) — control carries no treatment source`, rel));
    }

    // --- the prompt itself, recomputed through the one canonical assembler ----
    if (frozen.templateBytes && (m.arm === "control" || patchBytes !== null)) {
      let assembled = null;
      try {
        assembled = assembleArmPrompt({
          templateBytes: frozen.templateBytes,
          brief: entry.brief,
          phase: entry.phase,
          arm: m.arm,
          patchBytes: m.arm === "treatment" ? patchBytes : null,
          mediaManifest: frozen.mediaManifest,
        });
      } catch (err) {
        findings.push(finding("PR-020", "error", `${rel}: cannot assemble the arm prompt: ${err.message}`, rel));
      }
      if (assembled) {
        for (const leak of assembled.leaks) {
          findings.push(finding("PR-020", "error", `${rel}: P7 projection leak — ${leak}`, rel));
        }
        if (m.prompt_hash !== assembled.hash) {
          findings.push(finding("PR-020", "error", `${rel}: prompt_hash ${m.prompt_hash} does not match the canonical P7 assembly (${assembled.hash}) — the arm did not receive template + arm-visible projection${m.arm === "treatment" ? " + exactly one patch" : " and no patch"}`, rel));
        }
      }
    }

    // --- every referenced evidence file, byte-verified inside its run dir -----
    findings.push(...verifyRunEvidenceFiles(ctx, run, m, entry));
  }

  return findings;
}

/** Every path a manifest names must be a regular file inside its own run dir. */
function verifyRunEvidenceFiles(ctx, run, m, entry) {
  const findings = [];
  const dir = run.dirRel;
  const check = (label, path, sha) => {
    const res = verifyEvidenceFile(ctx, dir, path, sha);
    if (!res.ok) findings.push(finding("PR-020", "error", `${run.manifestRel}: ${label} — ${res.error}`, run.manifestRel));
  };

  if (m.artifacts?.initial) check("artifacts.initial", m.artifacts.initial.path, m.artifacts.initial.sha256);
  if (m.artifacts?.repaired) check("artifacts.repaired", m.artifacts.repaired.path, m.artifacts.repaired.sha256);
  if (m.gates?.initial) check("gates.initial", m.gates.initial.envelope_path, m.gates.initial.sha256);
  if (m.gates?.post_repair) check("gates.post_repair", m.gates.post_repair.envelope_path, m.gates.post_repair.sha256);
  if (m.console_log) check("console_log", m.console_log.path, m.console_log.sha256);
  if (m.reduced_motion_capture) check("reduced_motion_capture", m.reduced_motion_capture.path, m.reduced_motion_capture.sha256);

  const viewports = [];
  for (const shot of Array.isArray(m.screenshots) ? m.screenshots : []) {
    check(`screenshots[${shot?.viewport}]`, shot?.path, shot?.sha256);
    viewports.push(shot?.viewport);
  }
  for (const required of [390, 768, 1440]) {
    if (!viewports.includes(required)) findings.push(finding("PR-020", "error", `${run.manifestRel}: no screenshot at the required ${required}px viewport`, run.manifestRel));
  }
  if (new Set(viewports).size !== viewports.length) {
    findings.push(finding("PR-020", "error", `${run.manifestRel}: duplicate screenshot viewports`, run.manifestRel));
  }

  // Motion arms additionally receive reduced-motion capture (PREREGISTRATION.md L99).
  const family = entry?.phase === "A" ? entry.brief.family : CANDIDATE_FAMILY[entry?.brief?.candidate_id];
  if (family === "motion" && (m.reduced_motion_capture === null || m.reduced_motion_capture === undefined)) {
    findings.push(finding("PR-020", "error", `${run.manifestRel}: a motion-family arm must record a reduced-motion capture`, run.manifestRel));
  }
  return findings;
}

/**
 * Exactly one manifest per expected arm directory, and nothing else under runs/.
 * Rejects extra pairs, missing arms, stray files, aliases, and Phase-B evidence at
 * the Phase-A gate.
 */
function checkArmDirectoryTopology(ctx, runs, frozen, phases) {
  const findings = [];
  const seen = new Map();

  for (const run of runs) {
    if (run.malformed) {
      findings.push(finding("PR-020", "error", `${run.dirRel}: ${run.malformed}`, run.dirRel));
      continue;
    }
    if (!ARMS.includes(run.arm)) {
      findings.push(finding("PR-020", "error", `${run.dirRel}: ${JSON.stringify(run.arm)} is not a valid arm directory`, run.dirRel));
      continue;
    }
    const entry = frozen.briefs.get(run.pairId);
    if (!entry) {
      findings.push(finding("PR-020", "error", `${run.dirRel}: ${run.pairId} is not a frozen pair id`, run.dirRel));
      continue;
    }
    if (entry.phase !== run.phase) {
      findings.push(finding("PR-020", "error", `${run.dirRel}: pair ${run.pairId} is a Phase-${entry.phase} pair but sits under runs/phase-${run.phase.toLowerCase()}/`, run.dirRel));
      continue;
    }
    if (!ctx.exists(run.manifestRel)) {
      findings.push(finding("PR-020", "error", `${run.dirRel}: no run-manifest.json`, run.dirRel));
    }
    const key = `${run.phase}/${run.pairId}/${run.arm}`;
    if (seen.has(key)) findings.push(finding("PR-020", "error", `${run.dirRel}: duplicate arm directory for ${key}`, run.dirRel));
    seen.set(key, run);
  }

  // Both arms must exist for every rendered pair.
  const pairs = new Map();
  for (const key of seen.keys()) {
    const [phase, pairId, arm] = key.split("/");
    const set = pairs.get(`${phase}/${pairId}`) || new Set();
    set.add(arm);
    pairs.set(`${phase}/${pairId}`, set);
  }
  for (const [pairKey, arms] of pairs) {
    for (const arm of ARMS) {
      if (!arms.has(arm)) findings.push(finding("PR-020", "error", `pair ${pairKey}: no ${arm} arm directory — a pair is rendered as a pair or not at all`, pairKey));
    }
  }

  // Phase-A completeness: all 16 frozen pairs × 2 arms, no more, no fewer.
  if (phases.includes("A") && phaseARequired(ctx)) {
    const phaseAPairs = [...frozen.briefs.entries()].filter(([, v]) => v.phase === "A").map(([id]) => id);
    if (phaseAPairs.length !== PHASE_A_PAIRS) {
      findings.push(finding("PR-020", "error", `frozen Phase-A pair count is ${phaseAPairs.length}, expected ${PHASE_A_PAIRS}`));
    }
    for (const pairId of phaseAPairs) {
      for (const arm of ARMS) {
        if (!seen.has(`A/${pairId}/${arm}`)) {
          findings.push(finding("PR-020", "error", `Phase-A gate: missing run for ${pairId} ${arm} — all ${PHASE_A_PAIRS} pairs × 2 arms must be rendered`, pairId));
        }
      }
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// PR-021 repair-legality — unchanged semantics, phase-scoped and absence-aware
// ---------------------------------------------------------------------------

export function prRepairLegality(ctx) {
  const findings = [];
  const runs = collectRuns(ctx).filter((r) => r.manifest);
  if (runs.length === 0) {
    for (const phase of phasesInScope(ctx)) findings.push(absenceFinding(ctx, "PR-021", phase));
    return findings;
  }
  for (const run of runs) {
    const rel = run.manifestRel;
    const m = run.manifest;
    const initialPass = m.gates?.initial?.pass;
    const hasRepaired = m.artifacts?.repaired !== null && m.artifacts?.repaired !== undefined;
    if (initialPass === true && hasRepaired) findings.push(finding("PR-021", "error", `${rel}: initial gates all passed but a repaired artifact exists`, rel));
    if (hasRepaired && m.repair?.performed !== true) findings.push(finding("PR-021", "error", `${rel}: repaired artifact exists but repair.performed is not true`, rel));
    if (!hasRepaired && m.repair?.performed === true) findings.push(finding("PR-021", "error", `${rel}: repair.performed=true but no repaired artifact recorded`, rel));
    const primary = m.artifacts?.primary;
    if (hasRepaired && primary !== "repaired") findings.push(finding("PR-021", "error", `${rel}: repaired artifact exists but artifacts.primary is not "repaired"`, rel));
    if (!hasRepaired && primary !== "initial") findings.push(finding("PR-021", "error", `${rel}: no repaired artifact but artifacts.primary is not "initial"`, rel));
    // Exactly one repair, and only after a listed machine gate failed.
    const hasPostRepairGate = m.gates?.post_repair !== null && m.gates?.post_repair !== undefined;
    if (hasRepaired !== hasPostRepairGate) {
      findings.push(finding("PR-021", "error", `${rel}: a repaired artifact and a post_repair gate envelope must appear together`, rel));
    }
    if (!hasRepaired && m.repair?.findings_hash !== null && m.repair?.findings_hash !== undefined) {
      findings.push(finding("PR-021", "error", `${rel}: repair.findings_hash is recorded but no repair was performed`, rel));
    }
    if (hasRepaired && (m.repair?.findings_hash === null || m.repair?.findings_hash === undefined)) {
      findings.push(finding("PR-021", "error", `${rel}: a repair was performed but repair.findings_hash is null — the machine findings the repair saw are unrecorded`, rel));
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// PR-022 no-regeneration — at most one initial + one repaired artifact per arm
// ---------------------------------------------------------------------------

export function prNoRegeneration(ctx) {
  const findings = [];
  const dirs = enumerateArmDirs(ctx, phasesInScope(ctx)).filter((d) => !d.malformed);
  if (dirs.length === 0) {
    for (const phase of phasesInScope(ctx)) findings.push(absenceFinding(ctx, "PR-022", phase));
    return findings;
  }
  const allowed = new Set(["artifact-initial.html", "artifact-repaired.html"]);
  for (const dir of dirs) {
    const entries = ctx.exists(dir.dirRel) ? readdirNames(ctx, dir.dirRel) : [];
    const htmlFiles = entries.filter((f) => f.toLowerCase().endsWith(".html"));
    const extra = htmlFiles.filter((f) => !allowed.has(f));
    if (extra.length > 0) findings.push(finding("PR-022", "error", `${dir.dirRel}: unexpected extra artifact file(s): ${extra.join(", ")}`, dir.dirRel));
    const manifests = entries.filter((f) => f === "run-manifest.json");
    if (manifests.length !== 1) findings.push(finding("PR-022", "error", `${dir.dirRel}: expected exactly one run-manifest.json, found ${manifests.length}`, dir.dirRel));
  }
  return findings;
}

function readdirNames(ctx, rel) {
  try {
    return readdirSync(ctx.abs(rel));
  } catch {
    return [];
  }
}
