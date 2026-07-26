/**
 * Spec-022 preregistration gate — pre-freeze / pre-render adversarial tests.
 *
 * Scope: the freeze-time check set, PR-001..PR-016. The real frozen artifact set is
 * the positive fixture and is genuinely green; each negative test copies it into a
 * throwaway temp dir, applies exactly ONE mutation, runs the validator's CLI against
 * the copy, and asserts the specific checkId fires as a `severity: "error"` finding
 * with `errorCount > 0` and a non-zero exit code.
 *
 * The later phases — run evidence, the Phase-A gate, judging, freeze ordering,
 * reveal, and result recomputation (PR-017..PR-031) — need a committed git history
 * and a full evidence tree, so they live in `spec-022-lifecycle.test.ts`, which
 * builds complete valid lifecycles and mutates those. The media manifest's own rule
 * set lives in `spec-022-media-manifest.test.ts`, and the judging packager's path
 * safety in `spec-022-judging-bundle.test.ts`.
 *
 * Hard constraint: the validator is invoked ONLY as a subprocess via its CLI contract
 * (`--mode <mode> --json`, an Article-II findings envelope on stdout, exit 0/1/2).
 * Nothing under `specs/022-taste-transfer-prereg/scripts/` is imported directly, so
 * these tests bind to the frozen CLI surface rather than to internal structure.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..");
const SPEC_REL = "specs/022-taste-transfer-prereg";
const SPEC_SRC = join(REPO_ROOT, SPEC_REL);

// ---------------------------------------------------------------------------
// Envelope shape (Article II) — kept local; not imported from the validator.
// ---------------------------------------------------------------------------

interface Finding {
  checkId: string;
  severity: "error" | "warning";
  message: string;
  path?: string;
}

interface Envelope {
  findings: Finding[];
  errorCount: number;
  warningCount: number;
}

interface RunResult {
  status: number;
  envelope: Envelope | null;
}

// ---------------------------------------------------------------------------
// Minimal local shapes for the JSON files this suite mutates. Deliberately
// narrow — only the fields these tests touch are typed; everything else rides
// through as `unknown` via an index signature.
// ---------------------------------------------------------------------------

interface SuppliedAssetRef {
  asset_id: string;
  manifest_ref: string;
}

interface PhaseABrief {
  brief_id: string;
  family: string;
  role: "ordinary" | "contradiction";
  ordinal: number;
  is_duplicate_source: boolean;
  title: string;
  supplied_assets: SuppliedAssetRef[];
  [key: string]: unknown;
}

interface PhaseABriefsFile {
  version: string;
  briefs: PhaseABrief[];
}

interface PhaseBBrief {
  brief_id: string;
  candidate_id: string;
  anti_context: { leak_definition: string; [key: string]: unknown };
  supplied_assets: SuppliedAssetRef[];
  [key: string]: unknown;
}

interface PhaseBBriefsFile {
  version: string;
  briefs: PhaseBBrief[];
}

interface SelectionRecord {
  path: string;
  sha256: string;
  disposition: string;
  [key: string]: unknown;
}

interface SelectionManifestFile {
  pinned_commit: string;
  record_count: number;
  records: SelectionRecord[];
}

interface SelectionFailureRecord {
  path: string;
  error: string;
  attempted_at: string;
}

interface SelectionFailuresFile {
  pinned_commit: string;
  failures: SelectionFailureRecord[];
}

interface Candidate {
  candidate_id: string;
  family: string;
  source_paths: string[];
  source_sha256: string[];
  patch_path: string;
  patch_sha256: string;
  [key: string]: unknown;
}

interface CandidateManifestFile {
  upstream_commit: string;
  candidates: Candidate[];
}

interface AssetRecord {
  asset_id: string;
  path: string;
  sha256: string;
  licence: string;
  licence_url?: string;
  source_url?: string;
  creator?: string;
  role?: string;
}

interface AssetManifestFile {
  assets: AssetRecord[];
  [key: string]: unknown;
}

interface RandomizationCommitment {
  version: string;
  created_at: string;
  csprng: string;
  secret_map_location: string;
  secret_map_sha256: string;
  phase_a_pairs: number;
  phase_a_presentations: number;
  phase_b_pairs: number;
  phase_b_presentations: number;
  codename_format: string;
  presentation_id_format: string;
  committed_before_render: boolean;
}

// ---------------------------------------------------------------------------
// Copy / mutate / run / assert helpers
// ---------------------------------------------------------------------------

/** Throw a descriptive error instead of silently propagating `undefined` under noUncheckedIndexedAccess. */
function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Copies the real committed spec-022 tree into a throwaway temp dir, preserving the
 * `<root>/specs/022-taste-transfer-prereg/...` layout the validator expects (it derives
 * both its spec dir and its repo root from its own `import.meta.url`).
 *
 * `realpathSync` matters on macOS: `mkdtempSync` returns a path under `/var/...`, which
 * is itself a symlink to `/private/var/...`. The validator resolves its repo root from
 * the canonicalized module URL Node's ESM loader gives it. Building any path we compare
 * against that repo root (PR-016's `secret_map_location`) from the non-canonical prefix
 * makes a real in-repo location falsely look "outside" by plain string comparison.
 * Canonicalizing once, up front, keeps every derived path consistent with what the
 * subprocess itself will see.
 */
function makeCopy(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-prereg-")));
  mkdirSync(join(root, "specs"), { recursive: true });
  cpSync(SPEC_SRC, join(root, SPEC_REL), { recursive: true });
  return root;
}

function specPath(root: string, rel: string): string {
  return join(root, SPEC_REL, rel);
}

function readJsonFile<T>(root: string, rel: string): T {
  return JSON.parse(readFileSync(specPath(root, rel), "utf8")) as T;
}

function writeJsonFile(root: string, rel: string, data: unknown): void {
  writeFileSync(specPath(root, rel), JSON.stringify(data, null, 2));
}

function appendText(root: string, rel: string, extra: string): void {
  const p = specPath(root, rel);
  writeFileSync(p, readFileSync(p, "utf8") + extra);
}

function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function jpegHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(13);
  bytes.writeUInt16BE(0xffd8, 0);
  bytes.writeUInt16BE(0xffc0, 2);
  bytes.writeUInt16BE(9, 4);
  bytes.writeUInt8(8, 6);
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  bytes.writeUInt8(1, 11);
  bytes.writeUInt8(1, 12);
  return bytes;
}

