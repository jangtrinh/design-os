/**
 * Spec-022 later-phase gate tests — complete positive lifecycles plus isolated
 * adversarial mutations for every fail-closed rule from PR-016 through PR-031.
 *
 * Fix-spec F8. Before this file, mutation coverage stopped at the pre-render
 * commitment checks: there were no tests for P7 projection leakage, prompt/hash
 * substitution, run-evidence hashes, control/prereg commit equality, Phase-A
 * gating, vote or curator coverage, freeze ordering, commitment reveal, result
 * recomputation, truth-table vetoes, or all-candidate advancement — so the claim
 * that every fail-closed validator class had adversarial mutations was false
 * (Codex Stage-5 finding #8).
 *
 * Every test drives the validator ONLY through its CLI contract, against a
 * throwaway git repo built by `spec-022-lifecycle.ts`. Mutations are committed
 * before validation so the clean-tree check never masks the rule under test.
 */
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildLifecycle,
  commitMutation,
  git,
  must,
  readSpecJson,
  runValidator,
  sha256Hex,
  specPath,
  writeSpecFile,
  writeSpecJson,
  type Envelope,
  type Fixture,
  type RunResult,
} from "./spec-022-lifecycle.js";

// ---------------------------------------------------------------------------
// Narrow shapes for the artifacts these tests mutate
// ---------------------------------------------------------------------------

interface RunManifest {
  run_id: string;
  pair_id: string;
  phase: string;
  family: string;
  candidate_id: string | null;
  arm: string;
  brief_id: string;
  brief_hash: string;
  prereg_commit: string;
  control_commit: string;
  upstream_commit: string;
  patch_path: string | null;
  patch_hash: string | null;
  source_hashes: string[];
  prompt_hash: string;
  tree_clean: boolean;
  artifacts: { initial: { path: string; sha256: string }; repaired: unknown; primary: string };
  gates: { initial: { envelope_path: string; sha256: string; pass: boolean }; post_repair: unknown };
  console_log: { path: string; sha256: string };
  screenshots: { viewport: number; path: string; sha256: string }[];
  reduced_motion_capture: unknown;
  [key: string]: unknown;
}

interface ResultFile {
  pair_id: string;
  treatment_win: boolean | null;
  non_confirmatory_reason: string | null;
  duplicate_consistent: boolean | null;
  contradiction_result: string;
  repair_reduction: number | null;
  arms: Record<string, { eligible: boolean; initial_pass: boolean; post_repair_pass: boolean | null; run_id: string; primary_artifact_sha256: string }>;
  presentations: { presentation_id: string; owner_vote_path: string; owner_vote_sha256: string; endpoint_primary: boolean }[];
  curator_scores: { codename: string; path: string; sha256: string }[];
  revealed_assignment: { left: string; right: string };
  [key: string]: unknown;
}

interface FreezeEnvelope {
  version: string;
  kind: string;
  phase: string;
  evidence_commit: string;
  files: { file: string; sha256: string }[];
  frozen_at: string;
}

interface SurvivalFile {
  families: { family: string; ordinary_pair_ids: string[]; ordinary_treatment_wins: number; survives: boolean; stop_reason: string | null }[];
  [key: string]: unknown;
}

interface OwnerVote {
  presentation_id: string;
  left_code: string;
  right_code: string;
  forced_preference: string;
  both_fail: boolean;
  [key: string]: unknown;
}

