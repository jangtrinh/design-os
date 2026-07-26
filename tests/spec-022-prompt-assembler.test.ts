/**
 * Spec-022 R1/R2 (amendment item 1 / Fable B4, B5) — exhaustive per-media-brief
 * P7 projection and leak-scan coverage.
 *
 * `prompt-assembler.mjs` is the ONE canonical assembler; this file unit-tests
 * it directly against the real, frozen media briefs and media manifest (never
 * synthetic stand-ins), because a projection bug is exactly the kind of defect
 * that hides behind "PA-MED-1 alone looked fine" — count before you assert.
 *
 * All nine briefs that carry `supplied_assets` (PA-MED-1..3, PB-P1-1..3,
 * PB-P2-1..3) are exercised: (a) the projection contains no asset_id,
 * manifest_ref, brief id, candidate id, or family; (b) role and alias index
 * are correct against the frozen manifest; (c) control and treatment
 * projections are byte-identical; (d) a mutated assembler that leaves the
 * original ids in place makes the leak scan fire.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Plain .mjs, no ambient type declarations — this file unit-tests the module
// under test directly (prompt-assembler.mjs), not through the CLI, because
// the CLI surface has no way to introspect the intermediate projection object
// these assertions need.
// @ts-expect-error — no .d.ts for this .mjs module
import { assembleArmPrompt, assetIdToNeutral, assetRoleMap, projectBrief, promptTextLeaks } from "../specs/022-taste-transfer-prereg/scripts/lib/prompt-assembler.mjs";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..");
const SPEC_DIR = join(REPO_ROOT, "specs/022-taste-transfer-prereg");

interface Brief {
  brief_id: string;
  family?: string;
  candidate_id?: string;
  supplied_assets: { asset_id: string; manifest_ref: string }[];
  [key: string]: unknown;
}

function readJson<T>(rel: string): T {
  return JSON.parse(readFileSync(join(SPEC_DIR, rel), "utf8")) as T;
}

const phaseA = readJson<{ briefs: Brief[] }>("phase-a-briefs.json");
const phaseB = readJson<{ briefs: Brief[] }>("phase-b-briefs.json");
const mediaManifest = readJson<{ assets: { asset_id: string; role: string; path: string }[] }>("assets/brief-media-manifest.json");
const templateBytes = readFileSync(join(SPEC_DIR, "arm-prompt-template.md"));
const assetRoles = assetRoleMap(mediaManifest);

const MEDIA_BRIEFS: { brief: Brief; phase: "A" | "B" }[] = [
  ...phaseA.briefs.filter((b) => b.supplied_assets.length > 0).map((brief) => ({ brief, phase: "A" as const })),
  ...phaseB.briefs.filter((b) => b.supplied_assets.length > 0).map((brief) => ({ brief, phase: "B" as const })),
];

describe("R1/R2 — exhaustive media-brief projection coverage", () => {
  it("counts exactly the nine frozen media briefs (count before you assert)", () => {
    expect(MEDIA_BRIEFS.map((m) => m.brief.brief_id).sort()).toEqual(
      ["PA-MED-1", "PA-MED-2", "PA-MED-3", "PB-P1-1", "PB-P1-2", "PB-P1-3", "PB-P2-1", "PB-P2-2", "PB-P2-3"].sort(),
    );
  });

  for (const { brief, phase } of MEDIA_BRIEFS) {
    describe(brief.brief_id, () => {
      it("(a) projects no asset_id, manifest_ref, brief id, candidate id, or family", () => {
        const projected = projectBrief(brief, phase, { assetRoles });
        const serialized = JSON.stringify(projected);
        for (const supplied of brief.supplied_assets) {
          expect(serialized).not.toContain(supplied.asset_id);
          expect(serialized).not.toContain(supplied.manifest_ref);
        }
        expect(serialized).not.toContain(brief.brief_id);
        if (typeof brief.candidate_id === "string") expect(serialized).not.toContain(brief.candidate_id);
        if (typeof brief.family === "string") expect(serialized).not.toContain(`"${brief.family}"`);
        expect(projected).not.toHaveProperty("brief_id");
        expect(projected).not.toHaveProperty("candidate_id");
        expect(projected).not.toHaveProperty("family");
      });

      it("(b) role and alias index are correct against the frozen manifest", () => {
        const idToNeutral = assetIdToNeutral(brief, assetRoles);
        const roleCounters = new Map<string, number>();
        for (const supplied of brief.supplied_assets) {
          const expectedRole = assetRoles.get(supplied.asset_id);
          expect(expectedRole, `no manifest role for ${supplied.asset_id}`).toBeDefined();
          const next = (roleCounters.get(expectedRole as string) ?? 0) + 1;
          roleCounters.set(expectedRole as string, next);
          expect(idToNeutral.get(supplied.asset_id)).toBe(`asset-${expectedRole}-${next}`);
        }
      });

      it("(c) control and treatment projections are byte-identical except the treatment-only patch", () => {
        const control = assembleArmPrompt({ templateBytes, brief, phase, arm: "control", patchBytes: null, mediaManifest });
        const patchPath =
          phase === "A" ? join(SPEC_DIR, `patches/phase-a/${brief.family}.md`) : join(SPEC_DIR, `patches/phase-b/${brief.candidate_id}.md`);
        const patchBytes = readFileSync(patchPath);
        const treatment = assembleArmPrompt({ templateBytes, brief, phase, arm: "treatment", patchBytes, mediaManifest });

        expect(control.leaks).toEqual([]);
        expect(treatment.leaks).toEqual([]);
        // Treatment = control + exactly the patch bytes appended.
        expect(treatment.bytes.subarray(0, control.bytes.length).equals(control.bytes)).toBe(true);
        expect(treatment.bytes.subarray(control.bytes.length).equals(patchBytes)).toBe(true);
        // The projected supplied_assets block itself is identical.
        expect(JSON.stringify(control.projection.supplied_assets)).toBe(JSON.stringify(treatment.projection.supplied_assets));
      });

      it("(d) a mutated assembler that leaves the original ids in place makes the leak scan fire", () => {
        const leakyProjection = { ...brief } as Record<string, unknown>;
        delete leakyProjection.brief_id;
        delete leakyProjection.candidate_id;
        delete leakyProjection.family;
        delete leakyProjection.ordinal;
        const bytes = Buffer.concat([templateBytes, Buffer.from(JSON.stringify(leakyProjection), "utf8")]);
        const leaks = promptTextLeaks(bytes, brief, phase, {
          assetIds: mediaManifest.assets.map((a) => a.asset_id),
          assetPaths: mediaManifest.assets.map((a) => a.path),
        });
        expect(leaks.length).toBeGreaterThan(0);
        expect(leaks.some((l: string) => l.includes("committed asset id"))).toBe(true);
      });
    });
  }
});
