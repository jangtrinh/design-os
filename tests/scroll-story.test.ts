/**
 * `ui scroll-story` — E2E over the ACTIVE/FLAT probe (PR-FU5a A3). Red-first:
 * two synthetic frame sets built with png-codec's own zero-dependency encoder
 * (identical frames -> FLAT; frames with a moving block -> ACTIVE), plus the
 * directory-missing/exit-2 and error-path cases.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { encodePng } from "../src/core/png-codec.js";
import type { RgbaImage } from "../src/core/png-codec.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

const W = 64, H = 40;

function solidFrame(r: number, g: number, b: number): RgbaImage {
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = r; data[i * 4 + 1] = g; data[i * 4 + 2] = b; data[i * 4 + 3] = 255;
  }
  return { width: W, height: H, data };
}

/**
 * A pale background with a dark block whose y-position moves with `blockY` —
 * layoutVariance reads the row-energy profile, so the motion that flips it
 * must shift which ROWS are dark, not just which columns.
 */
function movingBlockFrame(blockY: number): RgbaImage {
  const img = solidFrame(230, 230, 230);
  for (let y = blockY; y < blockY + 6 && y < H; y++) {
    for (let x = 10; x < 50; x++) {
      const i = (y * W + x) * 4;
      img.data[i] = 10; img.data[i + 1] = 10; img.data[i + 2] = 10;
    }
  }
  return img;
}

function writeFrames(dir: string, images: RgbaImage[]): void {
  images.forEach((img, i) => writeFileSync(join(dir, `f${String(i + 1).padStart(4, "0")}.png`), encodePng(img)));
}

describe("scroll-story — red-first synthetic fixtures", () => {
  it("identical frames -> FLAT", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-scroll-story-flat-"));
    writeFrames(dir, Array.from({ length: 8 }, () => solidFrame(200, 100, 50)));
    const r = capture(["scroll-story", dir, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { frames: number; verdict: string; staticRun: number };
    expect(data.frames).toBe(8);
    expect(data.verdict).toBe("FLAT");
    expect(data.staticRun).toBe(7);
    rmSync(dir, { recursive: true, force: true });
  });

  it("frames with a moving block -> ACTIVE", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-scroll-story-active-"));
    writeFrames(dir, Array.from({ length: 8 }, (_, i) => movingBlockFrame(i * 4)));
    const r = capture(["scroll-story", dir, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { verdict: string; layoutVariance: number };
    expect(data.verdict).toBe("ACTIVE");
    expect(data.layoutVariance).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("text mode prints the story verdict and both threshold markers", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-scroll-story-text-"));
    writeFrames(dir, Array.from({ length: 8 }, () => solidFrame(1, 2, 3)));
    const r = capture(["scroll-story", dir]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("story: FLAT");
    expect(r.out).toContain("staticRun=");
    expect(r.out).toContain("layoutVariance=");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("scroll-story — directory missing (exit 2)", () => {
  it("--json mode: DIR_NOT_FOUND", () => {
    const r = capture(["scroll-story", join(tmpdir(), "ease-scroll-story-does-not-exist"), "--json"]);
    expect(r.code).toBe(2);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("DIR_NOT_FOUND");
  });

  it("text mode: exit 2", () => {
    const r = capture(["scroll-story", join(tmpdir(), "ease-scroll-story-does-not-exist")]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("not found");
  });
});

describe("scroll-story — a readable dir with zero frames is still exit 0", () => {
  it("empty dir -> frames:0, FLAT, exit 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-scroll-story-empty-"));
    const r = capture(["scroll-story", dir, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { frames: number; verdict: string };
    expect(data.frames).toBe(0);
    expect(data.verdict).toBe("FLAT");
    rmSync(dir, { recursive: true, force: true });
  });

  it("a dir with only non-frame files ignores them -> frames:0", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-scroll-story-nonframe-"));
    writeFileSync(join(dir, "contact-sheet.jpg"), "not-a-frame");
    writeFileSync(join(dir, "scroll.mp4"), "not-a-frame");
    const r = capture(["scroll-story", dir, "--json"]);
    expect(r.code).toBe(0);
    expect((JSON.parse(r.out).data as { frames: number }).frames).toBe(0);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("scroll-story — error paths", () => {
  it("missing <frames-dir> positional -> BAD_ARG", () => {
    const r = capture(["scroll-story", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("BAD_ARG");
  });

  it("unknown flag -> UNKNOWN_FLAG", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-scroll-story-badflag-"));
    const r = capture(["scroll-story", dir, "--bogus", "--json"]);
    expect(r.code).toBe(1);
    expect((JSON.parse(r.out) as { error: { code: string } }).error.code).toBe("UNKNOWN_FLAG");
    rmSync(dir, { recursive: true, force: true });
  });

  it("an unreadable/corrupt frame is skipped, not fatal", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-scroll-story-corrupt-"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "f0001.png"), encodePng(solidFrame(9, 9, 9)));
    writeFileSync(join(dir, "f0002.png"), "not a real png");
    const r = capture(["scroll-story", dir, "--json"]);
    expect(r.code).toBe(0);
    const data = JSON.parse(r.out).data as { frames: number; unreadable: string[] };
    expect(data.frames).toBe(1);
    expect(data.unreadable).toContain("f0002.png");
    rmSync(dir, { recursive: true, force: true });
  });
});
