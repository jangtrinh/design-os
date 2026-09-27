/** Shared helpers for the knowledge promotion tests: run the CLI in-process, and temp dirs that are removed afterwards. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

import { run } from "../../../src/cli.js";

export const FIX = join(process.cwd(), "tests", "fixtures", "knowledge-promotion");

export function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { return { code: run(args), out }; }
  finally { process.stdout.write = oldOut; }
}

/** Call once at module top level: registers cleanup and returns a temp-dir factory. */
export function useTempDirs(prefix: string): () => string {
  const dirs: string[] = [];
  afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
  return () => { const d = mkdtempSync(join(tmpdir(), prefix)); dirs.push(d); return d; };
}
