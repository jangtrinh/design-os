// scripts/lib/constants.mjs
//
// Shared frozen constants for spec 022 (see BUILD-CONTRACT "Frozen constants" table
// and architecture §A file plan). Single source of truth so validate-prereg.mjs,
// enumerate-selection.mjs, and make-randomization-map.mjs never disagree.

import { homedir } from "node:os";
import { join } from "node:path";

export const PINNED_COMMIT = "21b278c62f49f3ce3d8c8ecbcc84cbcd534f3e49";

// AC-11 — the owner-pinned custody path for the secret randomization map.
//
// PR-016 requires `secret_map_location` to equal this EXACTLY, not merely to sit
// outside the repo. That closes the fake-commitment route deterministically: the
// AC-11 dry-run that proves the map tooling works must run in a sandbox with HOME
// overridden, so any commitment born from that dry-run carries a temp path and is
// rejected on sight. A hash blocklist would have required remembering every
// throwaway map's hash — a registry that can be forgotten; a path pin cannot be.
//
// Read through `homedir()` (which honours $HOME on POSIX) rather than hardcoded, so
// the sandbox dry-run can exercise the real path SHAPE without ever writing to the
// real home — writing the real map early would permanently brick the pilot's
// one-shot generation, since make-randomization-map.mjs refuses to rerun and the
// protocol forbids regenerating the map.
export const SECRET_MAP_CUSTODY_SEGMENTS = Object.freeze([".design-os", "prereg-022", "randomization-map.secret.json"]);

export function ownerCustodyPath() {
  return ownerSecretMapPath(homedir());
}

// R7 (amendment item 7 / Fable AC-11 refinement 2) — the exact names the spec's
// generator and check share, so there is exactly one source of truth for the
// segments AND for how they resolve against a given home directory (the
// sandbox dry-run in AC-11's proof passes a temp `home`; the real generator
// passes `homedir()`). `OWNER_SECRET_MAP_REL` and `SECRET_MAP_CUSTODY_SEGMENTS`
// are the same segments under two names — kept both because
// `checks-commitment.mjs`'s existing mutation coverage targets the original
// name via `ownerCustodyPath()`, which now delegates to `ownerSecretMapPath`.
export const OWNER_SECRET_MAP_REL = SECRET_MAP_CUSTODY_SEGMENTS;

export function ownerSecretMapPath(home) {
  return join(home, ...OWNER_SECRET_MAP_REL);
}

// Validator modes, in ascending strictness. Later modes run all earlier modes'
// checks (architecture §H), EXCEPT where a check is explicitly mode-scoped.
//
// "post-phase-a" is the Phase-A gate (F3): Phase-A run evidence is REQUIRED, Phase-B
// evidence and any reveal are FORBIDDEN, and the full post-render integrity, judging,
// vote, curator, duplicate, contradiction, result and truth-table check set runs
// scoped to Phase A. It is no longer an alias for "pre-render" — treating it as one
// meant a genuinely completed Phase A could never pass its own gate (Codex Stage-5
// BLOCKER #3).
export const MODES = ["pre-freeze", "pre-render", "post-phase-a", "post-render", "post-reveal"];

export function modeIndex(mode) {
  return MODES.indexOf(mode);
}

export const CANDIDATE_IDS = ["A1", "A2", "A3", "M1", "M2", "M3", "D1", "D2", "D3", "D4", "P1", "P2"];

export const CANDIDATE_FAMILY = {
  A1: "aesthetics",
  A2: "aesthetics",
  A3: "aesthetics",
  M1: "motion",
  M2: "motion",
  M3: "motion",
  D1: "devices",
  D2: "devices",
  D3: "devices",
  D4: "devices",
  P1: "media",
  P2: "media",
};

export const FAMILIES = ["aesthetics", "motion", "devices", "media"];

// The four Phase-A family patch files (architecture §E.3).
export const PHASE_A_FAMILY_PATCHES = ["aesthetics", "motion", "devices", "media"];

