/**
 * AC-11 — prove the randomization-map tooling's HARD RULES without ever producing
 * the real artifacts.
 *
 * The acceptance criterion "both randomization commitments present" conflicts with
 * the two-commit choreography that creates them only at G-R, post-freeze; the
 * HANDOFF forbids both early generation and any fake commitment. The Stage-6
 * resolution: prove the TOOLING with a sandboxed dry-run, and let the real
 * commitment be born at G-R.
 *
 * The sandbox is not a nicety, it is the whole safety property.
 * `make-randomization-map.mjs` writes to `homedir()` and then permanently REFUSES to
 * run again ("generated exactly once"), while the protocol forbids deleting or
 * regenerating the map. A naive dry-run on the real machine would therefore write
 * the real `~/.design-os/prereg-022/randomization-map.secret.json` and BRICK the
 * pilot's one-shot generation forever. Every run below overrides `HOME` to a temp
 * directory that is deleted in `finally`; `os.homedir()` honours `$HOME` on POSIX,
 * so the real home is never touched, read, or created.
 *
 * What this proves is the tooling's rules — schema-valid commitment, secret written
 * outside the repo at 0600, refusal-on-rerun — not the artifacts. Nothing produced
 * here can ever be committed as real: PR-016 pins `secret_map_location` to the
 * owner's custody path, so a sandbox-born commitment carries a temp HOME and fails
 * deterministically.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { SPEC_REL, SPEC_SRC, must } from "./spec-022-lifecycle.js";

const CUSTODY_SEGMENTS = [".design-os", "prereg-022", "randomization-map.secret.json"];

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
  [key: string]: unknown;
}

interface Sandbox {
  root: string;
  home: string;
  specDir: string;
  scriptPath: string;
  secretMapPath: string;
  commitmentPath: string;
}

function makeSandbox(): Sandbox {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "spec-022-map-")));
  const home = join(root, "sandbox-home");
  mkdirSync(home, { recursive: true });
  const specDir = join(root, SPEC_REL);
  mkdirSync(join(root, "specs"), { recursive: true });
  cpSync(SPEC_SRC, specDir, { recursive: true });
  return {
    root,
    home,
    specDir,
    scriptPath: join(specDir, "scripts/make-randomization-map.mjs"),
    secretMapPath: join(home, ...CUSTODY_SEGMENTS),
    commitmentPath: join(specDir, "randomization-commitment.json"),
  };
}

function runGenerator(sandbox: Sandbox): { status: number; stdout: string; stderr: string } {
  const proc = spawnSync(process.execPath, [sandbox.scriptPath], {
    cwd: sandbox.root,
    encoding: "utf8",
    env: { ...process.env, HOME: sandbox.home },
  });
  if (proc.error) throw proc.error;
  return { status: proc.status ?? -1, stdout: proc.stdout ?? "", stderr: proc.stderr ?? "" };
}

/** Run a sandboxed dry-run and ALWAYS delete the sandbox, artifacts included. */
function withSandbox<T>(fn: (sandbox: Sandbox) => T): T {
  const sandbox = makeSandbox();
  try {
    return fn(sandbox);
  } finally {
    rmSync(sandbox.root, { recursive: true, force: true });
  }
}

