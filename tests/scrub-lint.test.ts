/**
 * The scrub-encode floor, checked on the encoded clip.
 *
 * Fixtures are tiny real mp4s (64x64, 2s, under 24 KB each) committed under
 * tests/fixtures/scrub/ — one per violation, produced once by ffmpeg and then
 * frozen. Committing them rather than shelling out keeps the suite offline and
 * keeps CI independent of whatever ffmpeg the runner happens to have.
 *
 * Every case breaks one floor on purpose and asserts the check fires; `good.mp4`
 * asserts silence. A check that has only ever been observed green has not been
 * shown to run, and one that never goes green is a tax.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { lintScrub, probeScrub } from "../src/core/scrub-lint.js";
import { run } from "../src/cli.js";

const FX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "scrub");
const load = (name: string): Uint8Array => readFileSync(join(FX, name));
const ids = (name: string): string[] => lintScrub(load(name)).map((f) => f.checkId).sort();

describe("probeScrub — the box walk", () => {
  it("reads the layout, tracks and sample tables of a real mp4", () => {
    const p = probeScrub(load("good.mp4"));
    expect(p.faststart).toBe(true);
    expect(p.handlers).toContain("vide");
    expect(p.videoSamples).toBeGreaterThan(0);
    expect(p.videoSyncSamples).toBeGreaterThan(0);
    expect(p.gop).toBeGreaterThan(0);
  });

  it("answers nothing for a file that is not ISO-BMFF, rather than guessing", () => {
    const p = probeScrub(load("not-mp4.bin"));
    expect(p.faststart).toBeNull();
    expect(p.handlers).toEqual([]);
    expect(p.gop).toBeNull();
  });

  it("does not throw on truncated input — a partial download must not crash the linter", () => {
    const half = load("good.mp4").slice(0, 200);
    expect(() => probeScrub(half)).not.toThrow();
  });

  it("is deterministic — same bytes, same probe (Art I.2)", () => {
    expect(probeScrub(load("good.mp4"))).toEqual(probeScrub(load("good.mp4")));
  });
});

describe("lintScrub — each floor, broken on purpose", () => {
  it("scrub-no-faststart: moov after mdat", () => {
    expect(ids("no-faststart.mp4")).toContain("scrub-no-faststart");
  });

  it("scrub-has-audio: an audio track survived the encode", () => {
    expect(ids("has-audio.mp4")).toContain("scrub-has-audio");
  });

  it("scrub-gop-too-long: too few keyframes for cheap seeks", () => {
    expect(ids("long-gop.mp4")).toContain("scrub-gop-too-long");
  });

  it("names the measured numbers, so the message is the diagnosis", () => {
    const f = lintScrub(load("long-gop.mp4")).find((x) => x.checkId === "scrub-gop-too-long");
    expect(f?.message).toMatch(/frames per keyframe/);
    expect(f?.message).toMatch(/-g 8/);
  });

  it("a clip that meets the floor trips nothing", () => {
    expect(lintScrub(load("good.mp4"))).toEqual([]);
  });

  it("refuses to answer for a non-ISO-BMFF file instead of reporting it clean", () => {
    // No findings AND no video track claim — the command layer turns this into
    // NOT_ISO_BMFF rather than "meets the floor", which would be a lie.
    expect(lintScrub(load("not-mp4.bin"))).toEqual([]);
    expect(probeScrub(load("not-mp4.bin")).handlers).toEqual([]);
  });

  it("every finding is error severity — a stalled scrub is not advisory", () => {
    for (const name of ["no-faststart.mp4", "has-audio.mp4", "long-gop.mp4"]) {
      for (const f of lintScrub(load(name))) expect(f.severity).toBe("error");
    }
  });

  it("sorts deterministically", () => {
    const a = lintScrub(load("has-audio.mp4")).map((f) => f.checkId);
    expect([...a].sort()).toEqual(a);
  });
});

describe("ui scrub-lint — the command seam", () => {
  function capture(args: string[]): { exitCode: number; stdout: string } {
    let stdout = "";
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((c: string | Uint8Array): boolean => { stdout += String(c); return true; }) as typeof process.stdout.write;
    try {
      const code = run(args);
      return { exitCode: code, stdout };
    } finally {
      process.stdout.write = orig;
    }
  }

  it("exits 0 and says so on a clip that meets the floor", () => {
    const r = capture(["scrub-lint", join(FX, "good.mp4")]);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("Meets the scrub-encode floor");
  });

  it("exits 1 on a violation", () => {
    expect(capture(["scrub-lint", join(FX, "long-gop.mp4")]).exitCode).toBe(1);
  });

  it("reports NOT_ISO_BMFF rather than a clean pass for a foreign file", () => {
    const r = capture(["scrub-lint", join(FX, "not-mp4.bin"), "--json"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toContain("NOT_ISO_BMFF");
  });

  it("reports FILE_NOT_FOUND for a missing path", () => {
    const r = capture(["scrub-lint", join(FX, "nope.mp4"), "--json"]);
    expect(r.stdout).toContain("FILE_NOT_FOUND");
  });

  it("requires exactly one file argument", () => {
    expect(capture(["scrub-lint", "--json"]).stdout).toContain("BAD_ARG");
    expect(capture(["scrub-lint", "a.mp4", "b.mp4", "--json"]).stdout).toContain("BAD_ARG");
  });

  it("carries the measured probe in the JSON envelope, not just the verdict", () => {
    const r = capture(["scrub-lint", join(FX, "good.mp4"), "--json"]);
    const env = JSON.parse(r.stdout) as { ok: boolean; data: { probe: { faststart: boolean; gop: number } } };
    expect(env.ok).toBe(true);
    expect(env.data.probe.faststart).toBe(true);
    expect(env.data.probe.gop).toBeGreaterThan(0);
  });
});
