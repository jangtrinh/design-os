import { describe, expect, it } from "vitest";
import {
  eventIdNumber,
  exportCorpus,
  corpusById,
  parseRankFile,
} from "../src/core/memory-corpus.js";
import type { CorpusItem } from "../src/core/memory-corpus.js";
import type { MemoryEvent } from "../src/core/memory-events.js";

/** Build a minimal MemoryEvent for a given type/data — pure, no ledger/fs involved. */
function ev(
  id: string,
  type: MemoryEvent["type"],
  data: Record<string, unknown>,
  extra: Partial<Pick<MemoryEvent, "refs" | "t">> = {},
): MemoryEvent {
  return {
    v: 1,
    id,
    t: extra.t ?? "2026-07-08T09:00:00.000Z",
    type,
    data,
    ...(extra.refs !== undefined ? { refs: extra.refs } : {}),
  };
}

// ─── eventIdNumber ─────────────────────────────────────────────────────────────

describe("eventIdNumber", () => {
  it("parses well-formed monotonic ids", () => {
    expect(eventIdNumber("e12")).toBe(12);
    expect(eventIdNumber("e1")).toBe(1);
    expect(eventIdNumber("e0")).toBe(0);
  });

  it("returns null for malformed ids", () => {
    expect(eventIdNumber("x")).toBeNull();
    expect(eventIdNumber("e")).toBeNull();
    expect(eventIdNumber("e1a")).toBeNull();
    expect(eventIdNumber("")).toBeNull();
    expect(eventIdNumber("E1")).toBeNull();
  });
});

// ─── exportCorpus: tier mapping ─────────────────────────────────────────────────

