import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { FIX, scratch, ui } from "./ksync-helpers.js";

const S = scratch();
afterEach(() => S.done());
const pins = (nodes: string[]) =>
  writeFileSync(S.path("pins.json"), JSON.stringify({ schema: "ksync-pins/1", pins: nodes.map((n) => ({ route: `r/${n}`, file: "F", node: n, pinnedAt: "2026-09-26T00:00:00.000Z", builtFrom: "c".repeat(40) })) }));
const census = (extra: string[] = []) => JSON.parse(ui(["ksync", "census", join(FIX, "manifest.json"), "--pins", S.path("pins.json"), "--json", ...extra]).stdout).data;

describe("ui ksync census", () => {
  it("counts only labels the manifest carries and leaves the rest unlabeled — it never guesses", () => {
    pins([]);
    const d = census();
    expect(d.counts).toEqual({ built: 2, placeholder: 0, orphan: 0, parked: 1, unlabeled: 4 });
    expect(d.entries).toBe(7);
  });

  it("takes the remaining labels from --labels (a census file's unbuiltInManifest.entries)", () => {
    pins([]);
    const d = census(["--labels", join(FIX, "labels.json")]);
    expect(d.counts).toEqual({ built: 2, placeholder: 1, orphan: 1, parked: 1, unlabeled: 2 });
    expect(d.labelsUsed).toBe(2);
  });

  it("--assume-unlisted counts the rest as that status and records the assumption", () => {
    pins([]);
    const d = census(["--labels", join(FIX, "labels.json"), "--assume-unlisted", "built"]);
    expect(d.counts.built).toBe(4);
    expect(d.counts.unlabeled).toBe(0);
    expect(d.assumption).toContain("--assume-unlisted");
  });

  it("reports pinned-of-built by frame id, a per-app table, and pins that match no manifest frame", () => {
    pins(["1:1", "2:2", "8:8"]);
    const d = census();
    expect(d.builtPinned).toBe(1);
    expect(d.pinnedOfBuiltPct).toBe(50);
    expect(d.pins).toMatchObject({ total: 3, matchedToManifest: 2, unmatched: 1, appsWithPins: 2, appsTotal: 2 });
    expect(d.perApp.map((a: { app: string; pinned: number; builtPinned: number }) => [a.app, a.pinned, a.builtPinned])).toEqual([["alpha", 1, 1], ["beta", 1, 0]]);
  });

  it("counts registry components with and without figmaNode", () => {
    pins([]);
    expect(census(["--registry", join(FIX, "registry.json")]).registry).toEqual({ total: 3, withFigmaNode: 2, withoutFigmaNode: 1 });
  });

  it("pinnedOfBuiltPct is null, not 0, when nothing is labeled built", () => {
    pins([]);
    writeFileSync(S.path("m.json"), JSON.stringify({ entries: [{ app: "a", routeId: "a/b/c", kind: "route", figmaId: "1:1" }] }));
    const r = JSON.parse(ui(["ksync", "census", S.path("m.json"), "--pins", S.path("pins.json"), "--json"]).stdout).data;
    expect(r.pinnedOfBuiltPct).toBeNull();
  });

  it("prints a human table and rejects a bad --assume-unlisted", () => {
    pins([]);
    const r = ui(["ksync", "census", join(FIX, "manifest.json"), "--pins", S.path("pins.json")]);
    expect(r.stdout).toContain("ksync census: 7 entries — built 2");
    expect(ui(["ksync", "census", join(FIX, "manifest.json"), "--pins", S.path("pins.json"), "--assume-unlisted", "done"]).exitCode).toBe(1);
  });
});