interface ExecError {
  status?: number | null;
  stdout?: string | Buffer;
}

function isExecError(err: unknown): err is ExecError {
  return typeof err === "object" && err !== null;
}

/** Runs the copy's own validator CLI (never the real repo's). */
function runValidator(root: string, mode: string): RunResult {
  const validatorPath = specPath(root, "scripts/validate-prereg.mjs");
  try {
    const stdout = execFileSync(process.execPath, [validatorPath, "--mode", mode, "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    return { status: 0, envelope: JSON.parse(stdout) as Envelope };
  } catch (err: unknown) {
    if (!isExecError(err)) throw err;
    const stdout = typeof err.stdout === "string" ? err.stdout : undefined;
    const status = typeof err.status === "number" ? err.status : -1;
    const envelope = stdout && stdout.length > 0 ? (JSON.parse(stdout) as Envelope) : null;
    return { status, envelope };
  }
}

/** Copy -> mutate -> run -> always clean up, even on assertion failure. */
function withMutatedCopy(mutate: (root: string) => void, mode = "pre-freeze"): RunResult {
  const root = makeCopy();
  try {
    mutate(root);
    return runValidator(root, mode);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function expectCheckError(result: RunResult, checkId: string): void {
  expect(result.envelope).not.toBeNull();
  const envelope = result.envelope as Envelope;
  expect(envelope.errorCount).toBeGreaterThan(0);
  expect(result.status).toBe(1);
  expect(envelope.findings.some((f) => f.checkId === checkId && f.severity === "error")).toBe(true);
}

function expectNoCheckError(result: RunResult, checkId: string): void {
  expect(result.envelope).not.toBeNull();
  const envelope = result.envelope as Envelope;
  expect(envelope.findings.some((f) => f.checkId === checkId && f.severity === "error")).toBe(false);
}

// ---------------------------------------------------------------------------
// Baseline — pins the completed pre-freeze media state
// ---------------------------------------------------------------------------

describe("baseline — completed pre-freeze media state", () => {
  it("unmutated copy at --mode pre-freeze is green after the licence-cleared media pack is frozen", () => {
    const result = withMutatedCopy(() => {});
    const envelope = result.envelope as Envelope;
    expect(result.status).toBe(0);
    expect(envelope.errorCount).toBe(0);
    expect(envelope.findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("--corpus degradation is never a silent pass: without --corpus, PR-004/PR-005 surface as non-empty warnings", () => {
    const result = withMutatedCopy(() => {});
    const envelope = result.envelope as Envelope;
    const pr004 = envelope.findings.filter((f) => f.checkId === "PR-004");
    const pr005 = envelope.findings.filter((f) => f.checkId === "PR-005");
    expect(pr004.length).toBeGreaterThan(0);
    expect(pr004.every((f) => f.severity === "warning")).toBe(true);
    expect(pr005.length).toBeGreaterThan(0);
    expect(pr005.every((f) => f.severity === "warning")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PR-001 files-present
// ---------------------------------------------------------------------------

describe("PR-001 files-present", () => {
  it("deleting a required frozen file errors", () => {
    const result = withMutatedCopy((root) => {
      rmSync(specPath(root, "repair-prompt.md"));
    });
    expectCheckError(result, "PR-001");
  });
});

// ---------------------------------------------------------------------------
// PR-002 schema-valid
// ---------------------------------------------------------------------------

describe("PR-002 schema-valid", () => {
  it("a JSON artifact with the wrong field type (version as a number) errors", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<PhaseABriefsFile>(root, "phase-a-briefs.json");
      // Deliberately wrong type — schema requires a string.
      (data as unknown as { version: number }).version = 1;
      writeJsonFile(root, "phase-a-briefs.json", data);
    });
    expectCheckError(result, "PR-002");
  });

  it("dropping a required key from a brief errors", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<PhaseABriefsFile>(root, "phase-a-briefs.json");
      const brief = must(data.briefs[0], "expected phase-a-briefs.json to have at least one brief");
      delete (brief as Partial<PhaseABrief>).title;
      writeJsonFile(root, "phase-a-briefs.json", data);
    });
    expectCheckError(result, "PR-002");
  });
});

// ---------------------------------------------------------------------------
// PR-003 selection-count
// ---------------------------------------------------------------------------

describe("PR-003 selection-count", () => {
  it("dropping one record breaks records.length !== record_count (120 !== 121)", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<SelectionManifestFile>(root, "selection-manifest.json");
      // records[0] is disposition:not-selected in the committed set — dropping it does
      // not also trip a candidate-source check, isolating this to PR-003.
      data.records.splice(0, 1);
      writeJsonFile(root, "selection-manifest.json", data);
    });
    expectCheckError(result, "PR-003");
  });

  it("duplicating a path breaks uniqueness and bytewise sort order", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<SelectionManifestFile>(root, "selection-manifest.json");
      const first = must(data.records[0], "expected at least one record");
      const second = must(data.records[1], "expected at least two records");
      second.path = first.path;
      writeJsonFile(root, "selection-manifest.json", data);
    });
    expectCheckError(result, "PR-003");
  });
});

