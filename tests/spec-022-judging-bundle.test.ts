/**
 * Spec-022 judging-bundle packager — path-safety and commitment-safety tests
 * (fix-spec F5, Codex Stage-5 BLOCKER #5).
 *
 * `build-judging-bundle.mjs` consumes untrusted-shaped data (an external secret
 * randomization map, and run-manifest.json files) and turns fields from that data
 * into filesystem paths. This suite proves the script fails closed: it never
 * creates a directory or writes/copies a file until every presentation in the
 * secret map has been fully preflighted (commitment verified, map structurally
 * validated, every artifact/screenshot path strictly contained + hash-verified),
 * and it never packages a secret map whose bytes don't match the committed hash.
 *
 * Hard constraints, mirrored from tests/spec-022-prereg.test.ts (owned by another
 * builder working concurrently — this file does not touch it):
 *   - The script is invoked ONLY as a subprocess via its CLI contract
 *     (`--spec-dir <dir> --secret-map <file>`), never imported.
 *   - Nothing under specs/022-taste-transfer-prereg/scripts/ is imported directly
 *     (this file computes its own SHA-256 locally via node:crypto rather than
 *     importing scripts/lib/hash.mjs, which may be under parallel refactor).
 *   - Every fixture lives in a throwaway temp dir; the real repo is never
 *     mutated and `runs/` is never created there.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..");
const SPEC_REL = "specs/022-taste-transfer-prereg";
const SPEC_SRC = join(REPO_ROOT, SPEC_REL);
const SCRIPT_PATH = join(SPEC_SRC, "scripts", "build-judging-bundle.mjs");

// ---------------------------------------------------------------------------
// Small local shapes — only the fields these tests touch are typed.
// ---------------------------------------------------------------------------

interface PresentationFixture {
  presentation_id: string;
  pair_id: string;
  phase: "A" | "B";
  left_code: string;
  right_code: string;
  left_arm: "control" | "treatment";
  presentation_order: number;
  is_duplicate: boolean;
  endpoint_primary: boolean;
}

interface MutableManifest {
  artifacts: {
    initial: { path: string; sha256: string };
    repaired: { path: string; sha256: string } | null;
    primary: string;
  };
  screenshots: { viewport: number; path: string; sha256: string }[];
  [key: string]: unknown;
}

interface CommitmentSchemaShape {
  properties: {
    phase_a_presentations: { const: number; [key: string]: unknown };
    phase_b_presentations: { const: number; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface Fixture {
  specParent: string;
  specDir: string;
  secretDir: string;
  secretMapPath: string;
}

interface ExecError {
  status?: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
}

interface RunResult {
  status: number;
  stdout: string;
  stderr: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function must<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function judgingRoot(specDir: string): string {
  return join(specDir, "runs", "judging");
}

function walkAllFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkAllFiles(p));
    else out.push(p);
  }
  return out;
}

function isExecError(err: unknown): err is ExecError {
  return typeof err === "object" && err !== null;
}

/** Runs the REAL script (never a copy) against a fixture spec dir + secret map. */
function runScript(specDir: string, secretMapPath: string): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT_PATH, "--spec-dir", specDir, "--secret-map", secretMapPath], {
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    if (!isExecError(err)) throw err;
    return {
      status: typeof err.status === "number" ? err.status : -1,
      stdout: typeof err.stdout === "string" ? err.stdout : "",
      stderr: typeof err.stderr === "string" ? err.stderr : "",
    };
  }
}

function relaxCommitmentSchemaConsts(specDir: string, phaseA: number, phaseB: number): void {
  const p = join(specDir, "schemas", "randomization-commitment.schema.json");
  const schema = JSON.parse(readFileSync(p, "utf8")) as CommitmentSchemaShape;
  schema.properties.phase_a_presentations.const = phaseA;
  schema.properties.phase_b_presentations.const = phaseB;
  writeFileSync(p, JSON.stringify(schema, null, 2));
}

