import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../src/core/cli-args.js";
import { buildEvent } from "../src/core/memory-events.js";
import { appendEvent, memoryPaths, readEvents } from "../src/core/memory-store.js";
import { synthesizeConventionsCommand } from "../src/commands/synthesize-conventions.js";

vi.mock("../src/core/memory-store.js", async (importOriginal) => {
  const store = await importOriginal<typeof import("../src/core/memory-store.js")>();
  return { ...store, appendEvent: vi.fn(store.appendEvent) };
});

afterEach(() => { vi.mocked(appendEvent).mockReset(); });

describe("synthesis harvest anchor allocation", () => {
  it("links every insight to the actual harvest after a competing append wins the next ID", async () => {
    const store = await vi.importActual<typeof import("../src/core/memory-store.js")>("../src/core/memory-store.js");
    const dir = mkdtempSync(join(tmpdir(), "synth-anchor-"));
    const paths = memoryPaths(dir);
    const now = "2026-10-09T00:00:00.000Z";
    vi.mocked(appendEvent).mockImplementation(store.appendEvent);
    vi.mocked(appendEvent).mockImplementationOnce((p, harvest) => {
      store.appendEvent(p, buildEvent({ id: "unused", t: now, type: "manual_edit", data: { summary: "competing writer" } }));
      return store.appendEvent(p, harvest);
    });
    try {
      const parsed = parseArgs(["synthesize-conventions", "--out", dir, "--seed-memory", "--now", now, "--json"]);
      parsed.positionals = [new URL("./fixtures/figma-conventions/usage-dna.json", import.meta.url).pathname];
      const result = synthesizeConventionsCommand.run(parsed);
      expect(result.exitCode, result.stdout ?? result.stderr).toBe(0);
      const events = readEvents(paths);
      expect(events[0]).toMatchObject({ id: "e1", type: "manual_edit", data: { summary: "competing writer" } });
      const harvest = events.find((e) => e.type === "harvested");
      expect(harvest).toMatchObject({ id: "e2", actor: "synthesize-conventions" });
      const insights = events.filter((e) => e.type === "insight");
      expect(insights.length).toBe(JSON.parse(result.stdout!).data.insights.length);
      expect(insights.length).toBeGreaterThan(0);
      for (const insight of insights) {
        expect(insight.refs).toEqual([harvest!.id]);
        expect(events.find((e) => e.id === insight.refs?.[0])?.type).toBe("harvested");
      }
      expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
