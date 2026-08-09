/**
 * Spec-022 fix-spec F7 — "Exact media-manifest contract" — PR-014 focused suite.
 *
 * PR-014 now validates the COMPLETE `assets/brief-media-manifest.json` (all 30
 * records), not only brief-referenced ones. This file proves, for every numbered
 * rule in F7: (a) the real frozen 30-asset pack satisfies it (the positive
 * baseline stays green), and (b) exactly one isolated mutation per rule trips a
 * distinct `PR-014` `severity:"error"` finding.
 *
 * Hard constraint (matches tests/spec-022-prereg.test.ts's convention): the
 * validator is invoked ONLY as a subprocess via its CLI contract
 * (`--mode <mode> --json`), never imported directly. Each test copies the real
 * committed spec-022 tree into a throwaway temp dir, applies exactly one
 * mutation, runs the copy's own `scripts/validate-prereg.mjs`, and always cleans
 * up in a `finally`.
 *
 * This file does not edit tests/spec-022-prereg.test.ts — that file is owned by
 * another concurrent workstream.
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
const SPEC_REL = "specs/022-taste-transfer-prereg"; // layout inside the synthetic repo
const SPEC_SRC = join(REPO_ROOT, "tests/fixtures/spec-022-prereg"); // where the fixture lives here

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
// Minimal local shapes for the JSON this suite mutates.
// ---------------------------------------------------------------------------

interface AssetRecord {
  asset_id: string;
  role: string;
  path: string;
  sha256: string;
  width: number;
  height: number;
  licence: string;
  licence_source_label?: string;
  licence_url: string;
  licence_url_origin?: string;
  creator: string;
  api_artist_record?: string;
  source_title?: string;
  source_url: string;
  source_original_url: string;
  source_downloaded_derivative_url: string;
  source_sha1: string;
  source_revision_timestamp: string;
  crop_method: string;
  identity_disclaimer: string | null;
  [key: string]: unknown;
}

interface RequiredRoleEntry {
  role: string;
  count: number;
  ratio_contract: string;
  asset_ids: string[];
}

interface AssetManifestFile {
  version: number;
  status: string;
  note: string;
  required_roles: RequiredRoleEntry[];
  assets: AssetRecord[];
  source_policy: string;
  asset_count: number;
  [key: string]: unknown;
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
 * Copies the real committed spec-022 tree into a throwaway temp dir, preserving
 * the `<root>/specs/022-taste-transfer-prereg/...` layout the validator expects
 * (it derives both its spec dir and its repo root from its own
 * `import.meta.url`). `realpathSync` matters on macOS — see the identical note
 * in tests/spec-022-prereg.test.ts.
 */