// Every file the freeze commit must carry, EXCEPT randomization-commitment.json
// (produced by the second, later commitment commit — BUILD-CONTRACT P3) and runs/
// (post-render evidence, absent at freeze). Paths are relative to the spec dir.
export const FROZEN_FILES = [
  "spec.md",
  "PREREGISTRATION.md",
  "roles.md",
  "arm-prompt-template.md",
  "selection-manifest.json",
  "selection-failures.json",
  "candidate-manifest.json",
  "phase-a-briefs.json",
  "phase-b-briefs.json",
  "repair-prompt.md",
  "owner-form.md",
  "curator-form.md",
  "reconciliation.md",
  "reconciliation/mengto-skills-opus5-report.md",
  "reconciliation/mengto-fable-initial.md",
  "reconciliation/mengto-codex-crosscheck.md",
  "reconciliation/mengto-fable-final.md",
  "reconciliation/mengto-crossmodel-strategy.md",
  "patches/phase-a/aesthetics.md",
  "patches/phase-a/motion.md",
  "patches/phase-a/devices.md",
  "patches/phase-a/media.md",
  "patches/phase-b/A1.md",
  "patches/phase-b/A2.md",
  "patches/phase-b/A3.md",
  "patches/phase-b/M1.md",
  "patches/phase-b/M2.md",
  "patches/phase-b/M3.md",
  "patches/phase-b/D1.md",
  "patches/phase-b/D2.md",
  "patches/phase-b/D3.md",
  "patches/phase-b/D4.md",
  "patches/phase-b/P1.md",
  "patches/phase-b/P2.md",
  "schemas/run-manifest.schema.json",
  "schemas/result.schema.json",
  "schemas/selection-manifest.schema.json",
  "schemas/selection-failure.schema.json",
  "schemas/candidate-manifest.schema.json",
  "schemas/owner-vote.schema.json",
  "schemas/curator-score.schema.json",
  "schemas/randomization-commitment.schema.json",
  "schemas/phase-a-briefs.schema.json",
  "schemas/phase-b-briefs.schema.json",
  "schemas/freeze-envelope.schema.json",
  "schemas/phase-a-survival.schema.json",
  "assets/brief-media-manifest.json",
  "scripts/validate-prereg.mjs",
  "scripts/enumerate-selection.mjs",
  "scripts/make-randomization-map.mjs",
  "scripts/build-judging-bundle.mjs",
  // The validator's own library modules are frozen inputs too: PR-020's prompt
  // recomputation and PR-027's result recomputation are only as trustworthy as the
  // code that performs them, so the prereg commit must carry those exact bytes.
  "scripts/lib/checks-briefs.mjs",
  "scripts/lib/checks-candidates.mjs",
  "scripts/lib/checks-commitment.mjs",
  "scripts/lib/checks-files.mjs",
  "scripts/lib/checks-freeze.mjs",
  "scripts/lib/checks-judging.mjs",
  "scripts/lib/checks-phase-a.mjs",
  "scripts/lib/checks-render.mjs",
  "scripts/lib/checks-results.mjs",
  "scripts/lib/checks-reveal.mjs",
  "scripts/lib/checks-run-evidence.mjs",
  "scripts/lib/checks-selection.mjs",
  "scripts/lib/constants.mjs",
  "scripts/lib/context.mjs",
  "scripts/lib/evidence.mjs",
  "scripts/lib/findings.mjs",
  "scripts/lib/freeze.mjs",
  "scripts/lib/frozen-inputs.mjs",
  "scripts/lib/git.mjs",
  "scripts/lib/hash.mjs",
  "scripts/lib/identity-tokens.mjs",
  "scripts/lib/prompt-assembler.mjs",
  "scripts/lib/randomization-map.mjs",
  "scripts/lib/schema.mjs",
];

// Where FROZEN_FILES live inside the repo (used when checking git HEAD's tree).
export const SPEC_DIR_REL = "specs/022-taste-transfer-prereg";

// Frozen program shape (PREREGISTRATION.md §Arithmetic). Counted, never assumed —
// the checks recompute these from the committed brief files and compare.
export const PHASE_A_PAIRS = 16;
export const PHASE_A_ARMS = 32;
export const ARMS = ["control", "treatment"];

// Curator axes and critical-regression keys (PREREGISTRATION.md §Curator veto).
export const CURATOR_AXES = [
  "authored_detail",
  "hierarchy_composition",
  "typography_content_fit",
  "interaction_completeness",
  "responsive_craft",
  "brief_fidelity",
];

export const CURATOR_CRITICAL_REGRESSIONS = [
  "accessibility_behavior",
  "interaction_coherence",
  "responsive_integrity",
  "content_fidelity",
  "contradiction_leakage",
];

// The veto also fires when a treatment axis sits this far below control.
export const CURATOR_AXIS_VETO_DELTA = 2;