interface CuratorScore {
  codename: string;
  axes: Record<string, number>;
  critical_regressions: Record<string, { fired: boolean; note: string }>;
  anti_context_leak: { fired: boolean; note: string } | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Shared valid fixtures — built once, copied per mutation would be cheaper but
// each stage's tree differs, so each stage gets one long-lived fixture and every
// mutation test builds its own throwaway.
// ---------------------------------------------------------------------------

const openFixtures: Fixture[] = [];

function fixture(upTo: "pre-render" | "post-phase-a" | "post-render" | "post-reveal", survivors?: string[]): Fixture {
  const f = buildLifecycle({ upTo, ...(survivors ? { survivors } : {}) });
  openFixtures.push(f);
  return f;
}

afterAll(() => {
  for (const f of openFixtures) f.cleanup();
  openFixtures.length = 0;
});

/** Build a fixture, mutate it, commit, validate, and always clean up. */
function withMutation(
  upTo: "pre-render" | "post-phase-a" | "post-render" | "post-reveal",
  mutate: (f: Fixture) => void,
  mode?: string,
  survivors?: string[],
): RunResult {
  const f = buildLifecycle({ upTo, ...(survivors ? { survivors } : {}) });
  try {
    mutate(f);
    commitMutation(f.root);
    return runValidator(f.root, mode ?? upTo, undefined, f.secretDir);
  } finally {
    f.cleanup();
  }
}

function expectCheckError(result: RunResult, checkId: string): void {
  expect(result.envelope).not.toBeNull();
  const envelope = result.envelope as Envelope;
  const hit = envelope.findings.filter((f) => f.checkId === checkId && f.severity === "error");
  expect(hit.length, `expected ${checkId} to fire; findings: ${JSON.stringify(envelope.findings.slice(0, 12))}`).toBeGreaterThan(0);
  expect(result.status).toBe(1);
}

function expectNoCheckError(result: RunResult, checkId: string): void {
  expect(result.envelope).not.toBeNull();
  const envelope = result.envelope as Envelope;
  const hits = envelope.findings.filter((f) => f.checkId === checkId && f.severity === "error");
  expect(hits, `expected ${checkId} NOT to fire; got ${JSON.stringify(hits)}`).toEqual([]);
}

function errorsOf(result: RunResult): string {
  const envelope = result.envelope as Envelope | null;
  if (!envelope) return "(no envelope)";
  return JSON.stringify(envelope.findings.filter((f) => f.severity === "error"), null, 1);
}

function firstPhaseAPair(f: Fixture): string {
  return must(f.renderedPairs[0], "expected at least one rendered pair");
}

function manifestRel(pairId: string, arm: string): string {
  const phaseDir = pairId.startsWith("PA-") ? "phase-a" : "phase-b";
  return `runs/${phaseDir}/${pairId}/${arm}/run-manifest.json`;
}

function editManifest(f: Fixture, pairId: string, arm: string, edit: (m: RunManifest) => void): void {
  const rel = manifestRel(pairId, arm);
  const m = readSpecJson<RunManifest>(f.root, rel);
  edit(m);
  writeSpecJson(f.root, rel, m);
}

function editResult(f: Fixture, pairId: string, edit: (r: ResultFile) => void): void {
  const rel = `runs/results/${pairId}.json`;
  const r = readSpecJson<ResultFile>(f.root, rel);
  edit(r);
  writeSpecJson(f.root, rel, r);
}

// ===========================================================================
// Positive lifecycles — the gate passes a genuinely valid program
// ===========================================================================

describe("complete positive lifecycles", () => {
  it("pre-render: a committed freeze + commitment with no renders is green", () => {
    const f = fixture("pre-render");
    const result = runValidator(f.root, "pre-render", undefined, f.secretDir);
    expect(errorsOf(result)).toBe("[]");
    expect(result.status).toBe(0);
  });

  it("post-phase-a: a COMPLETE Phase A — 32 arms, 20 votes, 32 curator scores, both freezes, 16 results — passes its own gate", () => {
    const f = fixture("post-phase-a");
    const result = runValidator(f.root, "post-phase-a", undefined, f.secretDir);
    expect(errorsOf(result)).toBe("[]");
    expect(result.status).toBe(0);
  });

  it("post-render: Phase A plus the surviving family's Phase-B renders is green", () => {
    const f = fixture("post-render");
    const result = runValidator(f.root, "post-render", undefined, f.secretDir);
    expect(errorsOf(result)).toBe("[]");
    expect(result.status).toBe(0);
  });

  it("post-reveal: the full lifecycle through a committed reveal is green", () => {
    const f = fixture("post-reveal");
    const result = runValidator(f.root, "post-reveal", undefined, f.secretDir);
    expect(errorsOf(result)).toBe("[]");
    expect(result.status).toBe(0);
  });

  it("post-phase-a runs the later check set, not the pre-render one (PR-031 participates)", () => {
    const f = fixture("post-phase-a");
    const result = runValidator(f.root, "post-phase-a", undefined, f.secretDir);
    // A valid gate emits no PR-017 "runs/ is non-empty" error even though runs/ is full.
    const envelope = result.envelope as Envelope;
    expect(envelope.findings.some((x) => x.checkId === "PR-017")).toBe(false);
  });
});

// ===========================================================================
// PR-019 — prereg commit identity and frozen-tree bytes
// ===========================================================================

describe("PR-019 prereg-commit recorded", () => {
  it("a prereg_commit that is a real ancestor but NOT the commitment commit errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const freezeCommit = git(f.root, ["rev-list", "--max-parents=0", "HEAD"]);
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.prereg_commit = freezeCommit;
        m.control_commit = freezeCommit;
      });
    });
    expectCheckError(result, "PR-019");
  });

  it("run manifests citing two different prereg_commits error", () => {
    const result = withMutation("post-phase-a", (f) => {
      const freezeCommit = git(f.root, ["rev-list", "--max-parents=0", "HEAD"]);
      editManifest(f, firstPhaseAPair(f), "treatment", (m) => {
        m.prereg_commit = freezeCommit;
        m.control_commit = freezeCommit;
      });
    });
    expectCheckError(result, "PR-019");
  });

  it("a frozen file changed after the prereg commit errors — the tree the runs cite no longer matches the inputs", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = specPath(f.root, "roles.md");
      writeFileSync(p, readFileSync(p, "utf8") + "\ntampered after freeze\n");
    });
    expectCheckError(result, "PR-019");
  });
});

// ===========================================================================
// PR-020 — the P7 prompt recomputation and byte-level evidence
// ===========================================================================

