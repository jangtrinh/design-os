/**
 * Built-binary CI gate for `ui seam lint` (A1, PR-FU2).
 *
 * `ui seam lint`'s prose-read ratchet was never wired into `.github/workflows/ci.yml`
 * (see reports/dev-w3c.md finding 1) — a PR could silently regress the analyzer's
 * detection coverage (new reads or stale allowlist entries) with CI staying green.
 * This test runs the BUILT binary over the repo's own `src/` — the same shape CI's
 * `npm test` step already covers for other built-binary smoke tests — so a coverage
 * regression fails here instead of merging unnoticed.
 *
 * Skips with a clear message when dist/cli.js has not been built yet (CI builds
 * before running tests, so this only happens during local development).
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_CLI = join(REPO_ROOT, "dist", "cli.js");

describe("built binary: ui seam lint (CI ratchet)", () => {
  it("dist/cli.js exists — if this fails, run `npm run build` first", () => {
    if (!existsSync(DIST_CLI)) {
      console.warn(`SKIP: ${DIST_CLI} not found — run "npm run build" to generate it.`);
    }
    expect(existsSync(DIST_CLI), `dist/cli.js missing — run "npm run build"`).toBe(true);
  });

  // Spawns a real node subprocess scanning the whole src/ tree; the default 5s vitest
  // timeout is too tight under load (matches tests/spec-022-lifecycle.test.ts's 20s).
  it("reports zero new reads and zero stale allowlist entries over the repo's own src/", () => {
    if (!existsSync(DIST_CLI)) return;

    const result = spawnSync("node", [DIST_CLI, "seam", "lint", "--json"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });

    expect(result.status, `non-zero exit; stdout: ${result.stdout}\nstderr: ${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout!) as {
      ok: boolean;
      data: { newCount: number; findings: { checkId: string; message: string }[]; summary: string };
    };
    expect(parsed.ok, parsed.data?.summary).toBe(true);
    expect(parsed.data.newCount, JSON.stringify(parsed.data.findings)).toBe(0);
    const staleEntries = parsed.data.findings.filter((f) => f.checkId === "seam-stale-entry");
    expect(staleEntries, JSON.stringify(staleEntries)).toEqual([]);
  }, 20_000);
});