// ---------------------------------------------------------------------------
// PR-005 hashes-wellformed
// ---------------------------------------------------------------------------

describe("PR-005 hashes-wellformed", () => {
  it("a non-64-hex sha256 field errors", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<SelectionManifestFile>(root, "selection-manifest.json");
      const first = must(data.records[0], "expected at least one record");
      first.sha256 = "not-a-valid-sha256";
      writeJsonFile(root, "selection-manifest.json", data);
    });
    expectCheckError(result, "PR-005");
  });
});

// ---------------------------------------------------------------------------
// PR-006 failures-no-substitution
// ---------------------------------------------------------------------------

describe("PR-006 failures-no-substitution", () => {
  it("a selection-failure path that is also a candidate source path errors", () => {
    const result = withMutatedCopy((root) => {
      const failures = readJsonFile<SelectionFailuresFile>(root, "selection-failures.json");
      // A1's real source path — appears with disposition:selected in the manifest and
      // as candidate A1's source in candidate-manifest.json.
      failures.failures.push({
        path: "agent-skills/web-design/editorial-tech/SKILL.md",
        error: "mutation-test: simulated read failure",
        attempted_at: new Date().toISOString(),
      });
      writeJsonFile(root, "selection-failures.json", failures);
    });
    expectCheckError(result, "PR-006");
  });
});

// ---------------------------------------------------------------------------
// PR-007 candidates-frozen
// ---------------------------------------------------------------------------

