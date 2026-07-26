/**
 * Spec-022 R6 (amendment item 6) — FROZEN_FILES completeness guard.
 *
 * `FROZEN_FILES` (constants.mjs) is the list PR-018/PR-019 use to prove the
 * prereg commit's tree carries every file the gate needs to reproduce itself.
 * A list that silently drifts from the real directory listing — by omitting a
 * newly added production module, or by naming a path that no longer exists —
 * would let PR-018/PR-019 "pass" while quietly no longer proving what they
 * claim to prove. This test reads the real directory listings directly (never
 * trusts FROZEN_FILES' own claim) and fails on either direction of drift.
 *
 * Imports `FROZEN_FILES` directly rather than going through the CLI: this is a
 * pure data-shape check against the filesystem, not a validator-behavior test.
 */
import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Plain .mjs, no ambient type declarations — a pure data-shape check against
// the filesystem, not a validator-behavior test, so importing the constant
// directly (rather than reimplementing it) is the right level of coupling.
// @ts-expect-error — no .d.ts for this .mjs module
import { FROZEN_FILES, SPEC_DIR_REL } from "../specs/022-taste-transfer-prereg/scripts/lib/constants.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..");
const SPEC_DIR = join(REPO_ROOT, SPEC_DIR_REL);

function listFiles(absDir: string, extPattern: RegExp): string[] {
  return readdirSync(absDir, { withFileTypes: true })
    .filter((e) => e.isFile() && extPattern.test(e.name))
    .map((e) => e.name);
}

describe("R6 — FROZEN_FILES completeness guard", () => {
  it("includes every scripts/*.mjs file on disk", () => {
    const onDisk = listFiles(join(SPEC_DIR, "scripts"), /\.mjs$/).map((n) => `scripts/${n}`);
    const missing = onDisk.filter((rel) => !FROZEN_FILES.includes(rel));
    expect(missing, `scripts/*.mjs on disk but missing from FROZEN_FILES: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it("includes every scripts/lib/*.mjs module on disk", () => {
    const onDisk = listFiles(join(SPEC_DIR, "scripts", "lib"), /\.mjs$/).map((n) => `scripts/lib/${n}`);
    const missing = onDisk.filter((rel) => !FROZEN_FILES.includes(rel));
    expect(missing, `scripts/lib/*.mjs on disk but missing from FROZEN_FILES: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it("includes every schemas/*.json schema on disk", () => {
    const onDisk = listFiles(join(SPEC_DIR, "schemas"), /\.json$/).map((n) => `schemas/${n}`);
    const missing = onDisk.filter((rel) => !FROZEN_FILES.includes(rel));
    expect(missing, `schemas/*.json on disk but missing from FROZEN_FILES: ${JSON.stringify(missing)}`).toEqual([]);
  });

  it("names no scripts/*.mjs, scripts/lib/*.mjs, or schemas/*.json path that does not exist on disk", () => {
    const scriptsOnDisk = new Set(listFiles(join(SPEC_DIR, "scripts"), /\.mjs$/).map((n) => `scripts/${n}`));
    const libOnDisk = new Set(listFiles(join(SPEC_DIR, "scripts", "lib"), /\.mjs$/).map((n) => `scripts/lib/${n}`));
    const schemasOnDisk = new Set(listFiles(join(SPEC_DIR, "schemas"), /\.json$/).map((n) => `schemas/${n}`));

    const stale = (FROZEN_FILES as string[]).filter((rel: string) => {
      if (rel.startsWith("scripts/lib/") && rel.endsWith(".mjs")) return !libOnDisk.has(rel);
      if (rel.startsWith("scripts/") && rel.endsWith(".mjs")) return !scriptsOnDisk.has(rel);
      if (rel.startsWith("schemas/") && rel.endsWith(".json")) return !schemasOnDisk.has(rel);
      return false;
    });
    expect(stale, `FROZEN_FILES names a scripts/schemas path that does not exist on disk: ${JSON.stringify(stale)}`).toEqual([]);
  });

  it("includes the R4 shared identity-tokens module", () => {
    expect(FROZEN_FILES).toContain("scripts/lib/identity-tokens.mjs");
  });
});