function makeCopy(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-media-manifest-")));
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

function readManifest(root: string): AssetManifestFile {
  return readJsonFile<AssetManifestFile>(root, "assets/brief-media-manifest.json");
}

function writeManifest(root: string, manifest: AssetManifestFile): void {
  writeJsonFile(root, "assets/brief-media-manifest.json", manifest);
}

function findAsset(manifest: AssetManifestFile, assetId: string): AssetRecord {
  return must(
    manifest.assets.find((a) => a.asset_id === assetId),
    `expected asset ${assetId} to exist in the manifest`,
  );
}

/** Minimal, spec-compliant JPEG (SOF0) header — enough for `imageDimensions` to parse. */
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

/** Overwrites an existing asset's on-disk bytes with a synthetic JPEG and re-syncs its sha256 in the manifest. */
function rewriteAssetBytes(root: string, assetId: string, width: number, height: number): Buffer {
  const manifest = readManifest(root);
  const rec = findAsset(manifest, assetId);
  const bytes = jpegHeader(width, height);
  writeFileSync(specPath(root, rec.path), bytes);
  rec.sha256 = sha256Hex(bytes);
  writeManifest(root, manifest);
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

function pr014Errors(result: RunResult): Finding[] {
  expect(result.envelope).not.toBeNull();
  const envelope = result.envelope as Envelope;
  return envelope.findings.filter((f) => f.checkId === "PR-014" && f.severity === "error");
}

function expectPr014ErrorMatching(result: RunResult, substring: string): void {
  const errors = pr014Errors(result);
  expect(result.status).toBe(1);
  expect(errors.some((f) => f.message.includes(substring))).toBe(true);
}

// Real asset ids used as mutation targets, one per role.
const WIDE_ID = "PA-MED-1-wide-1";
const OTHER_WIDE_ID = "PB-P1-1-wide-1";
const MACRO_ID = "PA-MED-3-macro-1";
const HEADSHOT_ID = "PA-MED-2-headshot-1";
const PORTRAIT_ID = "PA-MED-2-portrait-1";
const DIRECTORY_HEADSHOT_ID = "PB-P2-1-directory-headshot-1";
const PRESSKIT_HEADSHOT_ID = "PB-P2-3-presskit-headshot-1";

// ---------------------------------------------------------------------------
// Positive baseline — the real frozen pack must stay green under every rule.
// ---------------------------------------------------------------------------

describe("PR-014 positive baseline", () => {
  // Scoped deliberately to PR-014 only: this file's job is the media-manifest
  // contract, not the whole envelope. Other checks (owned/refactored by other
  // concurrent workstreams per BUILD-CONTRACT Article IX) may independently carry
  // errors or warnings without that being a PR-014 regression.
  it("the unmutated real 30-asset pack has zero PR-014 error findings at --mode pre-freeze", () => {
    const result = withMutatedCopy(() => {});
    expect(result.envelope).not.toBeNull();
    expect(pr014Errors(result)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Rule 1 — exact size (30) + asset_count agreement
// ---------------------------------------------------------------------------

describe("Rule 1 — assets.length === 30 and asset_count agreement", () => {
  it("dropping a record breaks the exact-30 count", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      manifest.assets = manifest.assets.filter((a) => a.asset_id !== WIDE_ID);
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, "expected 30 assets, got 29");
  });

  it("an asset_count that disagrees with assets.length errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      manifest.asset_count = 31;
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, "asset_count (31) does not equal assets.length (30)");
  });
});

// ---------------------------------------------------------------------------
// Rule 2 — local-record uniqueness (asset_id, path, sha256)
// ---------------------------------------------------------------------------

describe("Rule 2 — asset_id / path / sha256 uniqueness", () => {
  it("a duplicated asset_id errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      const rec = findAsset(manifest, OTHER_WIDE_ID);
      rec.asset_id = WIDE_ID;
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `duplicate asset_id "${WIDE_ID}"`);
  });

  it("a duplicated path errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      const first = findAsset(manifest, WIDE_ID);
      const second = findAsset(manifest, OTHER_WIDE_ID);
      second.path = first.path;
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `duplicate path "${findAssetPathFixture()}"`);
  });

  it("two records sharing identical local bytes (same sha256, different paths) errors even though paths differ", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      const first = findAsset(manifest, WIDE_ID);
      const second = findAsset(manifest, OTHER_WIDE_ID);
      second.sha256 = first.sha256;
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, "duplicate sha256");
    expectPr014ErrorMatching(result, "duplicate local bytes are rejected even when paths differ");
  });
});

// Helper kept separate because it needs the real manifest's path value, read
// once from the committed source tree (not a temp copy) purely for the
// assertion string above.
function findAssetPathFixture(): string {
  const manifest = JSON.parse(readFileSync(join(SPEC_SRC, "assets/brief-media-manifest.json"), "utf8")) as AssetManifestFile;
  return must(
    manifest.assets.find((a) => a.asset_id === WIDE_ID),
    "expected fixture asset to exist",
  ).path;
}

// ---------------------------------------------------------------------------
// Rule 3 — exact role census
// ---------------------------------------------------------------------------

describe("Rule 3 — exact role counts", () => {
  it("changing one wide asset's role to macro breaks both role counts", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).role = "macro";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, 'role "wide": expected 9 assets, got 8');
    expectPr014ErrorMatching(result, 'role "macro": expected 6 assets, got 7');
  });
});

// ---------------------------------------------------------------------------
// Rule 4 — exact role-to-required-ID mapping
// ---------------------------------------------------------------------------

describe("Rule 4 — required_roles.asset_ids exact match (substitution)", () => {
  it("substituting one required_roles asset_id for a nonexistent one errors, without touching count", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      const wideEntry = must(
        manifest.required_roles.find((r) => r.role === "wide"),
        "expected a wide required_roles entry",
      );
      const idx = wideEntry.asset_ids.indexOf(WIDE_ID);
      wideEntry.asset_ids[idx] = "PA-MED-1-wide-99";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, 'required_roles role "wide": manifest asset_ids do not exactly match required_roles.asset_ids');
    expectPr014ErrorMatching(result, "missing: PA-MED-1-wide-99");
    expectPr014ErrorMatching(result, `extra: ${WIDE_ID}`);
  });
});