describe("PR-020 prompt recomputation (F1)", () => {
  it("a prompt_hash computed over the RAW brief — candidate_id, brief_id and probe intact — is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      const pairId = firstPhaseAPair(f);
      const template = readFileSync(specPath(f.root, "arm-prompt-template.md"));
      const briefs = readSpecJson<{ briefs: Record<string, unknown>[] }>(f.root, "phase-a-briefs.json");
      const brief = must(briefs.briefs.find((b) => b.brief_id === pairId), "brief");
      // The pre-F1 assembly: template + the raw brief object, no projection.
      const raw = Buffer.concat([template, Buffer.from(JSON.stringify(brief), "utf8")]);
      editManifest(f, pairId, "control", (m) => {
        m.prompt_hash = sha256Hex(raw);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a control arm whose prompt_hash includes the treatment patch is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      const pairId = firstPhaseAPair(f);
      const treatment = readSpecJson<RunManifest>(f.root, manifestRel(pairId, "treatment"));
      editManifest(f, pairId, "control", (m) => {
        m.prompt_hash = treatment.prompt_hash;
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a control arm that records a patch_path/patch_hash at all is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      const pairId = firstPhaseAPair(f);
      const treatment = readSpecJson<RunManifest>(f.root, manifestRel(pairId, "treatment"));
      editManifest(f, pairId, "control", (m) => {
        m.patch_path = treatment.patch_path;
        m.patch_hash = treatment.patch_hash;
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a treatment arm carrying the WRONG family patch is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "treatment", (m) => {
        m.patch_path = "patches/phase-a/motion.md";
        m.patch_hash = sha256Hex(readFileSync(specPath(f.root, "patches/phase-a/motion.md")));
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a treatment arm with a MISSING patch is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "treatment", (m) => {
        m.patch_path = null;
        m.patch_hash = null;
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a patch_hash that does not match the frozen patch bytes is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "treatment", (m) => {
        m.patch_hash = "b".repeat(64);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a Phase-B treatment arm's prompt_hash must reflect the Phase-B projection (leak_definition removed)", () => {
    const result = withMutation("post-render", (f) => {
      const pairId = must(f.renderedPairs.find((p) => p.startsWith("PB-")), "expected a Phase-B pair");
      const template = readFileSync(specPath(f.root, "arm-prompt-template.md"));
      const briefs = readSpecJson<{ briefs: Record<string, unknown>[] }>(f.root, "phase-b-briefs.json");
      const brief = must(briefs.briefs.find((b) => b.brief_id === pairId), "brief");
      const patch = readFileSync(specPath(f.root, `patches/phase-b/${String(brief.candidate_id)}.md`));
      const raw = Buffer.concat([template, Buffer.from(JSON.stringify(brief), "utf8"), patch]);
      editManifest(f, pairId, "treatment", (m) => {
        m.prompt_hash = sha256Hex(raw);
      });
    });
    expectCheckError(result, "PR-020");
  });
});

describe("PR-020 pinned cross-field relationships (F2)", () => {
  it("control_commit !== prereg_commit errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const freezeCommit = git(f.root, ["rev-list", "--max-parents=0", "HEAD"]);
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.control_commit = freezeCommit;
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("an upstream_commit that is not the pinned corpus commit errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.upstream_commit = "0".repeat(40);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a manifest whose pair_id disagrees with its directory errors (no path aliases)", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.pair_id = "PA-MOT-1";
        m.brief_id = "PA-MOT-1";
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a manifest whose arm disagrees with its directory errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.arm = "treatment";
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a Phase-A manifest with a non-null candidate_id errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.candidate_id = "A1";
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a brief_hash that does not recompute from the frozen brief errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.brief_hash = "c".repeat(64);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a control arm carrying a candidate source hash errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const pairId = firstPhaseAPair(f);
      const treatment = readSpecJson<RunManifest>(f.root, manifestRel(pairId, "treatment"));
      editManifest(f, pairId, "control", (m) => {
        m.source_hashes = [must(treatment.source_hashes[0], "source hash")];
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a treatment arm missing one of its frozen source hashes errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "treatment", (m) => {
        m.source_hashes = ["d".repeat(64)];
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("tree_clean:true while the tree is actually dirty errors", () => {
    const f = buildLifecycle({ upTo: "post-phase-a" });
    try {
      writeFileSync(specPath(f.root, "runs/phase-a/UNTRACKED.txt"), "dirty\n");
      const result = runValidator(f.root, "post-phase-a", undefined, f.secretDir); // deliberately NOT committed
      expectCheckError(result, "PR-020");
    } finally {
      f.cleanup();
    }
  });
});

describe("PR-020 evidence bytes (F2)", () => {
  it("an artifact whose recorded sha256 does not match its bytes errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.artifacts.initial.sha256 = "e".repeat(64);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a gate envelope whose recorded sha256 does not match errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.gates.initial.sha256 = "f".repeat(64);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a console log whose recorded sha256 does not match errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.console_log.sha256 = "a".repeat(64);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a screenshot whose recorded sha256 does not match errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        const shot = must(m.screenshots[0], "screenshot");
        shot.sha256 = "b".repeat(64);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("an artifact path that escapes its run directory errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const pairId = firstPhaseAPair(f);
      writeSpecFile(f.root, "runs/outside-artifact.html", "<html></html>\n");
      editManifest(f, pairId, "control", (m) => {
        m.artifacts.initial.path = "runs/../runs/outside-artifact.html";
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("an absolute artifact path errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.artifacts.initial.path = "/etc/hosts";
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("an artifact that is a symlink errors even when the link target hashes correctly", () => {
    const result = withMutation("post-phase-a", (f) => {
      const pairId = firstPhaseAPair(f);
      const dirRel = `runs/phase-a/${pairId}/control`;
      const target = specPath(f.root, `${dirRel}/artifact-initial.html`);
      const link = specPath(f.root, `${dirRel}/artifact-link.html`);
      symlinkSync(target, link);
      editManifest(f, pairId, "control", (m) => {
        m.artifacts.initial.path = `${dirRel}/artifact-link.html`;
        m.artifacts.initial.sha256 = sha256Hex(readFileSync(target));
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a missing screenshot viewport errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.screenshots = m.screenshots.filter((s) => s.viewport !== 1440);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a motion-family arm with no reduced-motion capture errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, "PA-MOT-1", "control", (m) => {
        m.reduced_motion_capture = null;
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a pair rendered with only one arm errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      rmSync(specPath(f.root, `runs/phase-a/${firstPhaseAPair(f)}/treatment`), { recursive: true, force: true });
    });
    expectCheckError(result, "PR-020");
  });

  it("a missing Phase-A pair errors at the Phase-A gate — all 16 pairs are required", () => {
    const result = withMutation("post-phase-a", (f) => {
      rmSync(specPath(f.root, "runs/phase-a/PA-DEV-3"), { recursive: true, force: true });
    });
    expectCheckError(result, "PR-020");
  });

  it("an arm directory whose name is not a frozen pair id errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      writeSpecFile(f.root, "runs/phase-a/PA-XXX-9/control/run-manifest.json", "{}\n");
    });
    expectCheckError(result, "PR-020");
  });
});

// ===========================================================================
// PR-021 / PR-022 — repair legality and no-regeneration
// ===========================================================================

describe("PR-021 repair legality", () => {
  it("a repaired artifact after an all-pass initial gate errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const pairId = firstPhaseAPair(f);
      const dirRel = `runs/phase-a/${pairId}/control`;
      const html = "<!doctype html><html lang=\"en\"><head><title>r</title></head><body></body></html>\n";
      writeSpecFile(f.root, `${dirRel}/artifact-repaired.html`, html);
      editManifest(f, pairId, "control", (m) => {
        m.artifacts.repaired = { path: `${dirRel}/artifact-repaired.html`, sha256: sha256Hex(html) };
        m.artifacts.primary = "repaired";
        m.repair = { performed: true, findings_hash: sha256Hex("findings") };
      });
    });
    expectCheckError(result, "PR-021");
  });

  it("repair.performed=true with no repaired artifact errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, firstPhaseAPair(f), "control", (m) => {
        m.repair = { performed: true, findings_hash: sha256Hex("findings") };
      });
    });
    expectCheckError(result, "PR-021");
  });
});

describe("PR-022 no-regeneration", () => {
  it("a second regenerated artifact file in a run directory errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      writeSpecFile(f.root, `runs/phase-a/${firstPhaseAPair(f)}/control/artifact-attempt-2.html`, "<html></html>\n");
    });
    expectCheckError(result, "PR-022");
  });
});

// ===========================================================================
// PR-023 / PR-024 / PR-030 — blinding, vote coverage, curator shape
// ===========================================================================

describe("PR-023 blinding leak scan", () => {
  it("an arm name leaked into a judging bundle's contents errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id)), "presentation");
      writeSpecFile(f.root, `runs/judging/${p.presentation_id}/notes.md`, "This side is the treatment arm.\n");
    });
    expectCheckError(result, "PR-023");
  });

  it("a candidate label leaked into a judging bundle errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id)), "presentation");
      writeSpecFile(f.root, `runs/judging/${p.presentation_id}/notes.md`, "Built with candidate A1 guidance.\n");
    });
    expectCheckError(result, "PR-023");
  });

  it("an 8-hex codename that merely CONTAINS a candidate label does not false-positive", () => {
    const f = fixture("post-phase-a");
    const result = runValidator(f.root, "post-phase-a", undefined, f.secretDir);
    const envelope = result.envelope as Envelope;
    // The real proof is the green baseline, but assert the specific class too.
    expect(envelope.findings.some((x) => x.checkId === "PR-023")).toBe(false);
  });
});

describe("PR-024 vote coverage", () => {
  it("a judging bundle with no owner vote errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id)), "presentation");
      rmSync(specPath(f.root, `runs/votes/${p.presentation_id}.json`), { force: true });
    });
    expectCheckError(result, "PR-024");
  });

  it("an owner vote with an empty reason errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id)), "presentation");
      const rel = `runs/votes/${p.presentation_id}.json`;
      const vote = readSpecJson<OwnerVote>(f.root, rel);
      vote.reason = "   ";
      writeSpecJson(f.root, rel, vote);
    });
    expectCheckError(result, "PR-024");
  });
});

