import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { buildChangelog, renderMarkdown } from "../src/core/changelog.js";
import type { DSChangelogEntry } from "../src/core/ds-manifest.js";

// ─── pure core ────────────────────────────────────────────────────────────────

describe("changelog — buildChangelog", () => {
  const cl: DSChangelogEntry[] = [
    { ts: "2026-07-01T00:00:00Z", kind: "init", by: "ui ds init", note: "compiled from persona=x" },
    { ts: "2026-07-03T00:00:00Z", kind: "change-token", by: "ui ds change-token", path: "color.primary", from: "#000", to: "#E11D48", reason: "warmer" },
    { ts: "2026-07-02T00:00:00Z", kind: "register", by: "ui registry register", note: "Button/Primary" },
  ];

  it("classifies kinds into Added / Changed and is newest-first", () => {
    const m = buildChangelog(cl);
    expect(m.entries.map((e) => e.type)).toContain("Added");
    expect(m.entries.some((e) => e.type === "Changed" && e.text.includes("color.primary") && e.text.includes("warmer"))).toBe(true);
    // newest first
    expect(m.entries[0]!.date >= m.entries[m.entries.length - 1]!.date).toBe(true);
  });

  it("folds decisions with refs provenance", () => {
    const m = buildChangelog([], [{ t: "2026-07-05T00:00:00Z", text: "dense tables need a sticky header", refs: ["e1", "e2"] }]);
    const d = m.entries.find((e) => e.type === "Decisions")!;
    expect(d.text).toContain("sticky header");
    expect(d.provenance).toBe("refs e1,e2");
  });

  it("renders Keep-a-Changelog sections; empty → placeholder", () => {
    expect(renderMarkdown(buildChangelog(cl), "acme")).toContain("## Changed");
    expect(renderMarkdown(buildChangelog([]))).toContain("No changes recorded yet");
  });
});

// ─── command ─────────────────────────────────────────────────────────────────

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-cl-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  writeFileSync(join(dir, "design", "ds.manifest.json"), JSON.stringify({
    name: "acme", version: "1.0.0",
    changelog: [{ ts: "2026-07-01T00:00:00Z", kind: "init", by: "ui ds init", note: "compiled from persona=x" }],
  }), "utf8");
});

describe("ui changelog", () => {
  it("renders a changelog from the manifest", () => {
    const r = capture(["changelog", "--dir", dir]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("# Changelog — acme");
    expect(r.out).toContain("## Added");
  });

  it("--json envelopes name + entries", () => {
    const r = capture(["changelog", "--dir", dir, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { name: string; entries: unknown[] };
    expect(d.name).toBe("acme");
    expect(d.entries.length).toBeGreaterThan(0);
  });

  it("no manifest → NO_MEMORY", () => {
    const empty = mkdtempSync(join(tmpdir(), "ease-cl-empty-"));
    const r = capture(["changelog", "--dir", empty, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("NO_MEMORY");
  });

  it("bad --format → BAD_ARG; unknown flag → UNKNOWN_FLAG", () => {
    expect(JSON.parse(capture(["changelog", "--dir", dir, "--format", "xml", "--json"]).out).error.code).toBe("BAD_ARG");
    expect(JSON.parse(capture(["changelog", "--dir", dir, "--nope", "--json"]).out).error.code).toBe("UNKNOWN_FLAG");
  });
});
