/**
 * scripts/fresh-install-proof.sh — argument handling always runs; the real
 * pack -> install -> init -> doctor run (and its no-bin negative control) is slow
 * and needs the npm registry, so it only runs with UI_FRESH_INSTALL=1.
 */
import { afterAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(ROOT, "scripts", "fresh-install-proof.sh");
const SLOW = process.env["UI_FRESH_INSTALL"] === "1";

function run(args: string[], timeout = 30_000) {
  return spawnSync("sh", [SCRIPT, ...args], { cwd: ROOT, encoding: "utf8", timeout });
}

describe("fresh-install-proof.sh arguments", () => {
  it("has valid POSIX sh syntax", () => {
    const r = spawnSync("sh", ["-n", SCRIPT], { encoding: "utf8" });
    expect(r.status).toBe(0);
  });

  it("rejects an unknown flag with exit 2", () => {
    const r = run(["--bogus"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--bogus'");
  });

  it("rejects a missing tarball with exit 2", () => {
    const r = run(["--tarball", "/nonexistent/none.tgz"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("tarball not found");
  });
});

describe.skipIf(!SLOW)("fresh-install-proof.sh real run (UI_FRESH_INSTALL=1)", () => {
  const work = mkdtempSync(join(tmpdir(), "fresh-install-test-"));
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it("packs, installs into a throwaway prefix and passes doctor", () => {
    const r = run([], 300_000);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^TOTAL\s+\d+ ms/m);
    expect(r.stdout).toContain("PASS: fresh install verified");
  }, 320_000);

  it("fails loudly at the doctor step when the tarball has no bin", () => {
    const pack = spawnSync("npm", ["pack", "--silent", "--pack-destination", work], { cwd: ROOT, encoding: "utf8" });
    const tgz = join(work, pack.stdout.trim().split("\n").pop() as string);
    const strip = spawnSync(
      "sh",
      [
        "-c",
        `tar xzf "${tgz}" -C "${work}" && node -e "const fs=require('fs');const f='${work}/package/package.json';` +
          `const p=JSON.parse(fs.readFileSync(f));delete p.bin;fs.writeFileSync(f,JSON.stringify(p))" ` +
          `&& tar czf "${work}/nobin.tgz" -C "${work}" package`,
      ],
      { encoding: "utf8" },
    );
    expect(strip.status, strip.stderr).toBe(0);
    const r = run(["--tarball", join(work, "nobin.tgz")], 120_000);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("FAIL at step: ui doctor (install)");
    expect(r.stderr).toContain("did not link its 'ui' bin");
  }, 140_000);
});