describe("PR-030 curator blindness shape", () => {
  it("a curator score carrying an arm-assignment field errors (additionalProperties:false)", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id) && x.endpoint_primary), "presentation");
      const rel = `runs/curator/${p.left_code}.json`;
      const score = readSpecJson<CuratorScore>(f.root, rel);
      score.arm = "treatment";
      writeSpecJson(f.root, rel, score);
    });
    expectCheckError(result, "PR-030");
  });
});

// ===========================================================================
// PR-031 — the Phase-A gate itself (F3)
// ===========================================================================

describe("PR-031 Phase-A gate", () => {
  it("Phase-B evidence at the Phase-A gate is forbidden", () => {
    const result = withMutation("post-phase-a", (f) => {
      writeSpecFile(f.root, "runs/phase-b/PB-A1-1/control/run-manifest.json", "{}\n");
    });
    expectCheckError(result, "PR-031");
  });

  it("a full reveal at the Phase-A gate is forbidden", () => {
    const result = withMutation("post-phase-a", (f) => {
      writeSpecFile(f.root, "runs/reveal/randomization-map.json", "{}\n");
    });
    expectCheckError(result, "PR-031");
  });

  it("a secret map whose bytes no longer hash to the commitment errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const map = JSON.parse(readFileSync(f.secretMapPath, "utf8")) as { presentations: unknown[] };
      map.presentations = map.presentations.slice(1);
      writeFileSync(f.secretMapPath, JSON.stringify(map, null, 2));
    });
    expectCheckError(result, "PR-031");
  });

  it("an owner vote missing for one of the 20 Phase-A presentations errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => x.phase === "A" && x.is_duplicate && !x.endpoint_primary), "duplicate presentation");
      rmSync(specPath(f.root, `runs/votes/${p.presentation_id}.json`), { force: true });
      const envelope = readSpecJson<FreezeEnvelope>(f.root, "runs/votes/FREEZE.json");
      envelope.files = envelope.files.filter((x) => x.file !== `${p.presentation_id}.json`);
      writeSpecJson(f.root, "runs/votes/FREEZE.json", envelope);
    });
    expectCheckError(result, "PR-031");
  });

  it("a curator score file that matches no endpoint codename errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      writeSpecJson(f.root, "runs/curator/deadbeef.json", { codename: "deadbeef" });
    });
    expectCheckError(result, "PR-031");
  });

  it("a FREEZE.json that omits a file present in its directory errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const envelope = readSpecJson<FreezeEnvelope>(f.root, "runs/votes/FREEZE.json");
      envelope.files = envelope.files.slice(1);
      writeSpecJson(f.root, "runs/votes/FREEZE.json", envelope);
    });
    expectCheckError(result, "PR-031");
  });

  it("a FREEZE.json whose recorded hash does not match the frozen file errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const envelope = readSpecJson<FreezeEnvelope>(f.root, "runs/votes/FREEZE.json");
      must(envelope.files[0], "file").sha256 = "a".repeat(64);
      writeSpecJson(f.root, "runs/votes/FREEZE.json", envelope);
    });
    expectCheckError(result, "PR-031");
  });

  it("a recorded survivor that does not recompute from the votes errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const survival = readSpecJson<SurvivalFile>(f.root, "runs/results/phase-a-survival.json");
      const motion = must(survival.families.find((x) => x.family === "motion"), "motion row");
      motion.survives = true;
      motion.ordinary_treatment_wins = 3;
      motion.stop_reason = null;
      writeSpecJson(f.root, "runs/results/phase-a-survival.json", survival);
    });
    expectCheckError(result, "PR-031");
  });

  it("counting the contradiction brief toward survival errors — it is diagnostic only", () => {
    const result = withMutation("post-phase-a", (f) => {
      const survival = readSpecJson<SurvivalFile>(f.root, "runs/results/phase-a-survival.json");
      const aesthetics = must(survival.families.find((x) => x.family === "aesthetics"), "aesthetics row");
      aesthetics.ordinary_pair_ids = ["PA-AES-1", "PA-AES-2", "PA-AES-4"];
      writeSpecJson(f.root, "runs/results/phase-a-survival.json", survival);
    });
    expectCheckError(result, "PR-031");
  });

  it("a missing survival summary errors — the gate outcome must be recorded before Phase B", () => {
    const result = withMutation("post-phase-a", (f) => {
      rmSync(specPath(f.root, "runs/results/phase-a-survival.json"), { force: true });
    });
    expectCheckError(result, "PR-031");
  });
});

