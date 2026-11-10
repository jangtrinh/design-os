/** Shared helpers for the owner-rulings suites: in-process CLI capture, a tree hash, a scratch project. */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";

export interface Captured { code: number; out: string; err: string }

export function capture(args: string[]): Captured {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (chunk: any) => { err += String(chunk); return true; };
  try { return { code: run(args), out, err }; }
  finally { process.stdout.write = origOut; process.stderr.write = origErr; }
}

/** SHA-256 over every file path and byte under `dir` (sorted), so "nothing was written" is one comparison. */
export function hashTree(dir: string): string {
  const h = createHash("sha256");
  const visit = (rel: string): void => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const next = rel === "" ? name : `${rel}/${name}`;
      if (statSync(join(dir, next)).isDirectory()) { h.update(`d:${next}\n`); visit(next); }
      else { h.update(`f:${next}\n`); h.update(readFileSync(join(dir, next))); }
    }
  };
  visit("");
  return h.digest("hex");
}

export function scratchProject(): string {
  return mkdtempSync(join(process.env["TMPDIR"] ?? tmpdir(), "owner-rulings-"));
}
