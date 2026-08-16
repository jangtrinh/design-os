/**
 * `ui scrub-scaffold` — the emitter half of the scrub-encode floor.
 *
 * The thing worth proving here is not "a file got written". It is that the
 * EMITTER and the LINTER encode the SAME floor. They are two artifacts in two
 * languages, so nothing structural forces them to agree — this suite is what
 * forces it: every knob in `SCRUB_ENCODE_FLOOR` is asserted to appear in the
 * emitted script, by value. Edit `-crf 20` to `-crf 23` in the template and
 * these go red instead of the floor quietly splitting in two.
 *
 * The end-to-end round-trip (encode a real clip, then lint it) needs ffmpeg, so
 * it is gated behind SCRUB_ENCODE_LIVE=1 and reported as skipped — visibly
 * absent rather than silently missing.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run } from "../src/cli.js";
import { SCRUB_ENCODE_FLOOR } from "../src/core/scrub-encode-floor.js";
import { lintScrub } from "../src/core/scrub-lint.js";

const TEMPLATE = join(process.cwd(), "templates", "scrub", "build-assets.sh");
const FX = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "scrub");

/** `run` returns an exit code and writes to the real streams; capture both. */
function capture(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { stderr += String(c); return true; };
  let exitCode: number;
  try {
    exitCode = run(args);
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "scrub-scaffold-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("the emitted script and the linter carry the same floor", () => {
  // Fail loudly if the template is renamed or dropped: a missing source must not
  // read as a pass (repo scar — a test can assert its own filesystem path).
  it("the template that ships is present", () => {
    expect(existsSync(TEMPLATE)).toBe(true);
  });

  const script = (): string => readFileSync(TEMPLATE, "utf8");

  it("spells the quality and GOP knobs by value", () => {
    const s = script();
    expect(s).toContain(`CRF=${SCRUB_ENCODE_FLOOR.crf}`);
    expect(s).toContain(`GOP=${SCRUB_ENCODE_FLOOR.gopFrames}`);
    expect(s).toContain(`UNSHARP="${SCRUB_ENCODE_FLOOR.unsharp}"`);
  });

  it("carries the phone floor: narrower AND a tighter GOP than landscape", () => {
    const s = script();
    expect(s).toContain(`GOP=${SCRUB_ENCODE_FLOOR.portraitGopFrames}`);
    expect(s).toContain(`scale=${SCRUB_ENCODE_FLOOR.portraitWidth}:-2`);
    // The direction is the point — a phone decoder's seek cost scales with GOP.
    expect(SCRUB_ENCODE_FLOOR.portraitGopFrames).toBeLessThan(SCRUB_ENCODE_FLOOR.gopFrames);
  });

  it("emits an encode the linter's three error checks would pass", () => {
    // Anchor to COMMAND lines, not anywhere in the file. The first version of
    // this test asserted `toContain("-an")` and stayed green when `-an` was
    // deleted from the ffmpeg call — because the comment explaining `-an` still
    // contained it. A probe that matches its own documentation proves nothing.
    const cmd = script()
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");
    expect(cmd).toMatch(/^\s+-an /m);                    // scrub-has-audio
    expect(cmd).toMatch(/^\s+-movflags \+faststart/m);   // scrub-no-faststart
    expect(cmd).toMatch(/-sc_threshold 0/);              // fixed GOP → scrub-gop-too-long
  });

  it("emits a GOP inside the tolerance the linter actually allows", () => {
    expect(SCRUB_ENCODE_FLOOR.gopFrames).toBeLessThanOrEqual(SCRUB_ENCODE_FLOOR.maxGopFrames);
  });

  it("never downscales a landscape clip — native resolution is part of the floor", () => {
    const s = script();
    // The only scale in the encode path is the portrait one; the landscape branch
    // sets SCALE empty. A stray landscape scale would soften what is already soft.
    expect(s).toMatch(/landscape\)\s*\n\s*GOP=\d+\s*\n\s*SCALE=""/);
  });

  it("refuses to centre-crop a landscape source into a portrait chain", () => {
    // The knowledge is explicit: a crop is a fallback that must be announced,
    // never applied silently. The script exits rather than cropping.
    const s = script();
    expect(s).toContain("must never be applied silently");
    expect(s).toMatch(/if \[ "\$w" -gt "\$h" \]/);
  });

  it("points the user at the linter, so the pair is discoverable from either end", () => {
    expect(script()).toContain("ui scrub-lint");
  });
});