// ===========================================================================
// PR-027 / PR-028 — result recomputation and the truth table (F4)
// ===========================================================================

describe("PR-027 result recomputation", () => {
  it("a fabricated treatment_win the votes do not support errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editResult(f, "PA-MOT-1", (r) => {
        r.treatment_win = true;
        r.non_confirmatory_reason = null;
      });
    });
    expectCheckError(result, "PR-027");
  });

  it("a treatment_win recorded while an arm is ineligible errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editManifest(f, "PA-AES-1", "control", (m) => {
        m.gates.initial.pass = false;
      });
      // Re-hash the envelope so only the eligibility rule, not a byte check, fires.
      const rel = "runs/phase-a/PA-AES-1/control/gate-initial.json";
      const gate = JSON.stringify({ findings: [{ checkId: "G", severity: "error", message: "fixture failure" }], errorCount: 1, warningCount: 0 }, null, 2) + "\n";
      writeSpecFile(f.root, rel, gate);
      editManifest(f, "PA-AES-1", "control", (m) => {
        m.gates.initial.sha256 = sha256Hex(gate);
      });
    });
    expectCheckError(result, "PR-027");
  });

  it("an eligible flag that contradicts the gate envelope errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editResult(f, "PA-AES-1", (r) => {
        must(r.arms.control, "control arm").eligible = false;
      });
    });
    expectCheckError(result, "PR-027");
  });

  it("both_fail=true with a recorded treatment win errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => x.pair_id === "PA-AES-1" && x.endpoint_primary), "presentation");
      const rel = `runs/votes/${p.presentation_id}.json`;
      const vote = readSpecJson<OwnerVote>(f.root, rel);
      vote.both_fail = true;
      writeSpecJson(f.root, rel, vote);
      const result_ = readSpecJson<ResultFile>(f.root, "runs/results/PA-AES-1.json");
      const entry = must(result_.presentations.find((x) => x.presentation_id === p.presentation_id), "presentation record");
      entry.owner_vote_sha256 = sha256Hex(readFileSync(specPath(f.root, rel)));
      writeSpecJson(f.root, "runs/results/PA-AES-1.json", result_);
    });
    expectCheckError(result, "PR-027");
  });

  it("an inconsistent duplicate (the two presentations resolve to different arms) errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const dup = must(f.presentations.find((x) => x.pair_id === "PA-AES-2" && !x.endpoint_primary), "duplicate presentation");
      const rel = `runs/votes/${dup.presentation_id}.json`;
      const vote = readSpecJson<OwnerVote>(f.root, rel);
      vote.forced_preference = vote.forced_preference === "left" ? "right" : "left";
      writeSpecJson(f.root, rel, vote);
      const res = readSpecJson<ResultFile>(f.root, "runs/results/PA-AES-2.json");
      const entry = must(res.presentations.find((x) => x.presentation_id === dup.presentation_id), "presentation record");
      entry.owner_vote_sha256 = sha256Hex(readFileSync(specPath(f.root, rel)));
      writeSpecJson(f.root, "runs/results/PA-AES-2.json", res);
    });
    expectCheckError(result, "PR-027");
  });

  it("a curator critical regression with a recorded treatment win errors (veto)", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => x.pair_id === "PA-AES-1" && x.endpoint_primary), "presentation");
      const arm = p.left_arm === "treatment" ? p.left_code : p.right_code;
      const rel = `runs/curator/${arm}.json`;
      const score = readSpecJson<CuratorScore>(f.root, rel);
      must(score.critical_regressions.accessibility_behavior, "regression").fired = true;
      writeSpecJson(f.root, rel, score);
      const res = readSpecJson<ResultFile>(f.root, "runs/results/PA-AES-1.json");
      const entry = must(res.curator_scores.find((x) => x.codename === arm), "curator record");
      entry.sha256 = sha256Hex(readFileSync(specPath(f.root, rel)));
      writeSpecJson(f.root, "runs/results/PA-AES-1.json", res);
    });
    expectCheckError(result, "PR-027");
  });

  it("a treatment axis two points below control fires the veto", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => x.pair_id === "PA-AES-1" && x.endpoint_primary), "presentation");
      const treatmentCode = p.left_arm === "treatment" ? p.left_code : p.right_code;
      const rel = `runs/curator/${treatmentCode}.json`;
      const score = readSpecJson<CuratorScore>(f.root, rel);
      score.axes.responsive_craft = 2; // control records 4
      writeSpecJson(f.root, rel, score);
      const res = readSpecJson<ResultFile>(f.root, "runs/results/PA-AES-1.json");
      const entry = must(res.curator_scores.find((x) => x.codename === treatmentCode), "curator record");
      entry.sha256 = sha256Hex(readFileSync(specPath(f.root, rel)));
      writeSpecJson(f.root, "runs/results/PA-AES-1.json", res);
    });
    expectCheckError(result, "PR-027");
  });

  it("a repair_reduction recorded as 0 errors — undefined and 0-to-0 are null", () => {
    const result = withMutation("post-phase-a", (f) => {
      editResult(f, "PA-AES-1", (r) => {
        r.repair_reduction = 0;
      });
    });
    expectCheckError(result, "PR-027");
  });

  it("a revealed_assignment that does not match the randomization map errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editResult(f, "PA-AES-1", (r) => {
        r.revealed_assignment = { left: r.revealed_assignment.right, right: r.revealed_assignment.left } as { left: string; right: string };
      });
    });
    expectCheckError(result, "PR-027");
  });

  it("an owner_vote_sha256 that does not match the vote file errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editResult(f, "PA-AES-1", (r) => {
        must(r.presentations[0], "presentation").owner_vote_sha256 = "a".repeat(64);
      });
    });
    expectCheckError(result, "PR-027");
  });

  it("a curator score path escaping runs/curator errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editResult(f, "PA-AES-1", (r) => {
        must(r.curator_scores[0], "curator score").path = "runs/../runs/curator/../votes/escape.json";
      });
    });
    expectCheckError(result, "PR-027");
  });

  it("a missing result for a Phase-A pair errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      rmSync(specPath(f.root, "runs/results/PA-DEV-2.json"), { force: true });
    });
    expectCheckError(result, "PR-027");
  });

  it("a non-confirmatory pair with no recorded reason errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      editResult(f, "PA-MOT-1", (r) => {
        r.non_confirmatory_reason = null;
      });
    });
    expectCheckError(result, "PR-027");
  });
});

