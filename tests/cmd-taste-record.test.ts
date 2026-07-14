/**
 * `ui taste record` — E2E over the CLI. Seeds items via the real `taste ingest`
 * verb, then drives `taste record` for both modes and asserts the validation
 * + append contract (including ledger corruption fail-loud with line number).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, appendFileSync, readFileSync } from "node:fs";
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
  return mkdtempSync(join(tmpdir(), "ease-taste-record-"));
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

describe("ui taste record", () => {
  it("appends pair vote", () => {
    const root = tmpRoot();
    const id1 = seedItem(root, "g", 0);
    const id2 = seedItem(root, "g", 90);

    const r = capture([
      "taste", "record", "--mode", "pair", "--root", root,
      "--a", id1, "--b", id2, "--winner", "a", "--reasons", "clarity,contrast", "--json",
    ]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.recorded.a).toBe(id1);
    expect(data.recorded.b).toBe(id2);
    expect(data.recorded.winner).toBe("a");
    expect(data.recorded.reasons).toEqual(["clarity", "contrast"]);
    const lines = readFileSync(join(root, "votes.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("appends study", () => {
    const root = tmpRoot();
    const id1 = seedItem(root, "g", 0);

    const r = capture(["taste", "record", "--mode", "study", "--root", root, "--item", id1, "--verdict", "LEARN", "--json"]);
    expect(r.exitCode).toBe(0);
    const data = JSON.parse(r.stdout).data;
    expect(data.recorded.item).toBe(id1);
    expect(data.recorded.verdict).toBe("LEARN");
    const lines = readFileSync(join(root, "study.jsonl"), "utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
  });

  it("unknown item E_TASTE_UNKNOWN_ITEM", () => {
    const root = tmpRoot();
    const id1 = seedItem(root, "g", 0);
    const r = capture(["taste", "record", "--mode", "pair", "--root", root, "--a", id1, "--b", "nope", "--winner", "a", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("E_TASTE_UNKNOWN_ITEM");
  });

  it("bad winner E_TASTE_BAD_VOTE", () => {
    const root = tmpRoot();
    const id1 = seedItem(root, "g", 0);
    const id2 = seedItem(root, "g", 90);
    const r = capture(["taste", "record", "--mode", "pair", "--root", root, "--a", id1, "--b", id2, "--winner", "nonsense", "--json"]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).error.code).toBe("E_TASTE_BAD_VOTE");
  });

  it("corrupt ledger E_TASTE_LEDGER with line", () => {
    const root = tmpRoot();
    seedItem(root, "g", 0); // valid items.jsonl line 1
    appendFileSync(join(root, "items.jsonl"), "not valid json\n"); // corrupt line 2

    const r = capture(["taste", "record", "--mode", "pair", "--root", root, "--a", "x", "--b", "y", "--winner", "a", "--json"]);
    expect(r.exitCode).toBe(1);
    const err = JSON.parse(r.stdout).error;
    expect(err.code).toBe("E_TASTE_LEDGER");
    expect(err.message).toContain("items.jsonl:2");
  });
});