function buildManifest(
  fields: { runId: string; pairId: string; phase: "A" | "B"; family: string; arm: "control" | "treatment" },
  artifactPath: string,
  artifactBytes: Buffer,
  screenshots: { viewport: 390 | 768 | 1440; path: string; sha256: string }[],
): MutableManifest {
  return {
    run_id: fields.runId,
    pair_id: fields.pairId,
    phase: fields.phase,
    family: fields.family,
    candidate_id: null,
    arm: fields.arm,
    brief_id: fields.pairId,
    brief_hash: "e".repeat(64),
    prereg_commit: "0".repeat(40),
    control_commit: "0".repeat(40),
    upstream_commit: "0".repeat(40),
    provider: { name: "test", model_id: "test-model", params_note: "n/a" },
    patch_path: null,
    patch_hash: null,
    source_hashes: ["a".repeat(64)],
    prompt_hash: "b".repeat(64),
    tree_clean: true,
    generated_at: new Date().toISOString(),
    artifacts: {
      initial: { path: artifactPath, sha256: sha256Hex(artifactBytes) },
      repaired: null,
      primary: "initial",
    },
    gates: {
      initial: { envelope_path: "gates/initial.json", sha256: "c".repeat(64), pass: true },
      post_repair: null,
    },
    repair: { performed: false, findings_hash: null },
    console_log: { path: "console.log", sha256: "d".repeat(64) },
    screenshots,
    reduced_motion_capture: null,
  };
}

function writeRunDir(
  specDir: string,
  relDir: string,
  fields: { runId: string; pairId: string; phase: "A" | "B"; family: string; arm: "control" | "treatment" },
  htmlText: string,
): void {
  const dirAbs = join(specDir, relDir);
  mkdirSync(dirAbs, { recursive: true });
  const htmlBytes = Buffer.from(htmlText, "utf8");
  writeFileSync(join(dirAbs, "initial.html"), htmlBytes);
  const screenshots = ([390, 768, 1440] as const).map((viewport) => {
    const bytes = Buffer.from(`shot-${viewport}-${relDir}`, "utf8");
    const fname = `shot-${viewport}.png`;
    writeFileSync(join(dirAbs, fname), bytes);
    return { viewport, path: fname, sha256: sha256Hex(bytes) };
  });
  const manifest = buildManifest(fields, "initial.html", htmlBytes, screenshots);
  writeFileSync(join(dirAbs, "run-manifest.json"), JSON.stringify(manifest, null, 2));
}

function writeAllRunDirs(specDir: string): void {
  // Body text is deliberately identity-free (no brief id, no arm word): the
  // output identity scan (amendment item 2 part 3) fails closed on exactly
  // those tokens, and this fixture is testing well-formed bundling, not the
  // leak scan (that has its own dedicated coverage below).
  writeRunDir(
    specDir,
    "runs/phase-a/PA-AES-1/control",
    { runId: "PA-AES-1-control", pairId: "PA-AES-1", phase: "A", family: "aesthetics", arm: "control" },
    "<html><head><title>orig</title></head><body>Fixture artifact, side one.</body></html>",
  );
  writeRunDir(
    specDir,
    "runs/phase-a/PA-AES-1/treatment",
    { runId: "PA-AES-1-treatment", pairId: "PA-AES-1", phase: "A", family: "aesthetics", arm: "treatment" },
    "<html><head><title>orig</title></head><body>Fixture artifact, side two.</body></html>",
  );
  writeRunDir(
    specDir,
    "runs/phase-b/PB-A1-1/control",
    { runId: "PB-A1-1-control", pairId: "PB-A1-1", phase: "B", family: "aesthetics", arm: "control" },
    "<html><head><title>orig</title></head><body>Fixture artifact, side three.</body></html>",
  );
  writeRunDir(
    specDir,
    "runs/phase-b/PB-A1-1/treatment",
    { runId: "PB-A1-1-treatment", pairId: "PB-A1-1", phase: "B", family: "aesthetics", arm: "treatment" },
    "<html><head><title>orig</title></head><body>Fixture artifact, side four.</body></html>",
  );
}

