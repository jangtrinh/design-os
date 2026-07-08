import { describe, expect, it } from "vitest";
import { compileGraph } from "../src/core/memory-graph.js";
import { buildEvent } from "../src/core/memory-events.js";
import type { EventType, MemoryEvent } from "../src/core/memory-events.js";

const NOW = "2026-07-08T00:00:00Z";

function ev(
  id: string,
  type: EventType,
  data: Record<string, unknown>,
  t: string,
  extra: Partial<{ designId: string; refs: string[] }> = {},
): MemoryEvent {
  return buildEvent({ id, t, type, data, designId: extra.designId, refs: extra.refs });
}

function daysBefore(nowIso: string, days: number): string {
  return new Date(Date.parse(nowIso) - days * 86_400_000).toISOString();
}

describe("memory-graph — half-life decay", () => {
  it("a 30-day-old contributing event weighs 0.5", () => {
    const t = daysBefore(NOW, 30);
    const g = compileGraph(
      [
        ev("e1", "variant_generated", { persona: "p", mode: "d" }, t, { designId: "d1" }),
        ev("e2", "user_pick", { chosen: "d1", rejected: [] }, t),
      ],
      NOW,
    );
    expect(g.personas["p"]?.rawPicks).toBe(1);
    expect(g.personas["p"]?.pickWeight).toBeCloseTo(0.5, 3);
    expect(g.halfLifeDays).toBe(30);
  });
});

describe("memory-graph — aggregation", () => {
  const events: MemoryEvent[] = [
    ev("e1", "variant_generated", { persona: "liquid-glass", mode: "desktop" }, NOW, { designId: "d1" }),
    ev("e2", "user_pick", { chosen: "d1", rejected: ["d2"] }, NOW),
    ev("e3", "vibe_edit", { word: "warmer", axis: "Depth/Surface" }, NOW),
    ev("e4", "taste_verdict", { scores: {}, lowestAxis: "Motion", round: 1, pass: false }, NOW),
    ev("e5", "token_change", { path: "color.primary", from: "#1", to: "#2", reason: "calmer brand" }, NOW),
    ev("e6", "insight", { text: "prefers calm" }, NOW, { refs: ["e2", "e5"] }),
  ];
  const g = compileGraph(events, NOW);

  it("attributes a pick to the design's persona", () => {
    expect(g.personas["liquid-glass"]?.generated).toBe(1);
    expect(g.personas["liquid-glass"]?.rawPicks).toBe(1);
  });

  it("records a vibe and adds its word to the axis fixes", () => {
    expect(g.vibes.find((v) => v.word === "warmer")?.axis).toBe("Depth/Surface");
    expect(g.axes["Depth/Surface"]?.fixes).toContain("warmer");
  });

  it("accrues a failed verdict onto the lowest axis", () => {
    expect(g.axes["Motion"]?.failWeight).toBeGreaterThan(0);
  });

  it("counts token changes and keeps the last reason", () => {
    expect(g.tokens["color.primary"]?.changes).toBe(1);
    expect(g.tokens["color.primary"]?.lastReason).toBe("calmer brand");
  });

  it("lifts insights (with provenance) into the graph", () => {
    expect(g.insights[0]?.text).toBe("prefers calm");
    expect(g.insights[0]?.refs).toEqual(["e2", "e5"]);
  });

  it("compiles deterministically (byte-identical) for the same events + now", () => {
    expect(JSON.stringify(compileGraph(events, NOW))).toBe(JSON.stringify(compileGraph(events, NOW)));
  });

  it("orders vibes by weight descending", () => {
    const many: MemoryEvent[] = [
      ev("e1", "vibe_edit", { word: "a", axis: "X" }, daysBefore(NOW, 60)),
      ev("e2", "vibe_edit", { word: "b", axis: "X" }, NOW),
      ev("e3", "vibe_edit", { word: "b", axis: "X" }, NOW),
    ];
    const gg = compileGraph(many, NOW);
    expect(gg.vibes[0]?.word).toBe("b"); // heavier (2 recent) sorts first
  });
});