describe("ui scrub-scaffold", () => {
  it("writes an executable build-assets.sh to the target", () => {
    const target = join(tmp, "out");
    const r = capture(["scrub-scaffold", target]);
    expect(r.exitCode).toBe(0);
    const dest = join(target, "build-assets.sh");
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, "utf8")).toEqual(readFileSync(TEMPLATE, "utf8"));
    // A build script the user cannot run did not really ship.
    expect(statSync(dest).mode & 0o111).toBeGreaterThan(0);
  });

  it("refuses a missing target argument", () => {
    const r = capture(["scrub-scaffold", "--json"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stdout).toContain("BAD_ARG");
  });

  it("refuses to clobber an existing file, and overwrites only with --force", () => {
    const target = join(tmp, "out");
    expect(capture(["scrub-scaffold", target]).exitCode).toBe(0);
    writeFileSync(join(target, "build-assets.sh"), "# edited by hand\n", "utf8");

    const blocked = capture(["scrub-scaffold", target, "--json"]);
    expect(blocked.exitCode).not.toBe(0);
    expect(blocked.stdout).toContain("EXISTS");
    expect(readFileSync(join(target, "build-assets.sh"), "utf8")).toBe("# edited by hand\n");

    expect(capture(["scrub-scaffold", target, "--force"]).exitCode).toBe(0);
    expect(readFileSync(join(target, "build-assets.sh"), "utf8")).toEqual(readFileSync(TEMPLATE, "utf8"));
  });

  it("reports the target and written files in the JSON envelope", () => {
    const target = join(tmp, "out");
    const r = capture(["scrub-scaffold", target, "--json"]);
    const env = JSON.parse(r.stdout) as { ok: boolean; data: { written: string[] } };
    expect(env.ok).toBe(true);
    expect(env.data.written).toHaveLength(1);
    expect(env.data.written[0]).toContain("build-assets.sh");
  });
});

/**
 * The round trip. This is the only test that proves the two halves agree about
 * a real file rather than about a string, so when ffmpeg is available it is the
 * one that matters most.
 *
 *   SCRUB_ENCODE_LIVE=1 npx vitest run tests/scrub-scaffold.test.ts
 */
const live = process.env.SCRUB_ENCODE_LIVE === "1";
describe.skipIf(!live)("round trip (SCRUB_ENCODE_LIVE=1, needs ffmpeg + cwebp)", () => {
  it("emitted script → encoded clip → scrub-lint finds nothing", () => {
    const target = join(tmp, "build");
    expect(capture(["scrub-scaffold", target]).exitCode).toBe(0);

    // Feed it a clip that is deliberately NOT floor-compliant, so a pass cannot
    // come from the input already being clean.
    const src = join(tmp, "src");
    execFileSync("mkdir", ["-p", src]);
    execFileSync("cp", [join(FX, "no-faststart.mp4"), join(src, "leg0.mp4")]);
    expect(lintScrub(readFileSync(join(src, "leg0.mp4"))).length).toBeGreaterThan(0);

    const out = join(tmp, "web");
    execFileSync("bash", [join(target, "build-assets.sh"), src, out], { stdio: "pipe" });

    const encoded = readFileSync(join(out, "vid", "leg0.mp4"));
    expect(lintScrub(encoded)).toEqual([]);
  });
});