function defaultPresentations(): PresentationFixture[] {
  return [
    {
      presentation_id: "PR-00000001",
      pair_id: "PA-AES-1",
      phase: "A",
      left_code: "aaaaaaa1",
      right_code: "bbbbbbb1",
      left_arm: "control",
      presentation_order: 1,
      is_duplicate: false,
      endpoint_primary: true,
    },
    {
      presentation_id: "PR-00000002",
      pair_id: "PB-A1-1",
      phase: "B",
      left_code: "aaaaaaa2",
      right_code: "bbbbbbb2",
      left_arm: "treatment",
      presentation_order: 2,
      is_duplicate: false,
      endpoint_primary: true,
    },
  ];
}

/**
 * Writes the secret map (real bytes) + a matching randomization-commitment.json,
 * relaxing the (otherwise 20/36-const) commitment schema in THIS temp copy only
 * so a small, focused fixture can satisfy "exactly phase_a_presentations +
 * phase_b_presentations records" without needing the full 56-presentation
 * protocol shape.
 */
function writeSecretMapAndCommitment(
  specDir: string,
  secretMapPath: string,
  presentations: PresentationFixture[],
  opts: { secretMapSha256Override?: string } = {},
): void {
  const map = { version: "1", created_at: new Date().toISOString(), presentations };
  const mapBytes = Buffer.from(JSON.stringify(map, null, 2), "utf8");
  writeFileSync(secretMapPath, mapBytes);
  const realHash = sha256Hex(mapBytes);
  const phaseACount = presentations.filter((p) => p.phase === "A").length;
  const phaseBCount = presentations.filter((p) => p.phase === "B").length;
  relaxCommitmentSchemaConsts(specDir, phaseACount, phaseBCount);
  const commitment = {
    version: "1",
    created_at: new Date().toISOString(),
    csprng: "node:crypto.randomBytes",
    secret_map_location: secretMapPath,
    secret_map_sha256: opts.secretMapSha256Override ?? realHash,
    phase_a_pairs: 16,
    phase_a_presentations: phaseACount,
    phase_b_pairs: 36,
    phase_b_presentations: phaseBCount,
    codename_format: "8-hex-lowercase",
    presentation_id_format: "PR-8hex",
    committed_before_render: true,
  };
  writeFileSync(join(specDir, "randomization-commitment.json"), JSON.stringify(commitment, null, 2));
}

function setupBaseFixture(): Fixture {
  const specParent = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-judging-spec-")));
  const specDir = join(specParent, "spec");
  cpSync(SPEC_SRC, specDir, { recursive: true });
  const secretDir = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-judging-secret-")));
  const secretMapPath = join(secretDir, "randomization-map.secret.json");

  writeAllRunDirs(specDir);
  writeSecretMapAndCommitment(specDir, secretMapPath, defaultPresentations());

  return { specParent, specDir, secretDir, secretMapPath };
}

function cleanupFixture(f: Fixture): void {
  rmSync(f.specParent, { recursive: true, force: true });
  rmSync(f.secretDir, { recursive: true, force: true });
}

/**
 * Build -> mutate -> run -> inspect -> always clean up, even on assertion
 * failure. `inspect` runs BEFORE cleanup deletes the fixture, so it — not the
 * caller after this function returns — is where post-run filesystem
 * assertions belong.
 */
function withFixture(mutate: (f: Fixture) => void, inspect: (result: RunResult, f: Fixture) => void): void {
  const f = setupBaseFixture();
  try {
    mutate(f);
    const result = runScript(f.specDir, f.secretMapPath);
    inspect(result, f);
  } finally {
    cleanupFixture(f);
  }
}

// ---------------------------------------------------------------------------
// VALID BUNDLE
// ---------------------------------------------------------------------------

