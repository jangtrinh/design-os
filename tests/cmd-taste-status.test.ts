/**
 * `ui taste status` — E2E over the CLI. Seeds items via `taste ingest`,
 * votes via `taste record`, and asserts genre counts, topElo ordering, and
 * self-consistency reporting once a REPEAT vote has been recorded.
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
  return mkdtempSync(join(tmpdir(), "ease-taste-status-"));
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

describe("ui taste status", () => {
  it("counts genres topElo", () => {
    const root = tmpRoot();
    const idA = seedItem(root, "g1", 0);
    const idB = seedItem(root, "g1", 90);
    seedItem(root, "g2", 180);
    seedItem(root, "g2", 40);
    capture(["taste", "record", "--mode", "pair", "--root", root, "--a", idA, "--b", idB, "--winner", "a", "--json"]);

    const r = capture(["taste", "status", "--root", root, "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.items).toBe(4);
    expect(data.votes).toBe(1);
    const genres = [...data.genres].sort((x: { genre: string }, y: { genre: string }) => x.genre.localeCompare(y.genre));
    expect(genres).toEqual([
      { genre: "g1", items: 2, votes: 1 },
      { genre: "g2", items: 2, votes: 0 },
    ]);
    expect(data.topElo[0].id).toBe(idA); // idA won the only vote => highest elo
    expect(data.topElo[0].elo).toBeGreaterThan(1000);
  });

  it("consistency after repeat", () => {
    const root = tmpRoot();
    seedItem(root, "g", 0);
    seedItem(root, "g", 90);

    // Drive 10 real next→record cycles so the 10th trips the REPEAT mechanism.
    for (let i = 0; i < 10; i++) {
      const nr = capture(["taste", "next", "--mode", "pair", "--root", root, "--genre", "g", "--json"]);
      const nd = JSON.parse(nr.stdout).data;
      const args = ["taste", "record", "--mode", "pair", "--root", root, "--a", nd.a.id, "--b", nd.b.id, "--winner", "a", "--json"];
      if (nd.swapped === true) args.push("--swapped");
      if (typeof nd.repeatOf === "string") args.push("--repeat-of", nd.repeatOf);
      const rr = capture(args);
      expect(rr.exitCode, rr.stdout).toBe(0);
    }

    const r = capture(["taste", "status", "--root", root, "--json"]);
    const data = JSON.parse(r.stdout).data;
    expect(data.votes).toBe(10);
    expect(data.consistency.repeats).toBe(1);
    expect(data.consistency.rate).not.toBeNull();
    expect(data.consistency.rate).toBeGreaterThanOrEqual(0);
    expect(data.consistency.rate).toBeLessThanOrEqual(1);
  });
});