describe("PR-007 candidates-frozen", () => {
  it("removing a candidate (11 !== 12) errors", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<CandidateManifestFile>(root, "candidate-manifest.json");
      data.candidates.pop();
      writeJsonFile(root, "candidate-manifest.json", data);
    });
    expectCheckError(result, "PR-007");
  });

  it("changing a candidate_id to an out-of-enum value errors (the frozen ID it replaced is now missing)", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<CandidateManifestFile>(root, "candidate-manifest.json");
      const first = must(data.candidates[0], "expected at least one candidate");
      first.candidate_id = "ZZ";
      writeJsonFile(root, "candidate-manifest.json", data);
    });
    expectCheckError(result, "PR-007");
  });
});

// ---------------------------------------------------------------------------
// PR-008 patch-integrity
// ---------------------------------------------------------------------------

describe("PR-008 patch-integrity", () => {
  it("altering a patch file's bytes without updating its recorded patch_sha256 errors", () => {
    const result = withMutatedCopy((root) => {
      appendText(root, "patches/phase-b/A1.md", "\n\n<!-- mutation-test marker -->\n");
    });
    expectCheckError(result, "PR-008");
  });
});

// ---------------------------------------------------------------------------
// PR-009 patch-clean — banned-token scan, all sub-classes + word-boundary negative
// ---------------------------------------------------------------------------

describe("PR-009 patch-clean", () => {
  // Every case below appends to arm-prompt-template.md, which PR-009 scans but no
  // other check hashes or shape-checks — so each mutation isolates cleanly to PR-009
  // (mutating a patch file instead would also trip PR-008's patch_sha256 check).

  it("a banned URL errors", () => {
    const result = withMutatedCopy((root) => {
      appendText(root, "arm-prompt-template.md", "\nSee https://example.com for details.\n");
    });
    expectCheckError(result, "PR-009");
  });

  it("a banned brand token (Neuform) errors", () => {
    const result = withMutatedCopy((root) => {
      appendText(root, "arm-prompt-template.md", "\nInspired by Neuform.\n");
    });
    expectCheckError(result, "PR-009");
  });

  it("a bare corpus slug (editorial-tech) errors", () => {
    const result = withMutatedCopy((root) => {
      appendText(root, "arm-prompt-template.md", "\nThis mentions editorial-tech directly.\n");
    });
    expectCheckError(result, "PR-009");
  });

  it.each(["Sonnet", "GPT-5"])("a capitalised identity token (%s) still matches case-insensitively", (token) => {
    const result = withMutatedCopy((root) => {
      appendText(root, "arm-prompt-template.md", `\nGenerated by ${token}.\n`);
    });
    expectCheckError(result, "PR-009");
  });

  it("word-boundary correctness: 'editorial-technical' and 'philanthropic' do NOT false-positive", () => {
    const result = withMutatedCopy((root) => {
      appendText(root, "arm-prompt-template.md", "\nAn editorial-technical and philanthropic tone.\n");
    });
    // The rest of the copy is still honestly red on PR-014 — only PR-009 must stay clean.
    expectNoCheckError(result, "PR-009");
  });
});

// ---------------------------------------------------------------------------
// PR-011 phase-a-shape
// ---------------------------------------------------------------------------

describe("PR-011 phase-a-shape", () => {
  it("flipping a contradiction brief's ordinal off 4 errors", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<PhaseABriefsFile>(root, "phase-a-briefs.json");
      const contradiction = must(
        data.briefs.find((b) => b.brief_id === "PA-AES-4"),
        "expected PA-AES-4 to exist",
      );
      contradiction.ordinal = 3;
      writeJsonFile(root, "phase-a-briefs.json", data);
    });
    expectCheckError(result, "PR-011");
  });

  it("clearing an is_duplicate_source flag so the family has zero (not one) duplicates errors", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<PhaseABriefsFile>(root, "phase-a-briefs.json");
      const ordinal2 = must(
        data.briefs.find((b) => b.brief_id === "PA-AES-2"),
        "expected PA-AES-2 to exist",
      );
      ordinal2.is_duplicate_source = false;
      writeJsonFile(root, "phase-a-briefs.json", data);
    });
    expectCheckError(result, "PR-011");
  });
});

// ---------------------------------------------------------------------------
// PR-012 phase-b-shape
// ---------------------------------------------------------------------------