describe("PR-028 truth table", () => {
  it("a fail-closed condition with treatment_win=true fires the truth-table check", () => {
    const result = withMutation("post-phase-a", (f) => {
      editResult(f, "PA-AES-1", (r) => {
        r.contradiction_result = "leak";
      });
    });
    expectCheckError(result, "PR-028");
  });
});

// ===========================================================================
// PR-025 / PR-026 / PR-029 — reveal-time custody and advancement
// ===========================================================================

describe("PR-025 freeze order", () => {
  it("a votes freeze committed AFTER the curator freeze errors — votes must provably freeze first", () => {
    const f = buildLifecycle({ upTo: "post-reveal" });
    try {
      // Re-introduce runs/votes/FREEZE.json in a commit later than the curator
      // freeze, so `commitAdding` resolves the votes freeze to that later commit.
      const envelope = readSpecJson<FreezeEnvelope>(f.root, "runs/votes/FREEZE.json");
      rmSync(specPath(f.root, "runs/votes/FREEZE.json"), { force: true });
      commitMutation(f.root);
      writeSpecJson(f.root, "runs/votes/FREEZE.json", envelope);
      commitMutation(f.root);
      const result = runValidator(f.root, "post-reveal", undefined, f.secretDir);
      expectCheckError(result, "PR-025");
    } finally {
      f.cleanup();
    }
  });

  it("a freeze envelope that omits a vote file present in the directory errors at reveal too", () => {
    const result = withMutation("post-reveal", (f) => {
      const envelope = readSpecJson<FreezeEnvelope>(f.root, "runs/votes/FREEZE.json");
      envelope.files = envelope.files.slice(1);
      writeSpecJson(f.root, "runs/votes/FREEZE.json", envelope);
    });
    expectCheckError(result, "PR-025");
  });

  it("a reveal that was never committed errors — ordering against the freezes is unprovable", () => {
    const f = buildLifecycle({ upTo: "post-render" });
    try {
      const mapBytes = readFileSync(f.secretMapPath);
      writeSpecFile(f.root, "runs/reveal/randomization-map.json", mapBytes);
      // Deliberately NOT committed.
      const result = runValidator(f.root, "post-reveal", undefined, f.secretDir);
      expectCheckError(result, "PR-025");
    } finally {
      f.cleanup();
    }
  });

  it("a vote file modified after its freeze commit errors", () => {
    const result = withMutation("post-reveal", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id)), "presentation");
      const rel = `runs/votes/${p.presentation_id}.json`;
      const vote = readSpecJson<OwnerVote>(f.root, rel);
      vote.confidence = 1;
      writeSpecJson(f.root, rel, vote);
    });
    expectCheckError(result, "PR-025");
  });
});

