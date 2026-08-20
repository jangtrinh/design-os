/**
 * Built-binary regression test for issue #209: stdout >64KB truncated at the
 * pipe buffer when the entrypoint calls process.exit() before the pipe drains.
 *
 * MUST spawn dist/cli.js: vitest-imported run() never reaches the entrypoint's
 * exit path, so a source-level test can never catch this. And it MUST read the
 * child through a PIPE (spawnSync's default) — a file redirect drains
 * synchronously and stays green even while every piped consumer is truncated
 * at exactly 65536 bytes (how the 0.5.0 delivery smoke found it).
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { existsSync } from "node:fs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "dist", "cli.js");

describe("built binary flushes stdout larger than the 64KB pipe buffer", () => {
  it.skipIf(!existsSync(CLI))("ui schema --json arrives complete and parseable through a pipe", () => {
    const r = spawnSync("node", [CLI, "schema", "--json"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    expect(r.status).toBe(0);
    // The truncation bug cuts at exactly 65536 bytes; the real document is ~87KB.
    expect(r.stdout.length).toBeGreaterThan(65536);
    const parsed = JSON.parse(r.stdout) as { ok: boolean };
    expect(parsed.ok).toBe(true);
  });
});
