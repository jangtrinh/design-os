/**
 * `ui taste ingest` — E2E over the CLI. Writes real PNG fixtures (encodePng)
 * into a temp root's inbox/, drives them through run(), and asserts the
 * dedup/near-dup/move/copy contract + JSON envelope shape.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { encodePng } from "../src/core/png-codec.js";
import type { RgbaImage } from "../src/core/png-codec.js";

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
  try { exitCode = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { exitCode, stdout, stderr };
}

function gradientImage(width: number, height: number, offset = 0): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const v = (x * 23 + y * 11 + offset) % 256;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

function writePng(path: string, img: RgbaImage): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(img));
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "ease-taste-ingest-"));
}

describe("ui taste ingest", () => {
  it("inbox subfolder becomes genre", () => {
    const root = tmpRoot();
    writePng(join(root, "inbox", "web-landing", "a.png"), gradientImage(20, 16, 0));
    writePng(join(root, "inbox", "store-creative", "b.png"), gradientImage(20, 16, 40));

    const r = capture(["taste", "ingest", "--root", root, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.added).toBe(2);
    const genres = data.items.map((i: { genre: string }) => i.genre).sort();
    expect(genres).toEqual(["store-creative", "web-landing"]);
  });

  it("dedups exact sha", () => {
    const root = tmpRoot();
    const img = gradientImage(20, 16, 5);
    writePng(join(root, "inbox", "g", "one.png"), img);
    writePng(join(root, "inbox", "g", "two.png"), img); // byte-identical content, different filename

    const r = capture(["taste", "ingest", "--root", root, "--json"]);
    const data = JSON.parse(r.stdout).data;
    expect(data.added).toBe(1);
    expect(data.skippedDup).toBe(1);
  });

  it("near-dup warns but adds", () => {
    const root = tmpRoot();
    writePng(join(root, "inbox", "g", "base.png"), gradientImage(20, 16, 0));
    const r1 = capture(["taste", "ingest", "--root", root, "--json"]);
    expect(JSON.parse(r1.stdout).data.added).toBe(1);
    const baseId: string = JSON.parse(r1.stdout).data.items[0].id;

    // Uniform +1 tonal shift: dHash (gradient-sign based) barely moves, sha256 differs entirely.
    writePng(join(root, "inbox", "g", "near.png"), gradientImage(20, 16, 1));
    const r2 = capture(["taste", "ingest", "--root", root, "--json"]);
    const data2 = JSON.parse(r2.stdout).data;
    expect(data2.added).toBe(1); // near-dup is NOT skipped — it's still added
    expect(data2.skippedDup).toBe(0);
    expect(data2.warnings).toEqual([`near-dup of ${baseId}`]);
  });

  it("moves into corpus", () => {
    const root = tmpRoot();
    const inboxFile = join(root, "inbox", "g", "moveme.png");
    writePng(inboxFile, gradientImage(20, 16, 0));

    const r = capture(["taste", "ingest", "--root", root, "--json"]);
    const data = JSON.parse(r.stdout).data;
    expect(existsSync(inboxFile)).toBe(false); // moved, not copied, out of inbox
    expect(existsSync(join(root, data.items[0].file))).toBe(true);
    expect(data.items[0].file).toBe(`corpus/g/${data.items[0].id}.png`);
  });

  it("json envelope ok:true", () => {
    const root = tmpRoot();
    writePng(join(root, "inbox", "g", "one.png"), gradientImage(20, 16, 0));
    const r = capture(["taste", "ingest", "--root", root, "--json"]);
    const envelope = JSON.parse(r.stdout);
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe("taste ingest");
    expect(Array.isArray(envelope.data.items)).toBe(true);
  });

  it("--dir without --genre errors E_TASTE_BAD_FLAGS", () => {
    const root = tmpRoot();
    const extra = mkdtempSync(join(tmpdir(), "ease-taste-extra-"));
    const r = capture(["taste", "ingest", "--root", root, "--dir", extra, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("E_TASTE_BAD_FLAGS");
  });

  it("copies (not moves) files added via --dir, tagged with --genre", () => {
    const root = tmpRoot();
    const extra = mkdtempSync(join(tmpdir(), "ease-taste-extra-"));
    const extraFile = join(extra, "copyme.png");
    writePng(extraFile, gradientImage(20, 16, 0));

    const r = capture(["taste", "ingest", "--root", root, "--dir", extra, "--genre", "external", "--json"]);
    const data = JSON.parse(r.stdout).data;
    expect(data.added).toBe(1);
    expect(existsSync(extraFile)).toBe(true); // still present — copy, not move
    expect(existsSync(join(root, data.items[0].file))).toBe(true);
  });
});