describe("AC-11 randomization-map tooling dry-run (sandboxed HOME)", () => {
  it("never touches the real home directory", () => {
    const realCustody = join(homedir(), ...CUSTODY_SEGMENTS);
    const existedBefore = existsSync(realCustody);
    withSandbox((sandbox) => {
      const run = runGenerator(sandbox);
      expect(run.status, run.stderr).toBe(0);
      // The map must have landed in the SANDBOX, at the real custody path's shape.
      expect(existsSync(sandbox.secretMapPath)).toBe(true);
    });
    // Invariant, asserted after the sandbox is gone: the real one-shot artifact was
    // neither created nor consumed by this test.
    expect(existsSync(realCustody)).toBe(existedBefore);
  });

  it("writes a schema-valid commitment naming a secret map OUTSIDE the repo", () => {
    withSandbox((sandbox) => {
      const run = runGenerator(sandbox);
      expect(run.status, run.stderr).toBe(0);

      const commitment = JSON.parse(readFileSync(sandbox.commitmentPath, "utf8")) as Commitment;
      expect(commitment.csprng).toBe("node:crypto.randomBytes");
      expect(commitment.phase_a_pairs).toBe(16);
      expect(commitment.phase_a_presentations).toBe(20);
      expect(commitment.phase_b_pairs).toBe(36);
      expect(commitment.phase_b_presentations).toBe(36);
      expect(commitment.codename_format).toBe("8-hex-lowercase");
      expect(commitment.presentation_id_format).toBe("PR-8hex");
      expect(commitment.committed_before_render).toBe(true);
      expect(commitment.secret_map_sha256).toMatch(/^[0-9a-f]{64}$/);

      // The secret map is outside the repo root, and at the pinned custody shape.
      expect(commitment.secret_map_location.startsWith(join(sandbox.root, "specs"))).toBe(false);
      expect(commitment.secret_map_location).toBe(sandbox.secretMapPath);
    });
  });

  it("writes the secret map 0600 and hashes exactly its bytes", async () => {
    const { createHash } = await import("node:crypto");
    withSandbox((sandbox) => {
      const run = runGenerator(sandbox);
      expect(run.status, run.stderr).toBe(0);
      const mode = lstatSync(sandbox.secretMapPath).mode & 0o777;
      expect(mode).toBe(0o600);
      const commitment = JSON.parse(readFileSync(sandbox.commitmentPath, "utf8")) as Commitment;
      const actual = createHash("sha256").update(readFileSync(sandbox.secretMapPath)).digest("hex");
      expect(actual).toBe(commitment.secret_map_sha256);
    });
  });

  it("REFUSES to rerun — the map is generated exactly once and never regenerated", () => {
    withSandbox((sandbox) => {
      const first = runGenerator(sandbox);
      expect(first.status, first.stderr).toBe(0);
      const mapBefore = readFileSync(sandbox.secretMapPath);
      const commitmentBefore = readFileSync(sandbox.commitmentPath);

      const second = runGenerator(sandbox);
      expect(second.status).toBe(1);
      expect(second.stderr).toContain("FATAL");
      // Nothing was overwritten: a rerun that silently rewrote either artifact would
      // destroy the pre-commitment guarantee the whole design rests on.
      expect(readFileSync(sandbox.secretMapPath).equals(mapBefore)).toBe(true);
      expect(readFileSync(sandbox.commitmentPath).equals(commitmentBefore)).toBe(true);
    });
  });

  it("refuses when only the commitment already exists — no partial writes", () => {
    withSandbox((sandbox) => {
      const first = runGenerator(sandbox);
      expect(first.status, first.stderr).toBe(0);
      // Remove the secret but keep the commitment: the script must still refuse
      // rather than mint a second map for an existing commitment.
      rmSync(sandbox.secretMapPath, { force: true });
      const second = runGenerator(sandbox);
      expect(second.status).toBe(1);
      expect(existsSync(sandbox.secretMapPath)).toBe(false);
    });
  });

  it("the generated map has the frozen presentation shape (20 Phase-A + 36 Phase-B)", () => {
    withSandbox((sandbox) => {
      const run = runGenerator(sandbox);
      expect(run.status, run.stderr).toBe(0);
      const map = JSON.parse(readFileSync(sandbox.secretMapPath, "utf8")) as {
        presentations: { phase: string; presentation_id: string; left_code: string; right_code: string; presentation_order: number; endpoint_primary: boolean; pair_id: string }[];
      };
      expect(map.presentations).toHaveLength(56);
      expect(map.presentations.filter((p) => p.phase === "A")).toHaveLength(20);
      expect(map.presentations.filter((p) => p.phase === "B")).toHaveLength(36);

      const codes = new Set<string>();
      const orders = new Set<number>();
      for (const p of map.presentations) {
        expect(p.presentation_id).toMatch(/^PR-[0-9a-f]{8}$/);
        expect(p.left_code).toMatch(/^[0-9a-f]{8}$/);
        expect(p.right_code).toMatch(/^[0-9a-f]{8}$/);
        codes.add(p.left_code);
        codes.add(p.right_code);
        orders.add(p.presentation_order);
      }
      expect(codes.size).toBe(112); // 56 x 2, all distinct
      expect(orders.size).toBe(56);

      // Exactly one endpoint-primary presentation per pair.
      const byPair = new Map<string, number>();
      for (const p of map.presentations) {
        if (p.endpoint_primary) byPair.set(p.pair_id, (byPair.get(p.pair_id) ?? 0) + 1);
      }
      for (const [pairId, count] of byPair) expect(count, pairId).toBe(1);
      expect(byPair.size).toBe(52); // 16 Phase-A pairs + 36 Phase-B pairs
    });
  });

  it("a sandbox-born commitment can never pass PR-016 — it is not the owner custody path", () => {
    withSandbox((sandbox) => {
      const run = runGenerator(sandbox);
      expect(run.status, run.stderr).toBe(0);
      const commitment = JSON.parse(readFileSync(sandbox.commitmentPath, "utf8")) as Commitment;
      // The real gate pins this to `homedir()/.design-os/...`; the sandbox HOME
      // guarantees a mismatch, which is what makes the dry-run unable to leak a
      // throwaway artifact into the frozen record.
      expect(commitment.secret_map_location).not.toBe(join(homedir(), ...CUSTODY_SEGMENTS));

      const validator = join(sandbox.specDir, "scripts/validate-prereg.mjs");
      const proc = spawnSync(process.execPath, [validator, "--mode", "pre-render", "--json"], {
        cwd: sandbox.root,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const envelope = JSON.parse(must(proc.stdout, "expected an envelope")) as {
        findings: { checkId: string; severity: string; message: string }[];
      };
      expect(
        envelope.findings.some((f) => f.checkId === "PR-016" && f.severity === "error" && f.message.includes("owner-pinned custody path")),
      ).toBe(true);
    });
  });
});