describe("PR-012 phase-b-shape", () => {
  it("deleting a brief (35 !== 36) errors", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<PhaseBBriefsFile>(root, "phase-b-briefs.json");
      data.briefs.pop();
      writeJsonFile(root, "phase-b-briefs.json", data);
    });
    expectCheckError(result, "PR-012");
  });

  it("blanking anti_context.leak_definition errors", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<PhaseBBriefsFile>(root, "phase-b-briefs.json");
      const brief = must(data.briefs[0], "expected at least one phase-b brief");
      brief.anti_context.leak_definition = "";
      writeJsonFile(root, "phase-b-briefs.json", data);
    });
    expectCheckError(result, "PR-012");
  });
});

// ---------------------------------------------------------------------------
// PR-013 arithmetic
// ---------------------------------------------------------------------------

describe("PR-013 arithmetic", () => {
  it("breaking the Phase-A brief count (17, not 16) breaks the computed 16x2=32 arithmetic", () => {
    const result = withMutatedCopy((root) => {
      const data = readJsonFile<PhaseABriefsFile>(root, "phase-a-briefs.json");
      const first = must(data.briefs[0], "expected at least one brief");
      data.briefs.push({ ...first, brief_id: "PA-AES-99" });
      writeJsonFile(root, "phase-a-briefs.json", data);
    });
    expectCheckError(result, "PR-013");
  });
});

// ---------------------------------------------------------------------------
// PR-014 assets-manifest — fails closed on the media pack
// ---------------------------------------------------------------------------

