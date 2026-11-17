import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const MANIFEST_PATHS = [
  ".claude-plugin/plugin.json",
  ".claude-plugin/marketplace.json",
  ".codex-plugin/plugin.json",
  ".factory-plugin/plugin.json",
  ".factory-plugin/marketplace.json",
  ".agents/plugins/marketplace.json",
] as const;

function readManifest(rel: string): Record<string, unknown> {
  const abs = join(REPO_ROOT, rel);
  expect(existsSync(abs), `${rel} should exist`).toBe(true);
  return JSON.parse(readFileSync(abs, "utf8")) as Record<string, unknown>;
}

describe("plugin manifests", () => {
  it("all plugin and marketplace manifests parse as valid JSON and share name 'design-os'", () => {
    for (const rel of MANIFEST_PATHS) {
      const data = readManifest(rel);
      expect(data.name, `${rel} must declare name: "design-os"`).toBe("design-os");
    }
  });

  it("all referenced local paths exist on disk", () => {
    const codex = readManifest(".codex-plugin/plugin.json");
    const iface = codex.interface as { logo?: string; capabilities?: string[] } | undefined;
    expect(typeof codex.skills).toBe("string");
    expect(existsSync(resolve(REPO_ROOT, codex.skills as string))).toBe(true);
    expect(typeof iface?.logo).toBe("string");
    expect(existsSync(resolve(REPO_ROOT, iface!.logo!))).toBe(true);
    expect(iface?.capabilities).toEqual(["Interactive", "Read", "Write"]);

    for (const mktRel of [
      ".claude-plugin/marketplace.json",
      ".factory-plugin/marketplace.json",
      ".agents/plugins/marketplace.json",
    ]) {
      const mkt = readManifest(mktRel);
      const plugins = mkt.plugins as Array<{ name?: string; source?: string | { source?: string; path?: string } }>;
      expect(Array.isArray(plugins) && plugins.length > 0, `${mktRel} plugins array`).toBe(true);
      for (const entry of plugins) {
        const localPath = typeof entry.source === "string" ? entry.source : entry.source?.path;
        expect(typeof localPath, `${mktRel} plugin source path`).toBe("string");
        expect(existsSync(resolve(REPO_ROOT, localPath!)), `${mktRel} -> ${localPath}`).toBe(true);
      }
    }
  });

  it("scripts/self_check.py exits 0 and prints passed status", () => {
    const stdout = execFileSync("python3", ["scripts/self_check.py"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    expect(stdout).toContain("ok: design-os self-check passed");
  });
});