describe("exportCorpus tier mapping", () => {
  it("insight -> episodic, text = data.text, refs preserved", () => {
    const events = [ev("e1", "insight", { text: "calm brands win" }, { refs: ["e0"] })];
    const items = exportCorpus(events);
    expect(items).toEqual<CorpusItem[]>([
      { id: "e1", tier: "episodic", text: "calm brands win", refs: ["e0"], t: "2026-07-08T09:00:00.000Z" },
    ]);
  });

  it("insight with no refs on the event -> refs defaults to []", () => {
    const items = exportCorpus([ev("e1", "insight", { text: "x" })]);
    expect(items[0]?.refs).toEqual([]);
  });

  it("token_change with reason + path -> semantic, formatted text", () => {
    const items = exportCorpus([
      ev("e1", "token_change", { path: "color.brand.500", from: "#111", to: "#222", reason: "too dark" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]?.tier).toBe("semantic");
    expect(items[0]?.text).toBe("Token color.brand.500 changed from #111 to #222. Reason: too dark");
  });

  it("token_change with reason + path but missing from/to renders '?' placeholders", () => {
    const items = exportCorpus([ev("e1", "token_change", { path: "space.md", reason: "rebalance" })]);
    expect(items[0]?.text).toBe("Token space.md changed from ? to ?. Reason: rebalance");
  });

  it("token_change WITHOUT reason is skipped even with a path", () => {
    const items = exportCorpus([ev("e1", "token_change", { path: "space.md", from: "4", to: "8" })]);
    expect(items).toHaveLength(0);
  });

  it("token_change WITHOUT path is skipped even with a reason", () => {
    const items = exportCorpus([ev("e1", "token_change", { from: "4", to: "8", reason: "rebalance" })]);
    expect(items).toHaveLength(0);
  });

  it("harvested with source only -> semantic, default 'design signals' wording", () => {
    const items = exportCorpus([ev("e1", "harvested", { source: "linear.app" })]);
    expect(items[0]?.tier).toBe("semantic");
    expect(items[0]?.text).toBe("Harvested design signals from linear.app.");
  });

  it("harvested with source + what -> uses the 'what' text", () => {
    const items = exportCorpus([ev("e1", "harvested", { source: "linear.app", what: "spacing scale" })]);
    expect(items[0]?.text).toBe("Harvested spacing scale from linear.app.");
  });

  it("harvested WITHOUT source is skipped", () => {
    const items = exportCorpus([ev("e1", "harvested", { what: "spacing scale" })]);
    expect(items).toHaveLength(0);
  });

  it("vibe_edit with word + axis -> procedural mapping text", () => {
    const items = exportCorpus([ev("e1", "vibe_edit", { word: "warmer", axis: "Motion" })]);
    expect(items[0]?.tier).toBe("procedural");
    expect(items[0]?.text).toBe('The vibe "warmer" maps to the Motion axis.');
  });

  it("vibe_edit missing axis is skipped", () => {
    expect(exportCorpus([ev("e1", "vibe_edit", { word: "warmer" })])).toHaveLength(0);
  });

  it("vibe_edit missing word is skipped", () => {
    expect(exportCorpus([ev("e1", "vibe_edit", { axis: "Motion" })])).toHaveLength(0);
  });

  it("variant_generated with persona + mode, no intent -> procedural text with no tail", () => {
    const items = exportCorpus([ev("e1", "variant_generated", { persona: "liquid-glass", mode: "desktop" })]);
    expect(items[0]?.tier).toBe("procedural");
    expect(items[0]?.text).toBe("Persona liquid-glass was used to generate a desktop design.");
  });

  it("variant_generated with persona + mode + intent -> tail appended", () => {
    const items = exportCorpus([
      ev("e1", "variant_generated", { persona: "liquid-glass", mode: "desktop", intent: "pricing page" }),
    ]);
    expect(items[0]?.text).toBe("Persona liquid-glass was used to generate a desktop design for: pricing page.");
  });

  it("variant_generated missing mode is skipped", () => {
    expect(exportCorpus([ev("e1", "variant_generated", { persona: "liquid-glass" })])).toHaveLength(0);
  });

  it.each(["user_pick", "taste_verdict", "manual_edit", "component_registered", "rendition_created", "duel_result"] as const)(
    "%s is always skipped (no free text worth embedding)",
    (type) => {
      const items = exportCorpus([ev("e1", type, { anything: "goes", chosen: "d1", rejected: [], scores: {}, lowestAxis: "x", round: 1, pass: true, summary: "s", name: "n", benchmark: "b", traits: [] })]);
      expect(items).toHaveLength(0);
    },
  );
});

// ─── exportCorpus: order + since slicing ────────────────────────────────────────

describe("exportCorpus order preservation + sinceId slicing", () => {
  const ledger: MemoryEvent[] = [
    ev("e1", "insight", { text: "one" }, { refs: ["e0"] }),
    ev("e2", "harvested", { source: "a.com" }),
    ev("e3", "vibe_edit", { word: "warmer", axis: "Motion" }),
    ev("e4", "user_pick", { chosen: "d1", rejected: [] }), // skipped type
    ev("e5", "variant_generated", { persona: "p", mode: "d" }),
  ];

  it("preserves ledger (chronological) order in the output", () => {
    const items = exportCorpus(ledger);
    expect(items.map((i) => i.id)).toEqual(["e1", "e2", "e3", "e5"]);
  });

  it("--since e2 is exclusive: only e3+ survive", () => {
    const items = exportCorpus(ledger, "e2");
    expect(items.map((i) => i.id)).toEqual(["e3", "e5"]);
  });

  it("--since e1 keeps everything after e1", () => {
    const items = exportCorpus(ledger, "e1");
    expect(items.map((i) => i.id)).toEqual(["e2", "e3", "e5"]);
  });

  it("--since with an id past the end of the ledger yields nothing", () => {
    const items = exportCorpus(ledger, "e99");
    expect(items).toHaveLength(0);
  });

  it("--since an id NOT present in the ledger still slices correctly (numeric cut)", () => {
    // ledger has no e0-numbered gap here, but the cut is purely numeric — verify
    // by using a sparse ledger where e2 is absent.
    const sparse: MemoryEvent[] = [
      ev("e1", "insight", { text: "one" }, { refs: ["e0"] }),
      ev("e3", "vibe_edit", { word: "warmer", axis: "Motion" }),
      ev("e5", "variant_generated", { persona: "p", mode: "d" }),
    ];
    const items = exportCorpus(sparse, "e2");
    expect(items.map((i) => i.id)).toEqual(["e3", "e5"]);
  });

  it("no sinceId returns the full corpus", () => {
    expect(exportCorpus(ledger).length).toBe(4);
  });

  it("invalid sinceId throws", () => {
    expect(() => exportCorpus(ledger, "x")).toThrow();
    expect(() => exportCorpus(ledger, "e")).toThrow();
    expect(() => exportCorpus(ledger, "e1a")).toThrow();
  });
});

// ─── corpusById ──────────────────────────────────────────────────────────────

describe("corpusById", () => {
  it("indexes items by event id", () => {
    const items = exportCorpus([
      ev("e1", "insight", { text: "one" }, { refs: ["e0"] }),
      ev("e2", "harvested", { source: "a.com" }),
    ]);
    const byId = corpusById(items);
    expect(byId.size).toBe(2);
    expect(byId.get("e1")?.text).toBe("one");
    expect(byId.get("e2")?.text).toBe("Harvested design signals from a.com.");
    expect(byId.get("e99")).toBeUndefined();
  });

  it("empty corpus -> empty map", () => {
    expect(corpusById([]).size).toBe(0);
  });
});

// ─── parseRankFile ───────────────────────────────────────────────────────────

describe("parseRankFile", () => {
  it("accepts a bare id array", () => {
    expect(parseRankFile(["e1", "e2", "e3"])).toEqual(["e1", "e2", "e3"]);
  });

  it("accepts the scored object form and preserves file order as rank order", () => {
    expect(
      parseRankFile([
        { id: "e12", score: 0.9 },
        { id: "e5", score: 0.4 },
      ]),
    ).toEqual(["e12", "e5"]);
  });

  it("accepts an empty array", () => {
    expect(parseRankFile([])).toEqual([]);
  });

  it("throws on a non-array payload", () => {
    expect(() => parseRankFile({ id: "e1" })).toThrow();
    expect(() => parseRankFile("e1")).toThrow();
    expect(() => parseRankFile(null)).toThrow();
  });

  it("throws when an entry is neither a string nor an object with a string id", () => {
    expect(() => parseRankFile([{ score: 0.9 }])).toThrow();
    expect(() => parseRankFile([42])).toThrow();
    expect(() => parseRankFile([{ id: 5 }])).toThrow();
    expect(() => parseRankFile([null])).toThrow();
  });
});
