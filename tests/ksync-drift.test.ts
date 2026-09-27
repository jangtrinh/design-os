import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FIX, scratch, ui } from "./ksync-helpers.js";

const S = scratch();
afterEach(() => S.done());
const NOW = "2026-09-27T00:00:00.000Z";
const pinsDoc = (pins: object[]) => writeFileSync(S.path("pins.json"), JSON.stringify({ schema: "ksync-pins/1", pins }));
const P = (node: string, extra: object = {}) => ({ route: `r/${node}`, file: "FILEKEY", node, pinnedAt: "2026-09-10T00:00:00.000Z", builtFrom: "b".repeat(40), ...extra });
const frames = (doc: object) => writeFileSync(S.path("frames.json"), JSON.stringify(doc));
const drift = (extra: string[] = []) => ui(["ksync", "drift", "--pins", S.path("pins.json"), "--frames", S.path("frames.json"), "--now", NOW, "--json", ...extra]);
const data = (r: { stdout: string }) => JSON.parse(r.stdout).data;

describe("ui ksync drift", () => {
  it("CLEAN (exit 0) when every pinned frame is unchanged in a fresh ingest — the positive control", () => {
    pinsDoc([P("1:1")]);
    frames({ ingestedAt: "2026-09-26T00:00:00.000Z", frames: [{ nodeId: "1:1", lastModified: "2026-09-01T00:00:00.000Z" }] });
    const r = drift();
    expect(r.exitCode).toBe(0);
    expect(data(r).verdict).toBe("CLEAN");
  });

  it("C1a: a frame modified after its pin → DRIFT, exit 1", () => {
    pinsDoc([P("1:1")]);
    frames({ ingestedAt: "2026-09-26T00:00:00.000Z", frames: [{ nodeId: "1:1", lastModified: "2026-09-20T00:00:00.000Z" }] });
    const r = drift();
    expect(r.exitCode).toBe(1);
    expect(data(r).verdict).toBe("DRIFT");
    expect(data(r).results[0].state).toBe("DRIFT");
    expect(drift(["--warn-only"]).exitCode).toBe(0);
  });

  it("C1b: an ingest older than --max-age-days → STALE-INGEST, exit 1, even when every frame is unchanged", () => {
    pinsDoc([P("1:1")]);
    frames({ ingestedAt: "2026-09-01T00:00:00.000Z", frames: [{ nodeId: "1:1", lastModified: "2026-09-01T00:00:00.000Z" }] });
    const r = drift();
    expect(data(r).counts.OK).toBe(1);
    expect(data(r).verdict).toBe("STALE-INGEST");
    expect(r.exitCode).toBe(1);
    expect(drift(["--max-age-days", "60"]).exitCode).toBe(0);
  });

  it("an undated ingest is stale, never clean", () => {
    pinsDoc([P("1:1")]);
    frames({ frames: [{ nodeId: "1:1", lastModified: "2026-09-01T00:00:00.000Z" }] });
    expect(data(drift()).verdict).toBe("STALE-INGEST");
  });

  it("MISSING when the frame is gone, or the ingest is of another file", () => {
    pinsDoc([P("1:1"), P("9:9")]);
    frames({ ingestedAt: NOW, frames: [{ nodeId: "1:1", lastModified: "2026-09-01T00:00:00.000Z" }] });
    expect(data(drift()).results.find((x: { node: string }) => x.node === "9:9").state).toBe("MISSING");
    frames({ ingestedAt: NOW, fileKey: "OTHER", frames: [{ nodeId: "1:1", lastModified: "2026-09-01T00:00:00.000Z" }] });
    expect(data(drift()).counts.MISSING).toBe(2);
  });

  it("hashes decide when both sides have one: same hash beats a newer timestamp, a different hash beats an old one", () => {
    pinsDoc([P("1:1", { specHash: "h" }), P("1:2", { specHash: "h" })]);
    frames({ ingestedAt: NOW, frames: [
      { nodeId: "1:1", specHash: "h", lastModified: "2026-09-25T00:00:00.000Z" },
      { nodeId: "1:2", specHash: "changed", lastModified: "2026-09-01T00:00:00.000Z" },
    ] });
    const states = Object.fromEntries(data(drift()).results.map((x: { node: string; state: string }) => [x.node, x.state]));
    expect(states).toEqual({ "1:1": "OK", "1:2": "DRIFT" });
  });

  it("UNCHECKABLE (red) when the ingest carries neither a hash pair nor lastModified", () => {
    pinsDoc([P("1:1")]);
    frames({ ingestedAt: NOW, frames: [{ nodeId: "1:1" }] });
    const r = drift();
    expect(data(r).results[0].state).toBe("UNCHECKABLE");
    expect(r.exitCode).toBe(1);
  });

  it("no pins is EMPTY (red), not CLEAN", () => {
    pinsDoc([]);
    frames({ ingestedAt: NOW, frames: [] });
    const r = drift();
    expect(data(r).verdict).toBe("EMPTY");
    expect(r.exitCode).toBe(1);
  });

  it("reads the per-app ledger shape a real project already keeps", () => {
    pinsDoc([P("1:1", { specHash: "hash-a" }), P("1:3", { specHash: "old" })]);
    const r = ui(["ksync", "drift", "--pins", S.path("pins.json"), "--frames", join(FIX, "frames-ledger.json"), "--now", "2026-09-27T00:00:00.000Z", "--max-age-days", "36500", "--json"]);
    expect(data(r).results.map((x: { state: string }) => x.state)).toEqual(["OK", "DRIFT"]);
  });

  it("names the next action when an input is missing", () => {
    const r = ui(["ksync", "drift", "--pins", S.path("nope.json"), "--frames", S.path("frames.json")]);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toContain("ui ksync pin");
  });
});