// ---------------------------------------------------------------------------
// Rule 5 — brief-reference role agreement (longest-suffix decoding)
// ---------------------------------------------------------------------------

describe("Rule 5 — brief reference asset_id role vs manifest record role", () => {
  it("a directory-headshot record relabelled as headshot disagrees with its brief-encoded role", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, DIRECTORY_HEADSHOT_ID).role = "headshot";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(
      result,
      `asset ${DIRECTORY_HEADSHOT_ID}: brief reference role "directory-headshot" disagrees with manifest record role "headshot"`,
    );
  });
});

// ---------------------------------------------------------------------------
// Rule 6 — no unreferenced record
// ---------------------------------------------------------------------------

describe("Rule 6 — every manifest record must be referenced by at least one brief", () => {
  it("adding a valid, fully-provenanced, but unreferenced record errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      const rel = "assets/brief-media/TEST-UNREFERENCED-wide-1.jpg";
      const bytes = jpegHeader(1600, 900);
      writeFileSync(specPath(root, rel), bytes);
      const extra: AssetRecord = {
        asset_id: "TEST-UNREFERENCED-wide-1",
        role: "wide",
        path: rel,
        sha256: sha256Hex(bytes),
        width: 1600,
        height: 900,
        licence: "CC0",
        licence_url: "https://creativecommons.org/publicdomain/zero/1.0/deed.en",
        creator: "Fixture Creator",
        source_url: "https://commons.wikimedia.org/wiki/File:TEST-UNREFERENCED.jpg",
        source_original_url: "https://upload.wikimedia.org/wikipedia/commons/9/99/TEST-UNREFERENCED.jpg",
        source_downloaded_derivative_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/TEST-UNREFERENCED.jpg/1920px-TEST-UNREFERENCED.jpg",
        source_sha1: "a".repeat(40),
        source_revision_timestamp: "2024-01-01T00:00:00Z",
        crop_method: "test fixture",
        identity_disclaimer: null,
      };
      manifest.assets.push(extra);
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, "asset TEST-UNREFERENCED-wide-1: manifest record is not referenced by any brief");
  });
});

// ---------------------------------------------------------------------------
// Rule 7 — on-disk file safety, existence, and hash
// ---------------------------------------------------------------------------

describe("Rule 7 — file existence and sha256 integrity", () => {
  it("a manifest record whose file is missing on disk errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      const rec = findAsset(manifest, WIDE_ID);
      rmSync(specPath(root, rec.path));
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: file does not exist on disk`);
  });

  it("a sha256 that does not match the actual file bytes errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).sha256 = "f".repeat(64);
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: sha256 mismatch`);
  });
});

// ---------------------------------------------------------------------------
// Rule 8 — declared dimensions vs parsed bytes, and ratio-vs-role
// ---------------------------------------------------------------------------

