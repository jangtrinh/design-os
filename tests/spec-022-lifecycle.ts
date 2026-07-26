/**
 * Spec-022 lifecycle fixture builder.
 *
 * Builds a COMPLETE, genuinely valid preregistration lifecycle in a throwaway git
 * repo: freeze commit -> commitment commit -> render commit -> owner-votes freeze
 * commit -> curator freeze commit -> results commit -> (optionally) reveal commit,
 * with real run manifests, gate envelopes, artifacts, screenshots, judging bundles,
 * owner votes, curator scores, results, and a survival summary.
 *
 * Why this exists: before fix-spec F8, every later-phase check had only negative
 * coverage or none at all, so "the validator passes a real completed Phase A" was
 * never demonstrated — and in fact it could not (Codex Stage-5 BLOCKER #3). A gate
 * that has only ever been run against an empty tree is not a gate.
 *
 * Two deliberate independence rules:
 *   1. Nothing here imports `specs/022-taste-transfer-prereg/scripts/**`. The P7
 *      arm-visible projection is RE-IMPLEMENTED below from the frozen prose in
 *      spec.md / arm-prompt-template.md. If the validator's assembler drifts from
 *      the spec, `prompt_hash` stops matching and the positive fixture goes red —
 *      which is the whole point. Sharing the implementation would only prove the
 *      assembler agrees with itself.
 *   2. The fixture is built to be CORRECT, then mutated by exactly one defect per
 *      test, so each negative test isolates the rule it names.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(TEST_DIR, "..");
export const SPEC_REL = "specs/022-taste-transfer-prereg";
export const SPEC_SRC = join(REPO_ROOT, SPEC_REL);

// ---------------------------------------------------------------------------
// Shapes (narrow on purpose — only what the fixture touches is typed)
// ---------------------------------------------------------------------------

export interface Brief {
  brief_id: string;
  family?: string;
  candidate_id?: string;
  role?: string;
  ordinal?: number;
  is_duplicate_source?: boolean;
  [key: string]: unknown;
}

interface BriefsFile {
  version: string;
  briefs: Brief[];
}

interface Candidate {
  candidate_id: string;
  family: string;
  source_sha256: string[];
  [key: string]: unknown;
}

interface CandidateManifest {
  upstream_commit: string;
  candidates: Candidate[];
}

export interface Presentation {
  presentation_id: string;
  pair_id: string;
  phase: "A" | "B";
  brief_id: string;
  family: string;
  left_code: string;
  right_code: string;
  left_arm: "control" | "treatment";
  is_duplicate: boolean;
  endpoint_primary: boolean;
  presentation_order: number;
}

/** The owner-pinned custody path segments, mirrored from the validator's constants. */
export const SECRET_MAP_CUSTODY_SEGMENTS = [".design-os", "prereg-022", "randomization-map.secret.json"];

export interface Fixture {
  /** Temp git repo root; the spec dir lives at `<root>/specs/022-taste-transfer-prereg`. */
  root: string;
  /** Sandbox HOME holding the secret map — deliberately OUTSIDE the repo root. */
  secretDir: string;
  secretMapPath: string;
  preregCommit: string;
  presentations: Presentation[];
  renderedPairs: string[];
  cleanup(): void;
}