describe("valid bundle", () => {
  it("a well-formed 2-presentation fixture produces expected bundles, exit 0, and touches nothing outside the run dirs", () => {
    withFixture(
      (f) => {
        // Sentinel file outside any run dir, inside the spec dir — must never
        // be read into a bundle.
        writeFileSync(join(f.specDir, "sentinel-outside.txt"), "SENTINEL-CONTENT-OUTSIDE-RUN-DIRS");
      },
      (result, f) => {
        expect(result.status).toBe(0);

        const bundle1 = join(judgingRoot(f.specDir), "PR-00000001");
        const bundle2 = join(judgingRoot(f.specDir), "PR-00000002");
        expect(existsSync(bundle1)).toBe(true);
        expect(existsSync(bundle2)).toBe(true);

        expect(existsSync(join(bundle1, "aaaaaaa1.html"))).toBe(true);
        expect(existsSync(join(bundle1, "bbbbbbb1.html"))).toBe(true);
        expect(existsSync(join(bundle1, "brief-facts.md"))).toBe(true);
        expect(existsSync(join(bundle2, "aaaaaaa2.html"))).toBe(true);
        expect(existsSync(join(bundle2, "bbbbbbb2.html"))).toBe(true);
        expect(existsSync(join(bundle2, "brief-facts.md"))).toBe(true);
        for (const viewport of [390, 768, 1440]) {
          expect(existsSync(join(bundle1, `aaaaaaa1.${viewport}.png`))).toBe(true);
          expect(existsSync(join(bundle1, `bbbbbbb1.${viewport}.png`))).toBe(true);
          expect(existsSync(join(bundle2, `aaaaaaa2.${viewport}.png`))).toBe(true);
          expect(existsSync(join(bundle2, `bbbbbbb2.${viewport}.png`))).toBe(true);
        }

        const html = readFileSync(join(bundle1, "aaaaaaa1.html"), "utf8");
        expect(html).toContain("<title>aaaaaaa1</title>");
        expect(html).not.toContain("orig"); // <title>orig</title> was replaced with the codename

        // Nothing outside the run dirs was ever read or copied into the output.
        const allBundleFiles = walkAllFiles(judgingRoot(f.specDir));
        expect(allBundleFiles.some((p) => p.endsWith("sentinel-outside.txt"))).toBe(false);
        for (const p of allBundleFiles) {
          const content = readFileSync(p);
          expect(content.toString("utf8")).not.toContain("SENTINEL-CONTENT-OUTSIDE-RUN-DIRS");
        }
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Traversal
// ---------------------------------------------------------------------------

describe("path traversal", () => {
  it("an artifact path escaping the run dir via '..' segments is rejected, nothing written", () => {
    withFixture(
      (f) => {
        // Sentinel one level ABOVE the control run dir — still inside the
        // spec dir, but outside that run's own directory.
        writeFileSync(join(f.specDir, "runs/phase-a/PA-AES-1/escaped-sentinel.html"), "<html>SENTINEL-TRAVERSAL</html>");

        const manifestPath = join(f.specDir, "runs/phase-a/PA-AES-1/control/run-manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as MutableManifest;
        manifest.artifacts.initial.path = "../escaped-sentinel.html";
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/FATAL/);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Absolute path
// ---------------------------------------------------------------------------

describe("absolute path", () => {
  it("a screenshot path that is absolute is rejected, nothing copied", () => {
    const outsideDir = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-judging-outside-")));
    try {
      withFixture(
        (f) => {
          const outsidePath = join(outsideDir, "outside.png");
          writeFileSync(outsidePath, "SENTINEL-ABSOLUTE");

          const manifestPath = join(f.specDir, "runs/phase-a/PA-AES-1/control/run-manifest.json");
          const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as MutableManifest;
          const shot0 = must(manifest.screenshots[0], "expected at least one screenshot");
          shot0.path = outsidePath;
          writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        },
        (result, f) => {
          expect(result.status).toBe(1);
          expect(existsSync(judgingRoot(f.specDir))).toBe(false);
        },
      );
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Symlink
// ---------------------------------------------------------------------------

describe("symlink", () => {
  it("an artifact path that is a symlink to a file outside the run dir is rejected", () => {
    withFixture(
      (f) => {
        const outsideFile = join(f.specDir, "outside-secret.html");
        writeFileSync(outsideFile, "<html>SENTINEL-SYMLINK</html>");

        const runDir = join(f.specDir, "runs/phase-a/PA-AES-1/control");
        const linkPath = join(runDir, "initial-link.html");
        symlinkSync(outsideFile, linkPath);

        const manifestPath = join(runDir, "run-manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as MutableManifest;
        manifest.artifacts.initial.path = "initial-link.html";
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// presentation_id traversal
// ---------------------------------------------------------------------------

describe("presentation_id traversal", () => {
  it("a presentation_id that fails ^PR-[0-9a-f]{8}$ is rejected before any directory is created", () => {
    let beforeTopLevel: string[] = [];
    withFixture(
      (f) => {
        beforeTopLevel = readdirSync(f.specDir).sort();
        const presentations = defaultPresentations();
        const first = must(presentations[0], "expected first presentation");
        first.presentation_id = "../../escape";
        writeSecretMapAndCommitment(f.specDir, f.secretMapPath, presentations);
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
        // No stray directory appeared at the spec-dir root (the commitment
        // file rewrite is the only expected top-level change, already present
        // before).
        const afterTopLevel = readdirSync(f.specDir).sort();
        expect(afterTopLevel).toEqual(beforeTopLevel);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Wrong artifact hash
// ---------------------------------------------------------------------------

describe("wrong artifact hash", () => {
  it("a recorded artifact sha256 that does not match the file bytes is rejected", () => {
    withFixture(
      (f) => {
        const manifestPath = join(f.specDir, "runs/phase-a/PA-AES-1/control/run-manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as MutableManifest;
        manifest.artifacts.initial.sha256 = "f".repeat(64);
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Wrong commitment (secret-map hash mismatch)
// ---------------------------------------------------------------------------

describe("wrong commitment", () => {
  it("secret-map bytes that do not hash to commitment.secret_map_sha256 are rejected, nothing written", () => {
    withFixture(
      (f) => {
        writeSecretMapAndCommitment(f.specDir, f.secretMapPath, defaultPresentations(), {
          secretMapSha256Override: "0".repeat(64),
        });
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/FATAL/);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Missing/invalid commitment
// ---------------------------------------------------------------------------

describe("missing/invalid commitment", () => {
  it("a missing randomization-commitment.json is rejected", () => {
    withFixture(
      (f) => {
        rmSync(join(f.specDir, "randomization-commitment.json"));
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/FATAL/);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
      },
    );
  });

  it("a commitment that fails schema validation (wrong type) is rejected", () => {
    withFixture(
      (f) => {
        const commitmentPath = join(f.specDir, "randomization-commitment.json");
        const commitment = JSON.parse(readFileSync(commitmentPath, "utf8")) as Record<string, unknown>;
        commitment.phase_a_pairs = "sixteen"; // schema requires an integer const
        writeFileSync(commitmentPath, JSON.stringify(commitment, null, 2));
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// B4 — media-asset identity neutralization, and B9 — real brief-facts.md.
//
// PA-MED-1 (Phase A) and PB-A1-1 (Phase B) are REAL frozen briefs from the
// pilot's own phase-a-briefs.json / phase-b-briefs.json — copied in wholesale
// by setupBaseFixture/setupMediaFixture (cpSync of the whole spec dir), so
// these tests exercise the real brief text and the real 30-asset media pack,
// not synthetic stand-ins.
// ---------------------------------------------------------------------------

const PA_MED_1_ASSET_ID = "PA-MED-1-wide-1";
const PA_MED_1_ASSET_REL = join("assets", "brief-media", "PA-MED-1-wide-1.jpg");
// A REAL committed asset id belonging to a DIFFERENT brief (PA-MED-2) — used to
// prove an id that cannot be neutralized in PA-MED-1's context fails closed.
const FOREIGN_ASSET_ID = "PA-MED-2-headshot-1";

function mediaHtml(assetRef: string): string {
  return `<html><head><title>orig</title></head><body><img src="../../../${assetRef}" alt="hero"></body></html>`;
}

function mediaPresentations(): PresentationFixture[] {
  return [
    {
      presentation_id: "PR-0000000a",
      pair_id: "PA-MED-1",
      phase: "A",
      left_code: "1111111a",
      right_code: "2222222a",
      left_arm: "control",
      presentation_order: 1,
      is_duplicate: false,
      endpoint_primary: true,
    },
  ];
}

function setupMediaFixture(assetRef: string): Fixture {
  const specParent = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-judging-media-spec-")));
  const specDir = join(specParent, "spec");
  cpSync(SPEC_SRC, specDir, { recursive: true });
  const secretDir = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-judging-media-secret-")));
  const secretMapPath = join(secretDir, "randomization-map.secret.json");

  const html = mediaHtml(assetRef);
  writeRunDir(specDir, "runs/phase-a/PA-MED-1/control", { runId: "PA-MED-1-control", pairId: "PA-MED-1", phase: "A", family: "media", arm: "control" }, html);
  writeRunDir(specDir, "runs/phase-a/PA-MED-1/treatment", { runId: "PA-MED-1-treatment", pairId: "PA-MED-1", phase: "A", family: "media", arm: "treatment" }, html);
  writeSecretMapAndCommitment(specDir, secretMapPath, mediaPresentations());

  return { specParent, specDir, secretDir, secretMapPath };
}

function withMediaFixture(
  assetRef: string,
  mutate: (f: Fixture) => void,
  inspect: (result: RunResult, f: Fixture) => void,
): void {
  const f = setupMediaFixture(assetRef);
  try {
    mutate(f);
    const result = runScript(f.specDir, f.secretMapPath);
    inspect(result, f);
  } finally {
    cleanupFixture(f);
  }
}

describe("media asset neutralization (B4)", () => {
  it("a media-asset pair's emitted HTML uses the neutral name, never the committed asset id, and never the assets/brief-media directory", () => {
    withMediaFixture(
      PA_MED_1_ASSET_REL,
      () => {},
      (result, f) => {
        expect(result.status).toBe(0);
        const bundle = join(judgingRoot(f.specDir), "PR-0000000a");
        const html = readFileSync(join(bundle, "1111111a.html"), "utf8");

        expect(html).toContain("wide-1");
        expect(html).not.toContain(PA_MED_1_ASSET_ID);
        expect(html).not.toContain("PA-MED-1"); // the brief id itself
        expect(html).not.toContain("assets/brief-media");
      },
    );
  });

  it("the referenced asset is copied into the bundle under its neutral name with byte-identical content", () => {
    withMediaFixture(
      PA_MED_1_ASSET_REL,
      () => {},
      (result, f) => {
        expect(result.status).toBe(0);
        const bundle = join(judgingRoot(f.specDir), "PR-0000000a");
        // codename-prefixed per-side bundle filename (R3 item 1, "asset-" infix
        // per the build's documented deviation from the literal "media-" infix,
        // which collides with this pilot's own "media" family name): "1111111a"
        // is the left/control codename for this presentation (mediaPresentations()).
        const copiedPath = join(bundle, "1111111a.asset-wide-1.jpg");
        expect(existsSync(copiedPath)).toBe(true);

        const copiedBytes = readFileSync(copiedPath);
        const sourceBytes = readFileSync(join(f.specDir, PA_MED_1_ASSET_REL));
        expect(sha256Hex(copiedBytes)).toBe(sha256Hex(sourceBytes));
        expect(copiedBytes.equals(sourceBytes)).toBe(true);
      },
    );
  });

  it("an asset id that cannot be neutralized (real, but not in this brief's supplied set) fails closed, nothing written", () => {
    withMediaFixture(
      // PA-MED-2-headshot-1 is a REAL committed asset id, but it is not among
      // PA-MED-1's supplied_assets, so PA-MED-1's neutral-name map has no entry
      // for it — it must survive unrewritten and trip the leak assertion.
      join("assets", "brief-media", `${FOREIGN_ASSET_ID}.jpg`),
      () => {},
      (result, f) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/FATAL/);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
      },
    );
  });

  it("a supplied asset whose recorded sha256 in brief-media-manifest.json does not match its bytes aborts before any write", () => {
    withMediaFixture(
      PA_MED_1_ASSET_REL,
      (f) => {
        const manifestPath = join(f.specDir, "assets", "brief-media-manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { assets: { asset_id: string; sha256: string }[] };
        const rec = must(
          manifest.assets.find((a) => a.asset_id === PA_MED_1_ASSET_ID),
          "expected PA-MED-1-wide-1 record in brief-media-manifest.json",
        );
        rec.sha256 = "f".repeat(64);
        writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(result.stderr).toMatch(/FATAL/);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// B9 — real codename-neutral brief-facts.md
// ---------------------------------------------------------------------------

describe("brief-facts.md (B9)", () => {
  it("names the brief's title/surface, lists neutral asset names, and contains no arm word, candidate id, family, brief id, or leak_definition text (Phase A, PA-MED-1)", () => {
    withMediaFixture(
      PA_MED_1_ASSET_REL,
      () => {},
      (result, f) => {
        expect(result.status).toBe(0);
        const bundle = join(judgingRoot(f.specDir), "PR-0000000a");
        const facts = readFileSync(join(bundle, "brief-facts.md"), "utf8");

        // Names the surface (title + content_requirements, verbatim from the
        // real frozen PA-MED-1 brief).
        expect(facts).toContain("Climate campaign hero");
        expect(facts).toContain("wide-1");

        // No identity leak.
        expect(facts).not.toContain("PA-MED-1"); // brief id
        expect(facts).not.toMatch(/\bmedia\b/i); // family value ("media")
        expect(facts).not.toMatch(/\b(control|treatment)\b/i); // banned arm words
        expect(facts).not.toContain("leak_definition");
        expect(facts).not.toContain(PA_MED_1_ASSET_ID); // committed asset id
      },
    );
  });

  it("carries the Phase-B embedded anti-context state and its inactive requirement, but never leak_definition (PB-A1-1)", () => {
    withFixture(
      () => {},
      (result, f) => {
        expect(result.status).toBe(0);
        const bundle = join(judgingRoot(f.specDir), "PR-00000002"); // PB-A1-1, per defaultPresentations()
        const facts = readFileSync(join(bundle, "brief-facts.md"), "utf8");

        // Real PB-A1-1 anti_context fields, verbatim.
        expect(facts).toContain("live system-status panel showing trailing uptime");
        expect(facts).toContain("the status panel stays plain-functional");

        // Never the leak definition, and never identity.
        expect(facts).not.toContain("asymmetric composition, narrative media bands, or decorative accent markers applied inside the status panel constitutes a leak");
        expect(facts).not.toContain("leak_definition");
        expect(facts).not.toContain("PB-A1-1"); // brief id
        expect(facts).not.toContain("aesthetics"); // family
        expect(facts).not.toMatch(/\bA1\b/); // candidate id
        expect(facts).not.toMatch(/\b(control|treatment)\b/i);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Partial-bundle safety (preflight-before-write)
// ---------------------------------------------------------------------------

describe("partial-bundle safety", () => {
  it("an invalid second presentation means the first (valid) presentation's bundle is never written either", () => {
    withFixture(
      (f) => {
        // Break presentation 2's backing render entirely while presentation 1
        // remains fully valid.
        rmSync(join(f.specDir, "runs/phase-b/PB-A1-1"), { recursive: true, force: true });
      },
      (result, f) => {
        expect(result.status).toBe(1);
        expect(existsSync(judgingRoot(f.specDir))).toBe(false);
        expect(existsSync(join(judgingRoot(f.specDir), "PR-00000001"))).toBe(false);
      },
    );
  });
});