describe("PR-026 commitment match", () => {
  it("a revealed map whose bytes do not hash to the commitment errors", () => {
    const result = withMutation("post-reveal", (f) => {
      const rel = "runs/reveal/randomization-map.json";
      const map = readSpecJson<{ presentations: unknown[] }>(f.root, rel);
      map.presentations = map.presentations.slice(1);
      writeSpecJson(f.root, rel, map);
    });
    expectCheckError(result, "PR-026");
  });
});

describe("PR-029 all candidates advance", () => {
  it("dropping one Phase-B result for a surviving family's candidate errors — no post-output capacity selection", () => {
    const result = withMutation("post-reveal", (f) => {
      rmSync(specPath(f.root, "runs/results/PB-A2-3.json"), { force: true });
      rmSync(specPath(f.root, "runs/phase-b/PB-A2-3"), { recursive: true, force: true });
    });
    expectCheckError(result, "PR-029");
  });

  it("a Phase-B render for a family that did not survive Phase A errors", () => {
    const result = withMutation("post-reveal", (f) => {
      const source = specPath(f.root, "runs/phase-b/PB-A1-1");
      const target = specPath(f.root, "runs/phase-b/PB-M1-1");
      writeSpecFile(f.root, "runs/phase-b/PB-M1-1/control/run-manifest.json", readFileSync(join(source, "control/run-manifest.json")));
      void target;
    });
    expectCheckError(result, "PR-029");
  });
});

// ===========================================================================
// B4 — supplied-asset identity must not survive the P7 projection
// ===========================================================================

describe("B4 neutral supplied-asset naming", () => {
  it("the frozen media briefs project with neutral role-indexed asset names, not committed ids", () => {
    const f = fixture("post-phase-a");
    // PA-MED-1's committed supplied assets are PA-MED-1-wide-1..3, which reconstruct
    // brief and family. The projection the manifest's prompt_hash covers must not
    // contain them — and the positive lifecycle being green already proves the
    // validator recomputes to the same bytes.
    const briefs = readSpecJson<{ briefs: { brief_id: string; supplied_assets: { asset_id: string }[] }[] }>(f.root, "phase-a-briefs.json");
    const med = must(briefs.briefs.find((b) => b.brief_id === "PA-MED-1"), "PA-MED-1");
    expect(med.supplied_assets.map((a) => a.asset_id)).toContain("PA-MED-1-wide-1");

    const result = runValidator(f.root, "post-phase-a", undefined, f.secretDir);
    expect(errorsOf(result)).toBe("[]");
  });

  it("a prompt_hash computed over a projection that RETAINS the committed asset ids is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      const template = readFileSync(specPath(f.root, "arm-prompt-template.md"));
      const briefs = readSpecJson<{ briefs: Record<string, unknown>[] }>(f.root, "phase-a-briefs.json");
      const brief = must(briefs.briefs.find((b) => b.brief_id === "PA-MED-1"), "PA-MED-1");
      // The pre-B4 projection: identity KEYS removed, supplied_assets left intact.
      const removed = ["brief_id", "candidate_id", "family", "ordinal", "role", "is_duplicate_source", "anti_context_condition"];
      const leaky: Record<string, unknown> = {};
      for (const key of Object.keys(brief)) {
        if (removed.includes(key)) continue;
        leaky[key] = brief[key];
      }
      const bytes = Buffer.concat([template, Buffer.from(JSON.stringify(leaky), "utf8")]);
      editManifest(f, "PA-MED-1", "control", (m) => {
        m.prompt_hash = sha256Hex(bytes);
      });
    });
    expectCheckError(result, "PR-020");
  });

  it("a judging bundle carrying a committed asset id is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => x.pair_id === "PA-MED-1" && x.endpoint_primary), "presentation");
      writeSpecFile(f.root, `runs/judging/${p.presentation_id}/${p.left_code}.html`,
        '<!doctype html><html lang="en"><head><title>x</title></head><body><img src="PA-MED-1-wide-1.jpg" alt=""></body></html>\n');
    });
    expectCheckError(result, "PR-023");
  });

  it("a judging bundle referencing the brief-media asset directory is rejected", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id)), "presentation");
      writeSpecFile(f.root, `runs/judging/${p.presentation_id}/${p.left_code}.html`,
        '<!doctype html><html lang="en"><head><title>x</title></head><body><img src="../../../assets/brief-media/x.jpg" alt=""></body></html>\n');
    });
    expectCheckError(result, "PR-023");
  });
});

