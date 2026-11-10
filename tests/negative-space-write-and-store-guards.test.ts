/**
 * Guards that behave the same before and after any refactor of the harvest's plumbing: the design system's
 * own store is not source when the source is the project itself, and rule files are replaced through a temp
 * file and a rename (a reader holding the old file keeps whole old bytes).
 */
import { describe, expect, it } from "vitest";
import { existsSync, linkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

import { atomicWrite, harvestProject } from "../src/core/negative-space-proposals.js";
import type { ProbeResult } from "../src/core/negative-space-harvester.js";

function scratch(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "ns-guard-"));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text, "utf8");
  }
  return dir;
}

describe("the design system's own store is not source", () => {
  const files = {
    "src/app.html": "<h1>Hi</h1>",
    "design/specimen.html": `<p class="font-mono">sample</p>`,
    "design/specimen.css": ".a{background:linear-gradient(red,blue)}",
    "design/brand.tokens.json": `{"hero":"linear-gradient(red,blue)"}`,
  };

  it("leaves design/ out when the source is the project root, and says so", () => {
    const root = scratch(files);
    const h = harvestProject({ projectDir: root, sourceDir: root, write: false });
    const by = Object.fromEntries(h.report.probes.map((p) => [p.id, p])) as Record<string, ProbeResult>;
    expect(by["NS-01"]?.count).toBe(0);
    expect(by["NS-10"]?.count).toBe(0);
    expect(by["NS-10"]?.scannedFiles).toBe(1);
    expect(h.report.walk.skipped.some((s) => s.path === "design/" && s.reason.includes("design system's own store"))).toBe(true);
  });

  it("reads the same files when the source is a folder inside the project", () => {
    const root = scratch(files);
    const h = harvestProject({ projectDir: root, sourceDir: join(root, "design"), write: false });
    expect(h.report.probes.find((p) => p.id === "NS-10")?.count).toBeGreaterThan(0);
  });
});

describe("rule files are written through a temp file and a rename", () => {
  it("replaces the directory entry: a hard link taken before the write keeps the old bytes", () => {
    const dir = scratch({ "rules.json": "old\n" });
    const target = join(dir, "rules.json");
    const keeper = join(dir, "keeper.json");
    linkSync(target, keeper);
    atomicWrite(target, "new\n");
    expect(readFileSync(target, "utf8")).toBe("new\n");
    expect(readFileSync(keeper, "utf8")).toBe("old\n");
    expect(readdirSync(dir).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });

  it("creates missing parent folders and leaves no temp file when the write fails", () => {
    const dir = scratch({ "plain.txt": "x" });
    atomicWrite(join(dir, "nested", "deeper", "a.json"), "{}\n");
    expect(existsSync(join(dir, "nested", "deeper", "a.json"))).toBe(true);
    expect(() => atomicWrite(join(dir, "plain.txt", "child.json"), "x")).toThrow(); // a file where a folder is needed
    expect(readdirSync(dir).filter((n) => n.includes(".tmp-"))).toEqual([]);
  });
});