describe("Rule 8 — declared/parsed dimension agreement and ratio contract", () => {
  it("declared width/height disagreeing with the actual bytes errors, holding ratio constant", () => {
    const result = withMutatedCopy((root) => {
      // New bytes are still 16:9 (ratio holds) but a different absolute size than
      // the declared 1600x900, isolating this to the dimension-mismatch branch.
      rewriteAssetBytes(root, WIDE_ID, 1440, 810);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: declared dimensions 1600x900 do not match parsed dimensions 1440x810`);
    const errors = pr014Errors(result);
    expect(errors.some((f) => f.message.includes(`asset ${WIDE_ID}`) && f.message.includes("ratio contract"))).toBe(false);
  });

  it("bytes whose ratio violates the declared role's contract errors, holding declared-vs-parsed dimensions equal", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      const rec = findAsset(manifest, WIDE_ID);
      // Rewrite bytes AND declared dimensions together to a square (wrong ratio for "wide")
      // so the declared/parsed dimension check stays satisfied and only the ratio
      // contract fails.
      const bytes = jpegHeader(900, 900);
      writeFileSync(specPath(root, rec.path), bytes);
      rec.sha256 = sha256Hex(bytes);
      rec.width = 900;
      rec.height = 900;
      writeManifest(root, manifest);
    });
    const errors = pr014Errors(result);
    expect(errors.some((f) => f.message.includes(`asset ${WIDE_ID}`) && f.message.includes("does not match parsed dimensions"))).toBe(false);
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: image dimensions do not satisfy the wide ratio contract`);
  });
});

// ---------------------------------------------------------------------------
// Rule 9 — provenance, every field required and individually checked
// ---------------------------------------------------------------------------

describe("Rule 9 — provenance fields", () => {
  it("a blanked creator errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).creator = "";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: creator is empty`);
  });

  it("an invented licence not on the allowlist errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).licence = "trust me";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: licence is not on the allowlist`);
  });

  it("a licence_url not on the allowlist errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).licence_url = "https://example.com/cc-by";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: licence_url is not on the allowlist`);
  });

  it("a source_url that is not a Commons File: URL errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).source_url = "https://example.com/wiki/File:Fixture.jpg";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: source_url is not a Commons File: URL`);
  });

  it("a source_original_url that is not an upload.wikimedia.org URL errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).source_original_url = "https://example.com/fixture.jpg";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: source_original_url is not an upload.wikimedia.org URL`);
  });

  it("a source_downloaded_derivative_url that is not an upload.wikimedia.org URL errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).source_downloaded_derivative_url = "https://example.com/fixture-thumb.jpg";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: source_downloaded_derivative_url is not an upload.wikimedia.org URL`);
  });

  it("a source_sha1 that is short/uppercase (not 40 lowercase hex) errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).source_sha1 = "ABCDEF0123";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: source_sha1 is not 40 lowercase hex characters`);
  });

  it("a source_revision_timestamp that is not strict ISO-8601 UTC errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).source_revision_timestamp = "2024-10-24 02:44:26";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: source_revision_timestamp is not a strict ISO-8601 UTC instant`);
  });

  it("a blanked crop_method errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).crop_method = "";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: crop_method is empty`);
  });
});

// ---------------------------------------------------------------------------
// Rule 10 — cross-record source-reuse uniqueness
// ---------------------------------------------------------------------------

describe("Rule 10 — duplicate source records rejected", () => {
  it("two records sharing the same source_sha1 errors even though everything else differs", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      const first = findAsset(manifest, WIDE_ID);
      const second = findAsset(manifest, OTHER_WIDE_ID);
      second.source_sha1 = first.source_sha1;
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `duplicate source_sha1 "${must(readManifestSourceSha1(), "expected source_sha1 fixture")}"`);
  });
});

function readManifestSourceSha1(): string {
  const manifest = JSON.parse(readFileSync(join(SPEC_SRC, "assets/brief-media-manifest.json"), "utf8")) as AssetManifestFile;
  return must(
    manifest.assets.find((a) => a.asset_id === WIDE_ID),
    "expected fixture asset to exist",
  ).source_sha1;
}

// ---------------------------------------------------------------------------
// Rule 11 — identity_disclaimer required for human roles, null for non-human
// ---------------------------------------------------------------------------

describe("Rule 11 — identity_disclaimer required-by-role", () => {
  it.each([
    ["headshot", HEADSHOT_ID],
    ["portrait", PORTRAIT_ID],
    ["directory-headshot", DIRECTORY_HEADSHOT_ID],
    ["presskit-headshot", PRESSKIT_HEADSHOT_ID],
  ])("a blanked identity_disclaimer on a %s (human) role errors", (_role, assetId) => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, assetId).identity_disclaimer = null;
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${assetId}: role "${_role}" requires a non-empty identity_disclaimer`);
  });

  it("a non-null identity_disclaimer on a wide (non-human) role errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, WIDE_ID).identity_disclaimer = "this should be null";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${WIDE_ID}: role "wide" must have identity_disclaimer set to null`);
  });

  it("a non-null identity_disclaimer on a macro (non-human) role errors", () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      findAsset(manifest, MACRO_ID).identity_disclaimer = "this should be null";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, `asset ${MACRO_ID}: role "macro" must have identity_disclaimer set to null`);
  });
});

// ---------------------------------------------------------------------------
// Rule 12 — status must be "complete" when 30 assets are present
// ---------------------------------------------------------------------------

describe('Rule 12 — status must be "complete" at 30 assets', () => {
  it('a status other than "complete" errors while 30 assets are present', () => {
    const result = withMutatedCopy((root) => {
      const manifest = readManifest(root);
      manifest.status = "in-progress";
      writeManifest(root, manifest);
    });
    expectPr014ErrorMatching(result, 'status is "in-progress" but must be "complete" when 30 assets are present');
  });
});
