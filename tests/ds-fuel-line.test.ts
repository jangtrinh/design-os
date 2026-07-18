/**
 * `wireFuelLine` (spec 012 P2) — the shared helper both `ds init` and `ds import`
 * call to give a fresh DS store the config it needs to evolve: soul scaffold +
 * default heartbeat + harvest-inbox. Unit-level: exercises the helper directly,
 * independent of either caller's CLI plumbing (those get their own E2E coverage
 * in cmd-ds-init.test.ts / cmd-ds-import.test.ts).
 */
import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { wireFuelLine } from "../src/core/ds-fuel-line.js";

describe("wireFuelLine — fresh design/ dir", () => {
  it("writes soul.md, heartbeat.json, and harvest-inbox/, all reported as written:true", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fuel-line-"));
    const designDir = join(tmp, "design");

    const result = wireFuelLine(designDir);

    expect(result.soul.written).toBe(true);
    expect(result.heartbeat.written).toBe(true);
    expect(result.harvestInbox.written).toBe(true);
    expect(existsSync(join(designDir, "soul.md"))).toBe(true);
    expect(existsSync(join(designDir, "heartbeat.json"))).toBe(true);
    expect(statSync(join(designDir, "harvest-inbox")).isDirectory()).toBe(true);
  });

  it("heartbeat.json matches VSF-PCP's proven shape minus figma-audit", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fuel-line-hb-"));
    const designDir = join(tmp, "design");

    wireFuelLine(designDir);

    const hb = JSON.parse(readFileSync(join(designDir, "heartbeat.json"), "utf8"));
    expect(hb.version).toBe(1);
    expect(hb.tasks).toEqual([
      { id: "a11y", type: "ds-a11y", interval: "1d" },
      { id: "specimen", type: "specimen", interval: "1d" },
      { id: "harvest", type: "harvest", interval: "12h" },
      { id: "reflect", type: "reflect", interval: "24h", params: { minEvents: 5 } },
    ]);
    // Figma-independent default: no figma-audit task until a Figma file is configured.
    expect(hb.tasks.some((t: { type: string }) => t.type === "figma-audit")).toBe(false);
  });
});

describe("wireFuelLine — never clobbers", () => {
  it("does not overwrite an existing soul.md", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fuel-line-soul-"));
    const designDir = join(tmp, "design");
    wireFuelLine(designDir);
    const edited = "---\nstatus: ratified\n---\n\n## Never\n\n- x\n\n## Always\n\n- y\n\n## Voice\n\n- z\n";
    writeFileSync(join(designDir, "soul.md"), edited, "utf8");

    const result = wireFuelLine(designDir);

    expect(result.soul.written).toBe(false);
    expect(readFileSync(join(designDir, "soul.md"), "utf8")).toBe(edited);
  });

  it("does not overwrite an existing heartbeat.json", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fuel-line-hb2-"));
    const designDir = join(tmp, "design");
    wireFuelLine(designDir);
    const custom = JSON.stringify({ version: 1, tasks: [{ id: "custom", type: "specimen", interval: "2d" }] });
    writeFileSync(join(designDir, "heartbeat.json"), custom, "utf8");

    const result = wireFuelLine(designDir);

    expect(result.heartbeat.written).toBe(false);
    expect(readFileSync(join(designDir, "heartbeat.json"), "utf8")).toBe(custom);
  });

  it("re-running on an already-wired dir reports written:false for all three", () => {
    const tmp = mkdtempSync(join(tmpdir(), "ease-fuel-line-idempotent-"));
    const designDir = join(tmp, "design");
    wireFuelLine(designDir);

    const second = wireFuelLine(designDir);

    expect(second.soul.written).toBe(false);
    expect(second.heartbeat.written).toBe(false);
    expect(second.harvestInbox.written).toBe(false);
  });
});
