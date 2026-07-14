/**
 * `ui taste next` — E2E over the CLI. Seeds items via the real `taste ingest`
 * verb (a tiny real PNG per item, encodePng), votes via `taste record`, then
 * drives `taste next` and asserts the pair/study proposal contract.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { encodePng } from "../src/core/png-codec.js";

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

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "ease-taste-next-"));
}

/** Ingest one tiny real PNG (distinct per offset) into `genre`, return its item id. */
function seedItem(root: string, genre: string, offset: number): string {
  const src = mkdtempSync(join(tmpdir(), "ease-taste-seed-"));
  const data = new Uint8Array(8 * 8 * 4);
  for (let i = 0; i < 8 * 8; i++) {
    const v = (i * 7 + offset) % 256;
    data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
  }
  writeFileSync(join(src, "x.png"), encodePng({ width: 8, height: 8, data }));
  const r = capture(["taste", "ingest", "--root", root, "--dir", src, "--genre", genre, "--json"]);
  return JSON.parse(r.stdout).data.items[0].id as string;
}

describe("ui taste next", () => {
  it("pair same genre", () => {
    const root = tmpRoot();
    const id1 = seedItem(root, "g1", 0);
    const id2 = seedItem(root, "g1", 90);

    const r = capture(["taste", "next", "--mode", "pair", "--root", root, "--genre", "g1", "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.mode).toBe("pair");
    expect(data.genre).toBe("g1");
    expect([data.a.id, data.b.id].sort()).toEqual([id1, id2].sort());
  });

  it("study returns unstudied", () => {
    const root = tmpRoot();
    const id1 = seedItem(root, "g", 0);
    seedItem(root, "g", 90);
    seedItem(root, "g", 180);
    capture(["taste", "record", "--mode", "study", "--root", root, "--item", id1, "--verdict", "LEARN", "--json"]);

    const r = capture(["taste", "next", "--mode", "study", "--root", root, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.item.id).not.toBe(id1);
  });

  it("empty root E_TASTE_ROOT", () => {
    const root = tmpRoot(); // never ingested — no items.jsonl at all
    const r = capture(["taste", "next", "--mode", "pair", "--root", root, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("E_TASTE_ROOT");
  });

  it("single item E_TASTE_NO_ITEMS", () => {
    const root = tmpRoot();
    seedItem(root, "g", 0);
    const r = capture(["taste", "next", "--mode", "pair", "--root", root, "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("E_TASTE_NO_ITEMS");
  });
});
