/**
 * Spec-022 R8 (amendment item 8 / AC-11) — safe commitment-tooling proof.
 *
 * Proves `make-randomization-map.mjs` works (schema-valid commitment, secret
 * file mode 0600, correct hash/counts) and refuses a second run, WITHOUT ever
 * touching the real tree or the real `$HOME`. Everything happens inside a
 * throwaway copy of the spec dir and a throwaway `HOME`.
 *
 * Hard constraints (mirrored from the build task):
 *   - No real `runs/`, no real randomization-commitment.json, no real secret
 *     map — the script runs only against a temp copy of the spec dir.
 *   - The real `~/.design-os/prereg-022/randomization-map.secret.json` is
 *     asserted absent BEFORE and AFTER this suite runs; the test must not
 *     create it.
 *   - Everything is removed in `finally`, even on assertion failure.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
// Plain .mjs, no ambient type declarations. These are pure, stateless helpers
// (a generic JSON-schema validator, a path-join constant function) reused
// rather than reimplemented — not the module under test (make-randomization-
// map.mjs, driven only as a CLI subprocess below).
// @ts-expect-error — no .d.ts for this .mjs module
import { validate } from "./fixtures/spec-022-prereg/scripts/lib/schema.mjs";
// @ts-expect-error — no .d.ts for this .mjs module
import { ownerSecretMapPath } from "./fixtures/spec-022-prereg/scripts/lib/constants.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..");
const SPEC_REL = "specs/022-taste-transfer-prereg"; // layout inside the synthetic repo
const SPEC_SRC = join(REPO_ROOT, "tests/fixtures/spec-022-prereg"); // where the fixture lives here

// The REAL owner custody path — never touched, only ever asserted absent.
const REAL_SECRET_MAP_PATH = ownerSecretMapPath(homedir());

interface Commitment {
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

interface Presentation {
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

interface SecretMap {
  version: string;
  created_at: string;
  presentations: Presentation[];
}

function readCommitmentSchema(specDir: string): object {
  return JSON.parse(readFileSync(join(specDir, "schemas", "randomization-commitment.schema.json"), "utf8"));
}

/**
 * A fingerprint of the REAL owner secret map taken by `stat` ALONE.
 *
 * POST-FREEZE REPOSITORY STATE (r5): this suite originally asserted the real map
 * must NOT exist. That was correct only before the freeze. The owner has since
 * run the one-shot generator, so the real map legitimately EXISTS and the public
 * `randomization-commitment.json` is committed — an absence assertion is now
 * permanently false and says nothing about safety.
 *
 * The property actually worth guarding is unchanged and stronger: this suite must
 * never CREATE, MODIFY, or DELETE the real map. Comparing a before/after
 * fingerprint proves exactly that, and it holds in both states (absent stays
 * absent; present stays byte-size/mode/mtime identical).
 *
 * Deliberately `stat` only — size, mode and mtime. The secret map's CONTENTS are
 * never read, printed, or hashed by this suite.
 */
function realSecretMapFingerprint(): string {
  if (!existsSync(REAL_SECRET_MAP_PATH)) return "absent";
  const s = statSync(REAL_SECRET_MAP_PATH);
  return `present size=${s.size} mode=${(s.mode & 0o777).toString(8)} mtimeMs=${s.mtimeMs}`;
}

