/**
 * `ui ds reseal --apply` re-loads the store under the full tamper check once the manifest is
 * written. If that load fails (a file edited mid-run), the manifest HAS already been committed:
 * the error must say so and say how to recover, never read like a clean refusal.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { run } from "../src/cli.js";
import { canonicalStringify, loadManifest } from "../src/core/ds-manifest.js";

vi.mock("../src/core/design-system.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/core/design-system.js")>();
  return {
    ...real,
    // The relaxed load (allowUnsealed) passes through; the strict verification load fails.
    loadDesignSystem: (paths: Parameters<typeof real.loadDesignSystem>[0], options?: Parameters<typeof real.loadDesignSystem>[1]) => {
      if (options?.allowUnsealed !== true && (globalThis as { __failVerify?: boolean }).__failVerify === true) {
        throw new real.DSError("DS_TAMPERED", "registry file hash mismatch (simulated mid-run edit)");
      }
      return real.loadDesignSystem(paths, options);
    },
  };
});

const PERSONA_DATA = new URL("../knowledge/personas/personas.json", import.meta.url).pathname;
const scratch: string[] = [];
afterEach(() => {
  delete (globalThis as { __failVerify?: boolean }).__failVerify;
  for (const d of scratch.splice(0)) rmSync(d, { recursive: true, force: true });
});

function cli(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((c: unknown) => { out += String(c); return true; }) as typeof process.stdout.write;
  process.stderr.write = ((c: unknown) => { out += String(c); return true; }) as typeof process.stderr.write;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

describe("ui ds reseal --apply: verification failure after the manifest was written", () => {
  it("says the manifest was already written (generation, entry) and how to recover", () => {
    const dir = mkdtempSync(join(tmpdir(), "ease-ds-reseal-verify-"));
    scratch.push(dir);
    expect(cli(["ds", "init", "acme", "--persona", "liquid-glass", "--intent", "t", "--dir", dir, "--persona-data", PERSONA_DATA]).code).toBe(0);
    const registryPath = join(dir, "design", "component-registry.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8")) as { components: Record<string, unknown>[] };
    registry.components.push({ ...registry.components[0], name: "Zzz/Added" });
    writeFileSync(registryPath, canonicalStringify(registry));

    (globalThis as { __failVerify?: boolean }).__failVerify = true;
    const r = cli(["ds", "reseal", "--dir", dir, "--apply", "--reason", "x", "--json"]);
    expect(r.code).not.toBe(0);
    const error = (JSON.parse(r.out) as { error: { code: string; message: string } }).error;
    expect(error.code).toBe("DS_TAMPERED");
    expect(error.message).toMatch(/manifest was already written/i);
    expect(error.message).toMatch(/generation 2/);
    expect(error.message).toMatch(/ui ds reseal/);
    const manifest = loadManifest(join(dir, "design", "ds.manifest.json"));
    expect(manifest.generation).toBe(2);
    expect(manifest.changelog.at(-1)?.kind).toBe("reseal");
  });
});