// ===========================================================================
// B6 — PR-023 must match identity tokens on word boundaries, not as substrings
// ===========================================================================

describe("B6 boundary-safe identity scanning", () => {
  it("ordinary English and hex that merely CONTAIN banned tokens do not false-positive", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id)), "presentation");
      // "controls" contains "control"; #1a1a1a contains "a1"; "treatments" contains
      // "treatment". A substring scan errors on all three — on a correctly blinded
      // bundle. None of these is a leak.
      writeSpecFile(f.root, `runs/judging/${p.presentation_id}/notes.md`,
        "The form controls are legible and the accent is #1a1a1a across both treatments of the surface.\n");
    });
    expectNoCheckError(result, "PR-023");
  });

  it("a real arm word as a standalone token still errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const p = must(f.presentations.find((x) => f.renderedPairs.includes(x.pair_id)), "presentation");
      writeSpecFile(f.root, `runs/judging/${p.presentation_id}/notes.md`, "Left side is the control.\n");
    });
    expectCheckError(result, "PR-023");
  });
});

// ===========================================================================
// PR-017 / PR-018 — commitment immutability and clean tree (git-fixture classes)
// ===========================================================================

describe("PR-017 commitment precedes render", () => {
  it("a commitment amended after its commit errors — it must never change", () => {
    const result = withMutation("post-phase-a", (f) => {
      const commitment = readSpecJson<{ created_at: string }>(f.root, "randomization-commitment.json");
      commitment.created_at = "2026-06-06T00:00:00.000Z";
      writeSpecJson(f.root, "randomization-commitment.json", commitment);
    });
    expectCheckError(result, "PR-017");
  });

  it("a non-empty runs/ tree at --mode pre-render errors", () => {
    const f = buildLifecycle({ upTo: "pre-render" });
    try {
      writeSpecFile(f.root, "runs/phase-a/PA-AES-1/control/artifact-initial.html", "<html></html>\n");
      commitMutation(f.root);
      const result = runValidator(f.root, "pre-render", undefined, f.secretDir);
      expectCheckError(result, "PR-017");
    } finally {
      f.cleanup();
    }
  });
});

describe("PR-018 clean tree", () => {
  it("an uncommitted change errors at --mode pre-render", () => {
    const f = buildLifecycle({ upTo: "pre-render" });
    try {
      writeSpecFile(f.root, "roles.md", readFileSync(specPath(f.root, "roles.md"), "utf8") + "\nuncommitted\n");
      const result = runValidator(f.root, "pre-render", undefined, f.secretDir);
      expectCheckError(result, "PR-018");
    } finally {
      f.cleanup();
    }
  });

  it("a frozen file missing from HEAD errors", () => {
    const f = buildLifecycle({ upTo: "pre-render" });
    try {
      // A frozen file the validator does not itself import — deleting one it DOES
      // import kills the subprocess before any check runs, which proves nothing.
      rmSync(specPath(f.root, "scripts/enumerate-selection.mjs"), { force: true });
      commitMutation(f.root);
      const result = runValidator(f.root, "pre-render", undefined, f.secretDir);
      expectCheckError(result, "PR-018");
    } finally {
      f.cleanup();
    }
  });
});

// ===========================================================================
// PR-016 / AC-11 — the commitment's secret map is pinned to owner custody
// ===========================================================================

describe("PR-016 owner-custody pin (AC-11)", () => {
  it("a commitment whose secret_map_location is outside the repo but NOT the custody path errors", () => {
    const result = withMutation("post-phase-a", (f) => {
      const commitment = readSpecJson<{ secret_map_location: string }>(f.root, "randomization-commitment.json");
      commitment.secret_map_location = join(f.secretDir, "somewhere-else.json");
      writeSpecJson(f.root, "randomization-commitment.json", commitment);
    });
    expectCheckError(result, "PR-016");
  });
});