describe("R8 — safe commitment-tooling proof (sandbox only)", () => {
  let realSecretMapBefore = "";

  beforeAll(() => {
    realSecretMapBefore = realSecretMapFingerprint();
  });

  afterAll(() => {
    expect(
      realSecretMapFingerprint(),
      `this suite must never create, modify, or delete the REAL owner secret map: ${REAL_SECRET_MAP_PATH}`,
    ).toBe(realSecretMapBefore);
  });

  it("first run produces a schema-valid commitment + a 0600 secret file with the correct hash/counts; second run refuses and writes nothing new", () => {
    const tempSpecParent = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-commitment-spec-")));
    const tempSpecDir = join(tempSpecParent, SPEC_REL);
    const tempHome = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-commitment-home-")));

    try {
      cpSync(SPEC_SRC, tempSpecDir, { recursive: true });
      // Never generated ahead of the real freeze — a fresh copy must not carry
      // a stray commitment/secret map from a previous run of anything else.
      rmSync(join(tempSpecDir, "randomization-commitment.json"), { force: true });

      const scriptPath = join(tempSpecDir, "scripts", "make-randomization-map.mjs");
      const env = { ...process.env, HOME: tempHome, USERPROFILE: tempHome };

      // -----------------------------------------------------------------
      // First run: must succeed and produce valid, hash-consistent output.
      // -----------------------------------------------------------------
      const first = spawnSync(process.execPath, [scriptPath], { env, encoding: "utf8" });
      expect(first.status, `first run stderr: ${first.stderr}`).toBe(0);

      const commitmentPath = join(tempSpecDir, "randomization-commitment.json");
      const tempSecretMapPath = ownerSecretMapPath(tempHome);

      expect(existsSync(commitmentPath)).toBe(true);
      expect(existsSync(tempSecretMapPath)).toBe(true);

      const commitment = JSON.parse(readFileSync(commitmentPath, "utf8")) as Commitment;
      const schema = readCommitmentSchema(tempSpecDir);
      const errors = validate(commitment, schema);
      expect(errors, `commitment schema errors: ${JSON.stringify(errors)}`).toEqual([]);

      expect(commitment.secret_map_location).toBe(tempSecretMapPath);

      // Secret file mode 0600.
      const secretStat = statSync(tempSecretMapPath);
      expect(secretStat.mode & 0o777).toBe(0o600);

      // Hash matches recorded commitment.
      const secretBytes = readFileSync(tempSecretMapPath);
      const actualHash = createHash("sha256").update(secretBytes).digest("hex");
      expect(actualHash).toBe(commitment.secret_map_sha256);

      // Counts: 16 Phase-A pairs / 20 Phase-A presentations / 36 Phase-B
      // pairs / 36 Phase-B presentations, 56 total, codenames unique 8-hex
      // lowercase, presentation_id matches PR-[0-9a-f]{8}, presentation
      // orders exactly 1..20 and 21..56.
      expect(commitment.phase_a_pairs).toBe(16);
      expect(commitment.phase_a_presentations).toBe(20);
      expect(commitment.phase_b_pairs).toBe(36);
      expect(commitment.phase_b_presentations).toBe(36);

      const map = JSON.parse(secretBytes.toString("utf8")) as SecretMap;
      expect(map.presentations.length).toBe(56);

      const codes = map.presentations.flatMap((p) => [p.left_code, p.right_code]);
      expect(new Set(codes).size).toBe(codes.length);
      for (const code of codes) expect(code).toMatch(/^[0-9a-f]{8}$/);

      for (const p of map.presentations) expect(p.presentation_id).toMatch(/^PR-[0-9a-f]{8}$/);
      expect(new Set(map.presentations.map((p) => p.presentation_id)).size).toBe(56);

      const phaseAOrders = map.presentations.filter((p) => p.phase === "A").map((p) => p.presentation_order).sort((a, b) => a - b);
      const phaseBOrders = map.presentations.filter((p) => p.phase === "B").map((p) => p.presentation_order).sort((a, b) => a - b);
      expect(phaseAOrders).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect(phaseBOrders).toEqual(Array.from({ length: 36 }, (_, i) => i + 21));

      // -----------------------------------------------------------------
      // Record bytes + mtimes, run a SECOND time with the SAME sandbox HOME:
      // must refuse (exit 1), name the refusal, and leave both files
      // byte-identical and unmodified.
      // -----------------------------------------------------------------
      const commitmentBytesBefore = readFileSync(commitmentPath);
      const secretBytesBefore = readFileSync(tempSecretMapPath);
      const commitmentMtimeBefore = statSync(commitmentPath).mtimeMs;
      const secretMtimeBefore = statSync(tempSecretMapPath).mtimeMs;

      const second = spawnSync(process.execPath, [scriptPath], { env, encoding: "utf8" });
      expect(second.status).toBe(1);
      expect(second.stderr).toMatch(/FATAL/i);
      expect(second.stderr.toLowerCase()).toMatch(/exist|already|refus/);

      expect(readFileSync(commitmentPath).equals(commitmentBytesBefore)).toBe(true);
      expect(readFileSync(tempSecretMapPath).equals(secretBytesBefore)).toBe(true);
      expect(statSync(commitmentPath).mtimeMs).toBe(commitmentMtimeBefore);
      expect(statSync(tempSecretMapPath).mtimeMs).toBe(secretMtimeBefore);
    } finally {
      rmSync(tempSpecParent, { recursive: true, force: true });
      rmSync(tempHome, { recursive: true, force: true });
    }
  });
});