export interface LifecycleOptions {
  /** How far through the lifecycle to build. */
  upTo: "pre-render" | "post-phase-a" | "post-render" | "post-reveal";
  /** Families whose three ordinary Phase-A pairs all record a treatment win. */
  survivors?: string[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function writeFile(path: string, data: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

/** A 1x1-ish PNG header carrying the declared dimensions — enough for evidence. */
function pngBytes(seed: string): Buffer {
  const header = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "ascii");
  header.writeUInt32BE(4, 16);
  header.writeUInt32BE(4, 20);
  return Buffer.concat([header, Buffer.from(seed, "utf8")]);
}

export function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function commit(root: string, message: string): string {
  git(root, ["add", "-A"]);
  git(root, ["commit", "--no-gpg-sign", "--allow-empty", "-q", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

/** Commit whatever a mutation just changed, so PR-018's clean-tree check stays out of the way. */
export function commitMutation(root: string): void {
  commit(root, "mutation");
}

// ---------------------------------------------------------------------------
// The P7 arm-visible projection — re-implemented from the frozen prose
// ---------------------------------------------------------------------------

const PHASE_A_REMOVED = ["brief_id", "candidate_id", "family", "ordinal", "role", "is_duplicate_source", "anti_context_condition"];
const PHASE_B_REMOVED = ["brief_id", "candidate_id", "family", "ordinal"];
const PHASE_B_ANTI_REMOVED = ["leak_definition", "deterministic_leak_checks"];

interface SuppliedAsset {
  asset_id?: string;
  manifest_ref?: string;
  [key: string]: unknown;
}

interface MediaManifestRecord {
  asset_id: string;
  role: string;
  [key: string]: unknown;
}

interface MediaManifestFile {
  assets: MediaManifestRecord[];
  [key: string]: unknown;
}

/** Map<asset_id, role>, read from the frozen media manifest's own `role` field — never inferred from id substrings. */
export function assetRoleMap(manifest: MediaManifestFile): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of manifest.assets ?? []) {
    if (typeof a?.asset_id === "string" && typeof a?.role === "string") map.set(a.asset_id, a.role);
  }
  return map;
}

/**
 * Amendment item 1 (Fable B4/B5) — supplied assets are replaced with a neutral,
 * role-indexed alias `{ asset_ref: "asset-<role>-<n>", role }`, numbered per role
 * in committed order within the brief, `manifest_ref` dropped entirely. `<role>`
 * comes from the frozen manifest, never from substrings of the committed id, so
 * an id like "PB-P2-1-headshot-1" can no longer reconstruct the brief, family
 * and candidate for the arm that receives it. Fails closed on an unknown id.
 */
function projectSuppliedAssets(brief: Brief, assetRoles: Map<string, string>): SuppliedAsset[] {
  const counters = new Map<string, number>();
  return ((brief.supplied_assets as SuppliedAsset[] | undefined) ?? []).map((supplied) => {
    const id = supplied.asset_id;
    if (typeof id !== "string") throw new Error("projectSuppliedAssets: a supplied_assets entry has no string asset_id");
    const role = assetRoles.get(id);
    if (role === undefined) throw new Error(`projectSuppliedAssets: asset_id ${id} is not in the frozen media manifest`);
    const next = (counters.get(role) ?? 0) + 1;
    counters.set(role, next);
    return { asset_ref: `asset-${role}-${next}`, role };
  });
}

export function projectBrief(brief: Brief, phase: "A" | "B", assetRoles: Map<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const removed = phase === "A" ? PHASE_A_REMOVED : PHASE_B_REMOVED;
  for (const key of Object.keys(brief)) {
    if (removed.includes(key)) continue;
    const value = brief[key];
    if (key === "supplied_assets" && Array.isArray(value)) {
      out[key] = projectSuppliedAssets(brief, assetRoles);
      continue;
    }
    if (phase === "B" && key === "anti_context" && value !== null && typeof value === "object" && !Array.isArray(value)) {
      const anti: Record<string, unknown> = {};
      const source = value as Record<string, unknown>;
      for (const antiKey of Object.keys(source)) {
        if (PHASE_B_ANTI_REMOVED.includes(antiKey)) continue;
        anti[antiKey] = source[antiKey];
      }
      out[key] = anti;
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function assemblePrompt(templateBytes: Buffer, brief: Brief, phase: "A" | "B", patchBytes: Buffer | null, assetRoles: Map<string, string>): Buffer {
  const parts = [templateBytes, Buffer.from(JSON.stringify(projectBrief(brief, phase, assetRoles)), "utf8")];
  if (patchBytes !== null) parts.push(patchBytes);
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Deterministic codenames that cannot collide with a candidate label
// ---------------------------------------------------------------------------

const CANDIDATE_IDS = ["A1", "A2", "A3", "M1", "M2", "M3", "D1", "D2", "D3", "D4", "P1", "P2"];

function makeCodeSource(): () => string {
  let counter = 0;
  return () => {
    for (;;) {
      counter += 1;
      const code = sha256Hex(`spec-022-fixture-codename-${counter}`).slice(0, 8);
      const collides = CANDIDATE_IDS.some((id) => {
        const lower = id.toLowerCase();
        return code.startsWith(lower) || code.endsWith(lower);
      });
      if (!collides) return code;
    }
  };
}

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

export function buildLifecycle(options: LifecycleOptions): Fixture {
  const survivors = options.survivors ?? ["aesthetics"];
  const root = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-life-")));
  const secretDir = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-secret-")));
  const specDir = join(root, SPEC_REL);
  const cleanup = () => {
    rmSync(root, { recursive: true, force: true });
    rmSync(secretDir, { recursive: true, force: true });
  };

  try {
    mkdirSync(join(root, "specs"), { recursive: true });
    cpSync(SPEC_SRC, specDir, { recursive: true });

    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "fixture@example.invalid"]);
    git(root, ["config", "user.name", "Spec 022 Fixture"]);
    git(root, ["config", "commit.gpgsign", "false"]);

    // ---- 1. freeze commit -------------------------------------------------
    commit(root, "freeze");

    // ---- inputs -----------------------------------------------------------
    const phaseA = readJson<BriefsFile>(join(specDir, "phase-a-briefs.json"));
    const phaseB = readJson<BriefsFile>(join(specDir, "phase-b-briefs.json"));
    const candidateManifest = readJson<CandidateManifest>(join(specDir, "candidate-manifest.json"));
    const templateBytes = readFileSync(join(specDir, "arm-prompt-template.md"));
    const controlSourceHash = sha256Hex(templateBytes); // a real, non-candidate hash
    const mediaManifest = readJson<MediaManifestFile>(join(specDir, "assets/brief-media-manifest.json"));
    const assetRoles = assetRoleMap(mediaManifest);

    const familyOf = new Map<string, string>();
    const sourcesOf = new Map<string, string[]>();
    for (const c of candidateManifest.candidates) {
      familyOf.set(c.candidate_id, c.family);
      sourcesOf.set(c.candidate_id, c.source_sha256);
    }
    const familySources = new Map<string, string[]>();
    for (const c of candidateManifest.candidates) {
      const list = familySources.get(c.family) ?? [];
      familySources.set(c.family, [...list, ...c.source_sha256]);
    }

    const briefById = new Map<string, { brief: Brief; phase: "A" | "B"; family: string }>();
    for (const b of phaseA.briefs) briefById.set(b.brief_id, { brief: b, phase: "A", family: String(b.family) });
    for (const b of phaseB.briefs) {
      briefById.set(b.brief_id, { brief: b, phase: "B", family: must(familyOf.get(String(b.candidate_id)), `no family for ${b.candidate_id}`) });
    }

    // ---- 2. the randomization map + commitment commit ---------------------
    const nextCode = makeCodeSource();
    const presentations: Presentation[] = [];
    let idCounter = 0;
    const nextPresentationId = () => `PR-${sha256Hex(`spec-022-fixture-presentation-${(idCounter += 1)}`).slice(0, 8)}`;

    const makePresentation = (brief: Brief, phase: "A" | "B", family: string, leftArm: "control" | "treatment"): Presentation => ({
      presentation_id: nextPresentationId(),
      pair_id: brief.brief_id,
      phase,
      brief_id: brief.brief_id,
      family,
      left_code: nextCode(),
      right_code: nextCode(),
      left_arm: leftArm,
      is_duplicate: false,
      endpoint_primary: true,
      presentation_order: 0,
    });

    let coin = 0;
    const flip = (): "control" | "treatment" => ((coin += 1) % 2 === 0 ? "control" : "treatment");

    for (const brief of phaseA.briefs) {
      const p1 = makePresentation(brief, "A", String(brief.family), flip());
      presentations.push(p1);
      if (brief.is_duplicate_source === true) {
        const p2 = makePresentation(brief, "A", String(brief.family), flip());
        p1.is_duplicate = true;
        p2.is_duplicate = true;
        p2.endpoint_primary = false;
        presentations.push(p2);
      }
    }
    for (const brief of phaseB.briefs) {
      presentations.push(makePresentation(brief, "B", must(familyOf.get(String(brief.candidate_id)), "family"), flip()));
    }
    presentations.forEach((p, i) => {
      p.presentation_order = i + 1;
    });

    const mapBytes = Buffer.from(JSON.stringify({ version: "1", created_at: "2026-01-01T00:00:00.000Z", presentations }, null, 2), "utf8");
    // The sandbox HOME reproduces the owner's real custody path SHAPE
    // (~/.design-os/prereg-022/randomization-map.secret.json) so PR-016's AC-11 pin
    // is exercised, without ever writing to the real home directory.
    const secretMapPath = join(secretDir, ...SECRET_MAP_CUSTODY_SEGMENTS);
    writeFile(secretMapPath, mapBytes);

    const commitmentPath = join(specDir, "randomization-commitment.json");
    const commitment = {
      version: "1",
      created_at: "2026-01-01T00:00:00.000Z",
      csprng: "node:crypto.randomBytes",
      secret_map_location: secretMapPath,
      secret_map_sha256: sha256Hex(mapBytes),
      phase_a_pairs: 16,
      phase_a_presentations: 20,
      phase_b_pairs: 36,
      phase_b_presentations: 36,
      codename_format: "8-hex-lowercase",
      presentation_id_format: "PR-8hex",
      committed_before_render: true,
    };
    writeJson(commitmentPath, commitment);
    const preregCommit = commit(root, "commitment");
    const commitmentSha256 = sha256Hex(readFileSync(commitmentPath));

    if (options.upTo === "pre-render") {
      return { root, secretDir, secretMapPath, preregCommit, presentations, renderedPairs: [], cleanup };
    }

    // ---- 3. render commit -------------------------------------------------
    const renderedPairs: string[] = phaseA.briefs.map((b) => b.brief_id);
    const wantPhaseB = options.upTo === "post-render" || options.upTo === "post-reveal";
    if (wantPhaseB) {
      for (const b of phaseB.briefs) {
        const family = must(familyOf.get(String(b.candidate_id)), "family");
        if (survivors.includes(family)) renderedPairs.push(b.brief_id);
      }
    }

    for (const pairId of renderedPairs) {
      const entry = must(briefById.get(pairId), `no brief ${pairId}`);
      for (const arm of ["control", "treatment"] as const) {
        writeArm(specDir, {
          entry,
          arm,
          preregCommit,
          upstreamCommit: candidateManifest.upstream_commit,
          templateBytes,
          controlSourceHash,
          familySources,
          sourcesOf,
          assetRoles,
        });
      }
    }

    const judged = presentations.filter((p) => renderedPairs.includes(p.pair_id));
    for (const p of judged) writeJudgingBundle(specDir, p);
    commit(root, "render");

    // ---- 4. owner-votes freeze commit -------------------------------------
    const winnerOf = new Map<string, "control" | "treatment">();
    for (const pairId of renderedPairs) {
      const entry = must(briefById.get(pairId), "brief");
      winnerOf.set(pairId, decideWinner(entry, survivors));
    }

    const voteFiles: { file: string; sha256: string }[] = [];
    for (const p of judged) {
      const winner = must(winnerOf.get(p.pair_id), "winner");
      const vote = {
        presentation_id: p.presentation_id,
        left_code: p.left_code,
        right_code: p.right_code,
        forced_preference: p.left_arm === winner ? "left" : "right",
        both_fail: false,
        confidence: 4,
        reason: "Fixture vote: the preferred side reads as the more finished surface.",
        voted_at: "2026-02-01T00:00:00.000Z",
      };
      const rel = `${p.presentation_id}.json`;
      const path = join(specDir, "runs/votes", rel);
      writeJson(path, vote);
      voteFiles.push({ file: rel, sha256: sha256Hex(readFileSync(path)) });
    }
    writeJson(join(specDir, "runs/votes/FREEZE.json"), {
      version: "1",
      kind: "votes",
      phase: wantPhaseB ? "B" : "A",
      evidence_commit: preregCommit,
      files: voteFiles.sort((a, b) => a.file.localeCompare(b.file)),
      frozen_at: "2026-02-02T00:00:00.000Z",
    });
    commit(root, "votes freeze");

    // ---- 5. curator freeze commit -----------------------------------------
    const curatorFiles: { file: string; sha256: string }[] = [];
    for (const p of judged.filter((x) => x.endpoint_primary)) {
      for (const code of [p.left_code, p.right_code]) {
        const rel = `${code}.json`;
        const path = join(specDir, "runs/curator", rel);
        writeJson(path, curatorScore(code));
        curatorFiles.push({ file: rel, sha256: sha256Hex(readFileSync(path)) });
      }
    }
    writeJson(join(specDir, "runs/curator/FREEZE.json"), {
      version: "1",
      kind: "curator",
      phase: wantPhaseB ? "B" : "A",
      evidence_commit: preregCommit,
      files: curatorFiles.sort((a, b) => a.file.localeCompare(b.file)),
      frozen_at: "2026-02-03T00:00:00.000Z",
    });
    commit(root, "curator freeze");

    // ---- 6. results commit -------------------------------------------------
    for (const pairId of renderedPairs) {
      const entry = must(briefById.get(pairId), "brief");
      const pairPresentations = judged.filter((p) => p.pair_id === pairId);
      writeResult(specDir, { entry, presentations: pairPresentations, winner: must(winnerOf.get(pairId), "winner"), commitmentSha256 });
    }
    writeJson(join(specDir, "runs/results/phase-a-survival.json"), survivalSummary(phaseA.briefs, survivors));
    commit(root, "results");

    // ---- 7. reveal commit --------------------------------------------------
    if (options.upTo === "post-reveal") {
      writeFile(join(specDir, "runs/reveal/randomization-map.json"), mapBytes);
      commit(root, "reveal");
    }

    return { root, secretDir, secretMapPath, preregCommit, presentations, renderedPairs, cleanup };
  } catch (err) {
    cleanup();
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Piece writers
// ---------------------------------------------------------------------------

interface ArmOptions {
  entry: { brief: Brief; phase: "A" | "B"; family: string };
  arm: "control" | "treatment";
  preregCommit: string;
  upstreamCommit: string;
  templateBytes: Buffer;
  controlSourceHash: string;
  familySources: Map<string, string[]>;
  sourcesOf: Map<string, string[]>;
  assetRoles: Map<string, string>;
}

function writeArm(specDir: string, o: ArmOptions): void {
  const { entry, arm } = o;
  const pairId = entry.brief.brief_id;
  const phaseDir = entry.phase === "A" ? "phase-a" : "phase-b";
  const dirRel = `runs/${phaseDir}/${pairId}/${arm}`;
  const dirAbs = join(specDir, dirRel);

  const artifact = `<!doctype html><html lang="en"><head><title>${pairId}</title></head><body><main><h1>Fixture artifact</h1></main></body></html>\n`;
  writeFile(join(dirAbs, "artifact-initial.html"), artifact);
  const gate = JSON.stringify({ findings: [], errorCount: 0, warningCount: 0 }, null, 2) + "\n";
  writeFile(join(dirAbs, "gate-initial.json"), gate);
  const consoleLog = "[fixture] no console errors\n";
  writeFile(join(dirAbs, "console.log"), consoleLog);

  const screenshots = [390, 768, 1440].map((viewport) => {
    const rel = `screenshot-${viewport}.png`;
    const bytes = pngBytes(`${pairId}-${arm}-${viewport}`);
    writeFile(join(dirAbs, rel), bytes);
    return { viewport, path: `${dirRel}/${rel}`, sha256: sha256Hex(bytes) };
  });

  let reducedMotion: { path: string; sha256: string } | null = null;
  if (entry.family === "motion") {
    const bytes = pngBytes(`${pairId}-${arm}-reduced-motion`);
    writeFile(join(dirAbs, "reduced-motion.png"), bytes);
    reducedMotion = { path: `${dirRel}/reduced-motion.png`, sha256: sha256Hex(bytes) };
  }

  let patchPath: string | null = null;
  let patchBytes: Buffer | null = null;
  if (arm === "treatment") {
    patchPath = entry.phase === "A" ? `patches/phase-a/${entry.family}.md` : `patches/phase-b/${entry.brief.candidate_id}.md`;
    patchBytes = readFileSync(join(specDir, patchPath));
  }

  const sourceHashes =
    arm === "treatment"
      ? entry.phase === "A"
        ? [...new Set(o.familySources.get(entry.family) ?? [])]
        : [...new Set(o.sourcesOf.get(String(entry.brief.candidate_id)) ?? [])]
      : [o.controlSourceHash];

  const manifest = {
    run_id: `${pairId}-${arm}`,
    pair_id: pairId,
    phase: entry.phase,
    family: entry.family,
    candidate_id: entry.phase === "A" ? null : String(entry.brief.candidate_id),
    arm,
    brief_id: pairId,
    brief_hash: sha256Hex(Buffer.from(JSON.stringify(entry.brief), "utf8")),
    prereg_commit: o.preregCommit,
    control_commit: o.preregCommit,
    upstream_commit: o.upstreamCommit,
    provider: { name: "claude-code-cli", model_id: "claude-sonnet-5", params_note: "temperature 1, 32000-token ceiling" },
    patch_path: patchPath,
    patch_hash: patchBytes === null ? null : sha256Hex(patchBytes),
    source_hashes: sourceHashes,
    prompt_hash: sha256Hex(assemblePrompt(o.templateBytes, entry.brief, entry.phase, patchBytes, o.assetRoles)),
    tree_clean: true,
    generated_at: "2026-01-15T00:00:00.000Z",
    artifacts: {
      initial: { path: `${dirRel}/artifact-initial.html`, sha256: sha256Hex(artifact) },
      repaired: null,
      primary: "initial",
    },
    gates: {
      initial: { envelope_path: `${dirRel}/gate-initial.json`, sha256: sha256Hex(gate), pass: true },
      post_repair: null,
    },
    repair: { performed: false, findings_hash: null },
    console_log: { path: `${dirRel}/console.log`, sha256: sha256Hex(consoleLog) },
    screenshots,
    reduced_motion_capture: reducedMotion,
  };
  writeJson(join(dirAbs, "run-manifest.json"), manifest);
}

function writeJudgingBundle(specDir: string, p: Presentation): void {
  const dirAbs = join(specDir, "runs/judging", p.presentation_id);
  for (const code of [p.left_code, p.right_code]) {
    writeFile(join(dirAbs, `${code}.html`), `<!doctype html><html lang="en"><head><title>${code}</title></head><body><main><p>Blind bundle.</p></main></body></html>\n`);
    for (const viewport of [390, 768, 1440]) {
      writeFile(join(dirAbs, `${code}.${viewport}.png`), pngBytes(`${p.presentation_id}-${code}-${viewport}`));
    }
  }
  writeFile(join(dirAbs, "brief-facts.md"), "# Brief facts\n\nCodename-neutral summary of the frozen brief.\n");
}

function curatorScore(codename: string): Record<string, unknown> {
  return {
    codename,
    axes: {
      authored_detail: 4,
      hierarchy_composition: 4,
      typography_content_fit: 4,
      interaction_completeness: 4,
      responsive_craft: 4,
      brief_fidelity: 4,
    },
    critical_regressions: {
      accessibility_behavior: { fired: false, note: "" },
      interaction_coherence: { fired: false, note: "" },
      responsive_integrity: { fired: false, note: "" },
      content_fidelity: { fired: false, note: "" },
      contradiction_leakage: { fired: false, note: "" },
    },
    anti_context_leak: { fired: false, note: "" },
    scored_at: "2026-02-03T00:00:00.000Z",
  };
}

/**
 * Ordinary pairs of a surviving family record a treatment win; everything else
 * records a control win. Contradiction pairs (ordinal 4) are diagnostic and never
 * count toward survival, so they are given a control win to prove the arithmetic
 * ignores them.
 */
function decideWinner(entry: { brief: Brief; phase: "A" | "B"; family: string }, survivors: string[]): "control" | "treatment" {
  if (!survivors.includes(entry.family)) return "control";
  if (entry.phase === "A" && entry.brief.role === "contradiction") return "control";
  return "treatment";
}

interface ResultOptions {
  entry: { brief: Brief; phase: "A" | "B"; family: string };
  presentations: Presentation[];
  winner: "control" | "treatment";
  commitmentSha256: string;
}

function writeResult(specDir: string, o: ResultOptions): void {
  const { entry, presentations, winner } = o;
  const pairId = entry.brief.brief_id;
  const phaseDir = entry.phase === "A" ? "phase-a" : "phase-b";
  const primary = must(
    presentations.find((p) => p.endpoint_primary),
    `no endpoint-primary presentation for ${pairId}`,
  );

  const armRecord = (arm: "control" | "treatment") => {
    const manifest = readJson<{ run_id: string; artifacts: { initial: { sha256: string } } }>(
      join(specDir, `runs/${phaseDir}/${pairId}/${arm}/run-manifest.json`),
    );
    return {
      run_id: manifest.run_id,
      primary_artifact_sha256: manifest.artifacts.initial.sha256,
      eligible: true,
      initial_pass: true,
      post_repair_pass: null,
    };
  };

  const result = {
    pair_id: pairId,
    phase: entry.phase,
    family: entry.family,
    candidate_id: entry.phase === "A" ? null : String(entry.brief.candidate_id),
    brief_hash: sha256Hex(Buffer.from(JSON.stringify(entry.brief), "utf8")),
    arms: { control: armRecord("control"), treatment: armRecord("treatment") },
    presentations: presentations.map((p) => {
      const rel = `runs/votes/${p.presentation_id}.json`;
      return {
        presentation_id: p.presentation_id,
        owner_vote_path: rel,
        owner_vote_sha256: sha256Hex(readFileSync(join(specDir, rel))),
        endpoint_primary: p.endpoint_primary,
      };
    }),
    curator_scores: [primary.left_code, primary.right_code].map((code) => {
      const rel = `runs/curator/${code}.json`;
      return { codename: code, path: rel, sha256: sha256Hex(readFileSync(join(specDir, rel))) };
    }),
    contradiction_result: entry.phase === "A" && entry.brief.role !== "contradiction" ? "not-applicable" : "none",
    duplicate_consistent: presentations.length === 2 ? true : null,
    repair_reduction: null,
    randomization_commitment_sha256: o.commitmentSha256,
    revealed_assignment: {
      left: primary.left_arm,
      right: primary.left_arm === "control" ? "treatment" : "control",
    },
    treatment_win: winner === "treatment",
    non_confirmatory_reason: winner === "treatment" ? null : "The blind owner preferred the control arm on the endpoint presentation.",
    finalized_at: "2026-02-04T00:00:00.000Z",
  };
  writeJson(join(specDir, "runs/results", `${pairId}.json`), result);
}

function survivalSummary(phaseABriefs: Brief[], survivors: string[]): Record<string, unknown> {
  const families = ["aesthetics", "devices", "media", "motion"];
  return {
    version: "1",
    phase: "A",
    families: families.map((family) => {
      const ordinary = phaseABriefs
        .filter((b) => b.family === family && b.role !== "contradiction")
        .map((b) => b.brief_id)
        .sort();
      const survives = survivors.includes(family);
      return {
        family,
        ordinary_pair_ids: ordinary,
        ordinary_treatment_wins: survives ? 3 : 0,
        survives,
        stop_reason: survives ? null : "Treatment did not win all three ordinary owner votes.",
      };
    }),
    finalized_at: "2026-02-04T00:00:00.000Z",
  };
}

// ---------------------------------------------------------------------------
// Running the validator against a fixture
// ---------------------------------------------------------------------------

export interface Finding {
  checkId: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
}

export interface Envelope {
  findings: Finding[];
  errorCount: number;
  warningCount: number;
}

export interface RunResult {
  status: number;
  envelope: Envelope | null;
}

/**
 * spawnSync, not execFileSync: on a non-zero exit execFileSync's error object
 * truncates stdout at 64 KiB regardless of `maxBuffer`, and a failing lifecycle
 * fixture emits a much larger findings envelope — the truncated JSON then fails to
 * parse and the test reports a parse error instead of the rule it was checking.
 */
export function runValidator(root: string, mode: string, corpus?: string, home?: string): RunResult {
  const validatorPath = join(root, SPEC_REL, "scripts/validate-prereg.mjs");
  const args = [validatorPath, "--mode", mode, "--json"];
  if (corpus) args.push("--corpus", corpus);
  // HOME is overridden so PR-016's owner-custody pin (AC-11) resolves against the
  // fixture's sandbox home. The real `~/.design-os/prereg-022/` is never touched:
  // writing the real secret map early would permanently brick the pilot's one-shot
  // generation, because make-randomization-map.mjs refuses to rerun by design.
  const env = home ? { ...process.env, HOME: home } : process.env;
  const proc = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, env });
  if (proc.error) throw proc.error;
  const stdout = proc.stdout ?? "";
  return {
    status: proc.status ?? -1,
    envelope: stdout.length > 0 ? (JSON.parse(stdout) as Envelope) : null,
  };
}

export function specPath(root: string, rel: string): string {
  return join(root, SPEC_REL, rel);
}

export function readSpecJson<T>(root: string, rel: string): T {
  return readJson<T>(specPath(root, rel));
}

export function writeSpecJson(root: string, rel: string, data: unknown): void {
  writeJson(specPath(root, rel), data);
}

export function writeSpecFile(root: string, rel: string, data: string | Buffer): void {
  writeFile(specPath(root, rel), data);
}
