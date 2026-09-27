import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { run } from "../src/cli.js";

export const FIX = join(process.cwd(), "tests", "fixtures", "ksync");

/** Run `ui <args>` through the real dispatcher and capture what it wrote. */
export function ui(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { stdout += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { stderr += String(c); return true; };
  let exitCode: number;
  try { exitCode = run(args) as number; } finally { process.stdout.write = out; process.stderr.write = err; }
  return { exitCode, stdout, stderr };
}

/** A per-test temp dir, created on first use and removed (then reset) by done(). */
export function scratch(): { path: (f: string) => string; read: (f: string) => string; done: () => void } {
  let dir: string | null = null;
  const d = (): string => (dir ??= mkdtempSync(join(tmpdir(), "ksync-test-")));
  return {
    path: (f) => join(d(), f),
    read: (f) => readFileSync(join(d(), f), "utf8"),
    done: () => { if (dir !== null) rmSync(dir, { recursive: true, force: true }); dir = null; },
  };
}