describe("PR-014 assets-manifest", () => {
  it("an unresolved supplied_assets reference errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readJsonFile<AssetManifestFile>(root, "assets/brief-media-manifest.json");
      manifest.assets = manifest.assets.filter((asset) => asset.asset_id !== "PA-MED-1-wide-1");
      writeJsonFile(root, "assets/brief-media-manifest.json", manifest);
    });
    expectCheckError(result, "PR-014");
  });

  it("a manifest entry present but whose file does not exist on disk still errors — being listed is not enough", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readJsonFile<AssetManifestFile>(root, "assets/brief-media-manifest.json");
      manifest.assets.push({
        asset_id: "PA-MED-1-wide-1",
        path: "assets/brief-media/does-not-exist.jpg",
        sha256: "a".repeat(64),
        licence: "test-fixture placeholder (mutation test)",
      });
      writeJsonFile(root, "assets/brief-media-manifest.json", manifest);
    });
    expectCheckError(result, "PR-014");
  });

  it("rejects an existing correctly hashed asset whose licence provenance can be invented", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readJsonFile<AssetManifestFile>(root, "assets/brief-media-manifest.json");
      const record = must(manifest.assets.find((a) => a.asset_id === "PA-MED-1-wide-1"), "expected PA-MED-1-wide-1");
      record.licence = "trust me";
      writeJsonFile(root, "assets/brief-media-manifest.json", manifest);
    });
    const findings = (result.envelope as Envelope).findings;
    expect(findings.some((f) => f.checkId === "PR-014" && f.message.includes("licence is not on the allowlist"))).toBe(true);
  });

  it("rejects an asset whose real bytes violate its declared wide role's ratio contract", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readJsonFile<AssetManifestFile>(root, "assets/brief-media-manifest.json");
      const record = must(manifest.assets.find((a) => a.asset_id === "PA-MED-1-wide-1"), "expected PA-MED-1-wide-1");
      // A real, hash-consistent, correctly-declared portrait JPEG in a `wide` slot.
      const bytes = jpegHeader(900, 1600);
      mkdirSync(dirname(specPath(root, record.path)), { recursive: true });
      writeFileSync(specPath(root, record.path), bytes);
      record.sha256 = sha256Hex(bytes);
      (record as unknown as { width: number; height: number }).width = 900;
      (record as unknown as { width: number; height: number }).height = 1600;
      writeJsonFile(root, "assets/brief-media-manifest.json", manifest);
    });
    const findings = (result.envelope as Envelope).findings;
    expect(findings.some((f) => f.checkId === "PR-014" && f.message.includes("ratio contract"))).toBe(true);
  });

  it("accepts the real 30-asset pack unchanged — the positive fixture is the frozen pack, not a fabrication", () => {
    const result = withMutatedCopy(() => {});
    const findings = (result.envelope as Envelope).findings;
    expect(findings.filter((f) => f.checkId === "PR-014")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// PR-015 reconciliation-hashes
// ---------------------------------------------------------------------------

describe("PR-015 reconciliation-hashes", () => {
  it("removing the verbatim VERDICT: BLOCKER line errors", () => {
    const result = withMutatedCopy((root) => {
      const p = specPath(root, "reconciliation.md");
      const text = readFileSync(p, "utf8").replace("VERDICT: BLOCKER", "VERDICT REMOVED BY MUTATION TEST");
      writeFileSync(p, text);
    });
    expectCheckError(result, "PR-015");
  });

  it("corrupting a reconciliation copy so its hash no longer matches errors", () => {
    const result = withMutatedCopy((root) => {
      appendText(root, "reconciliation/mengto-fable-final.md", "\nmutation-test tamper\n");
    });
    expectCheckError(result, "PR-015");
  });
});

// ---------------------------------------------------------------------------
// PR-016 commitment-valid (--mode pre-render)
// ---------------------------------------------------------------------------

describe("PR-016 commitment-valid", () => {
  it("a missing randomization-commitment.json errors at --mode pre-render", () => {
    const result = withMutatedCopy(() => {}, "pre-render");
    expectCheckError(result, "PR-016");
  });

  it("a commitment whose secret_map_location resolves INSIDE the repo root errors", () => {
    const result = withMutatedCopy((root) => {
      const commitment: RandomizationCommitment = {
        version: "1",
        created_at: new Date().toISOString(),
        csprng: "node:crypto.randomBytes",
        // Deliberately inside the temp repo root — must fail PR-016's location check.
        secret_map_location: join(root, "leak.secret.json"),
        secret_map_sha256: "b".repeat(64),
        phase_a_pairs: 16,
        phase_a_presentations: 20,
        phase_b_pairs: 36,
        phase_b_presentations: 36,
        codename_format: "8-hex-lowercase",
        presentation_id_format: "PR-8hex",
        committed_before_render: true,
      };
      writeJsonFile(root, "randomization-commitment.json", commitment);
    }, "pre-render");
    expectCheckError(result, "PR-016");
  });

  // R7 (amendment item 7 / AC-11 refinement 2) — the pin is the EXPANDED
  // ABSOLUTE owner custody path, not merely "some absolute path outside the
  // repo". A temp-dir path is outside the repo (so the earlier, separate
  // inside-repo finding does NOT fire) but is still not the owner's pinned
  // custody path, and must be rejected as its own distinct finding.
  it("a commitment whose secret_map_location is an absolute path OUTSIDE the repo but not the owner-pinned custody path errors", () => {
    const result = withMutatedCopy((root) => {
      const commitment: RandomizationCommitment = {
        version: "1",
        created_at: new Date().toISOString(),
        csprng: "node:crypto.randomBytes",
        // A real, absolute, outside-the-repo path — but not
        // ~/.design-os/prereg-022/randomization-map.secret.json.
        secret_map_location: join(tmpdir(), "not-the-owner-custody-path", "randomization-map.secret.json"),
        secret_map_sha256: "b".repeat(64),
        phase_a_pairs: 16,
        phase_a_presentations: 20,
        phase_b_pairs: 36,
        phase_b_presentations: 36,
        codename_format: "8-hex-lowercase",
        presentation_id_format: "PR-8hex",
        committed_before_render: true,
      };
      writeJsonFile(root, "randomization-commitment.json", commitment);
    }, "pre-render");
    expectCheckError(result, "PR-016");
  });

  it("a commitment whose secret_map_location is a relative path errors", () => {
    const result = withMutatedCopy((root) => {
      const commitment: RandomizationCommitment = {
        version: "1",
        created_at: new Date().toISOString(),
        csprng: "node:crypto.randomBytes",
        secret_map_location: "relative/randomization-map.secret.json",
        secret_map_sha256: "b".repeat(64),
        phase_a_pairs: 16,
        phase_a_presentations: 20,
        phase_b_pairs: 36,
        phase_b_presentations: 36,
        codename_format: "8-hex-lowercase",
        presentation_id_format: "PR-8hex",
        committed_before_render: true,
      };
      writeJsonFile(root, "randomization-commitment.json", commitment);
    }, "pre-render");
    expectCheckError(result, "PR-016");
  });

  it("a commitment whose secret_map_location is a \"~\"-prefixed shorthand errors", () => {
    const result = withMutatedCopy((root) => {
      const commitment: RandomizationCommitment = {
        version: "1",
        created_at: new Date().toISOString(),
        csprng: "node:crypto.randomBytes",
        secret_map_location: "~/.design-os/prereg-022/randomization-map.secret.json",
        secret_map_sha256: "b".repeat(64),
        phase_a_pairs: 16,
        phase_a_presentations: 20,
        phase_b_pairs: 36,
        phase_b_presentations: 36,
        codename_format: "8-hex-lowercase",
        presentation_id_format: "PR-8hex",
        committed_before_render: true,
      };
      writeJsonFile(root, "randomization-commitment.json", commitment);
    }, "pre-render");
    expectCheckError(result, "PR-016");
  });
});

// ---------------------------------------------------------------------------
// Mode ladder
// ---------------------------------------------------------------------------

describe("mode ladder", () => {
  it("--mode pre-render also runs the pre-freeze checks (a pre-freeze-class mutation still errors)", () => {
    const result = withMutatedCopy((root) => {
      rmSync(specPath(root, "repair-prompt.md"));
    }, "pre-render");
    expectCheckError(result, "PR-001");
  });
});

// ---------------------------------------------------------------------------
// CLI usage and exit-code semantics
// ---------------------------------------------------------------------------

describe("CLI usage and exit-code semantics", () => {
  it("an unknown --mode exits 2", () => {
    const root = makeCopy();
    try {
      const validatorPath = specPath(root, "scripts/validate-prereg.mjs");
      let status: number | null = null;
      try {
        execFileSync(process.execPath, [validatorPath, "--mode", "not-a-real-mode", "--json"], {
          cwd: root,
          encoding: "utf8",
        });
      } catch (err: unknown) {
        if (!isExecError(err)) throw err;
        status = typeof err.status === "number" ? err.status : null;
      }
      expect(status).toBe(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("errors present exits 1", () => {
    const result = withMutatedCopy((root) => {
      rmSync(specPath(root, "repair-prompt.md"));
    });
    expect(result.status).toBe(1);
    expect((result.envelope as Envelope).errorCount).toBeGreaterThan(0);
  });

  it("exits 0 only when errorCount === 0 — the unmutated frozen artifact set is genuinely green", () => {
    const result = withMutatedCopy(() => {});
    expect(result.envelope?.errorCount).toBe(0);
    expect(result.status).toBe(0);
  });

  it("a fabricated media pack that satisfies only the OLD four provenance strings is now rejected", () => {
    const result = withMutatedCopy((root) => {
      const phaseA = readJsonFile<PhaseABriefsFile>(root, "phase-a-briefs.json");
      const phaseB = readJsonFile<PhaseBBriefsFile>(root, "phase-b-briefs.json");
      const assetIds = [
        ...phaseA.briefs.flatMap((b) => b.supplied_assets.map((a) => a.asset_id)),
        ...phaseB.briefs.flatMap((b) => b.supplied_assets.map((a) => a.asset_id)),
      ];
      mkdirSync(specPath(root, "assets/brief-media"), { recursive: true });
      const assets: AssetRecord[] = assetIds.map((assetId) => {
        const role = assetId.includes("-wide-") ? "wide"
          : assetId.includes("-macro-") ? "macro"
            : assetId.includes("-directory-headshot-") ? "directory-headshot"
              : assetId.includes("-presskit-headshot-") ? "presskit-headshot"
                : assetId.includes("-portrait-") ? "portrait"
                  : "headshot";
        const [width, height] = role === "wide" ? [1600, 900] : role === "macro" ? [1200, 1200] : [1200, 1500];
        const relPath = `assets/brief-media/${assetId}.png`;
        const bytes = Buffer.concat([pngHeader(must(width, "width"), must(height, "height")), Buffer.from(assetId, "utf8")]);
        writeFileSync(specPath(root, relPath), bytes);
        return {
          asset_id: assetId,
          path: relPath,
          sha256: sha256Hex(bytes),
          licence: "CC BY 4.0",
          licence_url: "https://creativecommons.org/licenses/by/4.0/",
          source_url: `https://commons.wikimedia.org/wiki/File:${assetId}.png`,
          creator: "Fixture Creator",
          role,
        };
      });
      const manifest = readJsonFile<AssetManifestFile>(root, "assets/brief-media-manifest.json");
      manifest.assets = assets;
      writeJsonFile(root, "assets/brief-media-manifest.json", manifest);
    });
    // Under the pre-F7 check this pack passed. It now fails on the source SHA-1,
    // revision timestamp, derivative URL, crop method and identity disclaimer it
    // never carried — invented Commons-looking provenance is no longer sufficient.
    expect(result.envelope?.errorCount).toBeGreaterThan(0);
    expect(result.status).toBe(1);
  });
});
