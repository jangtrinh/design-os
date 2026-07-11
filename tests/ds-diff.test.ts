/**
 * Pure-core tests for `src/core/ds-diff.ts` — the DS semver diff classifier.
 * Covers colorDeltaE, dimensionDeltaPct, nextVersion, and diffDesignSystem's
 * token/component/dangling classification + aggregate severity rules.
 */
import { describe, expect, it } from "vitest";
import {
  diffDesignSystem,
  colorDeltaE,
  dimensionDeltaPct,
  nextVersion,
  DEFAULT_COLOR_TOLERANCE,
} from "../src/core/ds-diff.js";
import type { DsState, DiffComponent } from "../src/core/ds-diff.js";
import type { ResolvedToken } from "../src/core/token-model.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function tok(path: string, type: ResolvedToken["type"], value: ResolvedToken["value"]): ResolvedToken {
  return { path, type, value };
}

function state(tokens: ResolvedToken[], components: DiffComponent[] = []): DsState {
  return { tokens, components };
}

const EMPTY: DsState = { tokens: [], components: [] };

// ─── colorDeltaE ────────────────────────────────────────────────────────────

describe("colorDeltaE", () => {
  it("returns ~0 for identical hex", () => {
    expect(colorDeltaE("#2563EB", "#2563EB")).toBeCloseTo(0, 6);
  });

  it("returns a small delta for a near-identical hex nudge", () => {
    const d = colorDeltaE("#2563EB", "#2563EC");
    expect(d).not.toBeNull();
    expect(d as number).toBeLessThanOrEqual(DEFAULT_COLOR_TOLERANCE);
  });

  it("returns a large delta for a clearly different hex", () => {
    const d = colorDeltaE("#2563EB", "#EF4444");
    expect(d).not.toBeNull();
    expect(d as number).toBeGreaterThan(DEFAULT_COLOR_TOLERANCE);
  });

  it("returns null when either side isn't a hex color", () => {
    expect(colorDeltaE("blue", "#2563EB")).toBeNull();
    expect(colorDeltaE("#2563EB", "rgb(1,2,3)")).toBeNull();
    expect(colorDeltaE("not-a-color", "also-not")).toBeNull();
  });

  it("is symmetric-ish (order doesn't flip null-ness)", () => {
    expect(colorDeltaE("#000000", "#FFFFFF")).not.toBeNull();
    expect(colorDeltaE("#FFFFFF", "#000000")).not.toBeNull();
  });
});

// ─── dimensionDeltaPct ──────────────────────────────────────────────────────

describe("dimensionDeltaPct", () => {
  it("returns null on unit mismatch", () => {
    expect(dimensionDeltaPct("16px", "1rem")).toBeNull();
  });

  it("returns 0 for 0 → 0 (same unit)", () => {
    expect(dimensionDeltaPct("0px", "0px")).toBe(0);
  });

  it("returns Infinity for 0 → nonzero", () => {
    expect(dimensionDeltaPct("0px", "10px")).toBe(Infinity);
  });

  it("computes correct percent for a growth", () => {
    expect(dimensionDeltaPct("16px", "24px")).toBeCloseTo(50, 6);
  });

  it("computes correct percent for a small change", () => {
    expect(dimensionDeltaPct("100px", "103px")).toBeCloseTo(3, 6);
  });

  it("computes magnitude regardless of direction (shrink)", () => {
    expect(dimensionDeltaPct("24px", "16px")).toBeCloseTo(33.333333, 4);
  });

  it("returns null for unparseable values", () => {
    expect(dimensionDeltaPct("auto", "16px")).toBeNull();
    expect(dimensionDeltaPct("16px", "calc(100% - 4px)")).toBeNull();
  });
});

// ─── nextVersion ────────────────────────────────────────────────────────────

describe("nextVersion", () => {
  it("major bump resets minor/patch", () => {
    expect(nextVersion("1.2.0", "major")).toBe("2.0.0");
  });

  it("minor bump resets patch", () => {
    expect(nextVersion("1.2.0", "minor")).toBe("1.3.0");
  });

  it("patch bump increments patch only", () => {
    expect(nextVersion("1.2.0", "patch")).toBe("1.2.1");
  });

  it("none bump leaves version unchanged", () => {
    expect(nextVersion("1.2.0", "none")).toBe("1.2.0");
  });

  it("tolerates a leading v", () => {
    expect(nextVersion("v1.2.0", "major")).toBe("2.0.0");
  });

  it("returns null for unparseable version strings", () => {
    expect(nextVersion("garbage", "major")).toBeNull();
    expect(nextVersion("", "major")).toBeNull();
  });

  it("tolerates trailing pre-release/build metadata after x.y.z", () => {
    expect(nextVersion("1.2.0-beta.1", "patch")).toBe("1.2.1");
  });
});

// ─── diffDesignSystem: tokens ───────────────────────────────────────────────

describe("diffDesignSystem — token additions/removals", () => {
  it("token added → additive classification", () => {
    const base = state([]);
    const head = state([tok("color.primary", "color", "#2563EB")]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.added).toEqual([{ path: "color.primary", type: "color", value: "#2563EB" }]);
    expect(d.classification).toBe("additive");
    expect(d.recommendedBump).toBe("minor");
  });

  it("token removed → breaking classification", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.removed).toEqual([{ path: "color.primary", type: "color", value: "#2563EB" }]);
    expect(d.classification).toBe("breaking");
    expect(d.recommendedBump).toBe("major");
  });

  it("no changes → none classification, all buckets empty", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([tok("color.primary", "color", "#2563EB")]);
    const d = diffDesignSystem(base, head);
    expect(d.classification).toBe("none");
    expect(d.recommendedBump).toBe("none");
    expect(d.tokens.added).toEqual([]);
    expect(d.tokens.removed).toEqual([]);
    expect(d.tokens.changed).toEqual([]);
  });
});

describe("diffDesignSystem — color value changes", () => {
  it("near-identical hex nudge → patch, carries deltaE", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([tok("color.primary", "color", "#2563EC")]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed).toHaveLength(1);
    const c = d.tokens.changed[0];
    expect(c).toBeDefined();
    expect(c?.severity).toBe("patch");
    expect(c?.deltaE).toBeDefined();
    expect(d.classification).toBe("patch");
    expect(d.recommendedBump).toBe("patch");
  });

  it("clearly different hex → breaking, carries deltaE", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([tok("color.primary", "color", "#EF4444")]);
    const d = diffDesignSystem(base, head);
    const c = d.tokens.changed[0];
    expect(c?.severity).toBe("breaking");
    expect(c?.deltaE).toBeDefined();
    expect(d.classification).toBe("breaking");
  });

  it("non-hex color change → breaking, no deltaE", () => {
    const base = state([tok("color.primary", "color", "blue")]);
    const head = state([tok("color.primary", "color", "red")]);
    const d = diffDesignSystem(base, head);
    const c = d.tokens.changed[0];
    expect(c?.severity).toBe("breaking");
    expect(c?.deltaE).toBeUndefined();
  });
});

describe("diffDesignSystem — dimension value changes", () => {
  it("50% dimension change → breaking", () => {
    const base = state([tok("space.md", "dimension", "16px")]);
    const head = state([tok("space.md", "dimension", "24px")]);
    const d = diffDesignSystem(base, head);
    const c = d.tokens.changed[0];
    expect(c?.severity).toBe("breaking");
    expect(d.classification).toBe("breaking");
  });

  it("3% dimension change → patch", () => {
    const base = state([tok("space.md", "dimension", "100px")]);
    const head = state([tok("space.md", "dimension", "103px")]);
    const d = diffDesignSystem(base, head);
    const c = d.tokens.changed[0];
    expect(c?.severity).toBe("patch");
    expect(d.classification).toBe("patch");
  });

  it("exactly at tolerance boundary (5%) → patch", () => {
    const base = state([tok("space.md", "dimension", "100px")]);
    const head = state([tok("space.md", "dimension", "105px")]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed[0]?.severity).toBe("patch");
  });

  it("just over tolerance boundary (5.1%) → breaking", () => {
    const base = state([tok("space.md", "dimension", "100px")]);
    const head = state([tok("space.md", "dimension", "105.1px")]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed[0]?.severity).toBe("breaking");
  });

  it("unit change → breaking", () => {
    const base = state([tok("space.md", "dimension", "16px")]);
    const head = state([tok("space.md", "dimension", "1rem")]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed[0]?.severity).toBe("breaking");
    expect(d.tokens.changed[0]?.reason).toMatch(/unit/);
  });

  it("custom dimension tolerance option is honoured", () => {
    const base = state([tok("space.md", "dimension", "100px")]);
    const head = state([tok("space.md", "dimension", "108px")]); // 8%
    const patchWithLooseTol = diffDesignSystem(base, head, { dimensionTolerancePct: 10 });
    expect(patchWithLooseTol.tokens.changed[0]?.severity).toBe("patch");
    const breakingWithDefaultTol = diffDesignSystem(base, head);
    expect(breakingWithDefaultTol.tokens.changed[0]?.severity).toBe("breaking");
  });

  it("custom color tolerance option is honoured", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([tok("color.primary", "color", "#2563EC")]);
    const strict = diffDesignSystem(base, head, { colorTolerance: 0 });
    expect(strict.tokens.changed[0]?.severity).toBe("breaking");
  });
});

describe("diffDesignSystem — $type / other value-type changes", () => {
  it("$type change → breaking", () => {
    const base = state([tok("space.md", "dimension", "16px")]);
    const head = state([tok("space.md", "number", 16)]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed[0]?.severity).toBe("breaking");
    expect(d.tokens.changed[0]?.reason).toMatch(/\$type changed/);
  });

  it("fontWeight value change → breaking", () => {
    const base = state([tok("font.weight.bold", "fontWeight", "700")]);
    const head = state([tok("font.weight.bold", "fontWeight", "600")]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed[0]?.severity).toBe("breaking");
  });

  it("fontFamily value change → breaking", () => {
    const base = state([tok("font.family.body", "fontFamily", "Inter")]);
    const head = state([tok("font.family.body", "fontFamily", "Roboto")]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed[0]?.severity).toBe("breaking");
  });

  it("duration value change → breaking", () => {
    const base = state([tok("motion.fast", "duration", "150ms")]);
    const head = state([tok("motion.fast", "duration", "200ms")]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed[0]?.severity).toBe("breaking");
  });

  it("number value change → breaking", () => {
    const base = state([tok("opacity.disabled", "number", 0.5)]);
    const head = state([tok("opacity.disabled", "number", 0.4)]);
    const d = diffDesignSystem(base, head);
    expect(d.tokens.changed[0]?.severity).toBe("breaking");
  });
});

// ─── diffDesignSystem: components ──────────────────────────────────────────

describe("diffDesignSystem — components", () => {
  const button = (overrides: Partial<DiffComponent> = {}): DiffComponent => ({
    name: "Button",
    category: "action",
    tokensUsed: ["color.primary"],
    variants: ["primary", "secondary"],
    states: ["default", "hover"],
    markup: "<button>{label}</button>",
    ...overrides,
  });

  it("component added → additive", () => {
    const base = state([], []);
    const head = state([], [button()]);
    const d = diffDesignSystem(base, head);
    expect(d.components.added).toEqual(["Button"]);
    expect(d.classification).toBe("additive");
  });

  it("component removed → breaking", () => {
    const base = state([], [button()]);
    const head = state([], []);
    const d = diffDesignSystem(base, head);
    expect(d.components.removed).toEqual(["Button"]);
    expect(d.classification).toBe("breaking");
  });

  it("variant added → additive", () => {
    const base = state([], [button({ variants: ["primary"] })]);
    const head = state([], [button({ variants: ["primary", "ghost"] })]);
    const d = diffDesignSystem(base, head);
    const c = d.components.changed[0];
    expect(c?.severity).toBe("additive");
    expect(c?.variants.added).toEqual(["ghost"]);
    expect(d.classification).toBe("additive");
  });

  it("variant removed → breaking", () => {
    const base = state([], [button({ variants: ["primary", "ghost"] })]);
    const head = state([], [button({ variants: ["primary"] })]);
    const d = diffDesignSystem(base, head);
    const c = d.components.changed[0];
    expect(c?.severity).toBe("breaking");
    expect(c?.variants.removed).toEqual(["ghost"]);
    expect(d.classification).toBe("breaking");
  });

  it("state added → additive, state removed → breaking; net severity = max", () => {
    const base = state([], [button({ states: ["default", "hover"] })]);
    const head = state([], [button({ states: ["default", "focus"] })]); // hover removed, focus added
    const d = diffDesignSystem(base, head);
    const c = d.components.changed[0];
    expect(c?.states.added).toEqual(["focus"]);
    expect(c?.states.removed).toEqual(["hover"]);
    expect(c?.severity).toBe("breaking"); // removal wins over addition
  });

  it("tokensUsed change only → patch", () => {
    const base = state([], [button({ tokensUsed: ["color.primary"] })]);
    const head = state([], [button({ tokensUsed: ["color.secondary"] })]);
    const d = diffDesignSystem(base, head);
    const c = d.components.changed[0];
    expect(c?.severity).toBe("patch");
    expect(d.classification).toBe("patch");
  });

  it("markup-only change → patch", () => {
    const base = state([], [button({ markup: "<button>{label}</button>" })]);
    const head = state([], [button({ markup: "<button type=\"button\">{label}</button>" })]);
    const d = diffDesignSystem(base, head);
    const c = d.components.changed[0];
    expect(c?.severity).toBe("patch");
    expect(c?.markupChanged).toBe(true);
    expect(d.classification).toBe("patch");
  });

  it("identical component → no entry in changed", () => {
    const base = state([], [button()]);
    const head = state([], [button()]);
    const d = diffDesignSystem(base, head);
    expect(d.components.changed).toEqual([]);
    expect(d.classification).toBe("none");
  });

  it("variant removal + tokensUsed change on same component → severity is max (breaking)", () => {
    const base = state([], [button({ variants: ["primary", "ghost"], tokensUsed: ["color.primary"] })]);
    const head = state([], [button({ variants: ["primary"], tokensUsed: ["color.secondary"] })]);
    const d = diffDesignSystem(base, head);
    const c = d.components.changed[0];
    expect(c?.severity).toBe("breaking");
    expect(c?.reasons.length).toBeGreaterThan(1);
  });
});

// ─── diffDesignSystem: dangling references ─────────────────────────────────

describe("diffDesignSystem — dangling references", () => {
  it("head component still references a head-removed token → dangling + forced breaking", () => {
    const base = state(
      [tok("color.primary", "color", "#2563EB")],
      [{ name: "Button", category: "action", tokensUsed: ["color.primary"] }],
    );
    const head = state(
      [],
      [{ name: "Button", category: "action", tokensUsed: ["color.primary"] }],
    );
    const d = diffDesignSystem(base, head);
    expect(d.dangling).toEqual([{ component: "Button", token: "color.primary" }]);
    expect(d.classification).toBe("breaking");
  });

  it("no dangling when component drops the reference to the removed token too", () => {
    const base = state(
      [tok("color.primary", "color", "#2563EB")],
      [{ name: "Button", category: "action", tokensUsed: ["color.primary"] }],
    );
    const head = state(
      [],
      [{ name: "Button", category: "action", tokensUsed: [] }],
    );
    const d = diffDesignSystem(base, head);
    expect(d.dangling).toEqual([]);
    // still breaking because the token itself was removed
    expect(d.classification).toBe("breaking");
  });
});

// ─── aggregate classification / recommendedVersion ─────────────────────────

describe("diffDesignSystem — aggregate severity & recommendedVersion", () => {
  it("mixed additive + patch → aggregate additive (max severity wins)", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([
      tok("color.primary", "color", "#2563EC"), // patch
      tok("color.secondary", "color", "#EF4444"), // added → additive
    ]);
    const d = diffDesignSystem(base, head);
    expect(d.classification).toBe("additive");
    expect(d.recommendedBump).toBe("minor");
  });

  it("mixed additive + breaking → aggregate breaking", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([
      tok("color.secondary", "color", "#EF4444"), // added → additive
    ]); // color.primary removed → breaking
    const d = diffDesignSystem(base, head);
    expect(d.classification).toBe("breaking");
    expect(d.recommendedBump).toBe("major");
  });

  it("recommendedVersion present only when baseVersion given, correct per bump", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const headMajor = state([]); // removal → breaking
    const dNoVersion = diffDesignSystem(base, headMajor);
    expect(dNoVersion.recommendedVersion).toBeUndefined();

    const dMajor = diffDesignSystem(base, headMajor, { baseVersion: "1.2.0" });
    expect(dMajor.recommendedVersion).toBe("2.0.0");

    const headMinor = state([tok("color.primary", "color", "#2563EB"), tok("color.secondary", "color", "#EF4444")]);
    const dMinor = diffDesignSystem(base, headMinor, { baseVersion: "1.2.0" });
    expect(dMinor.recommendedVersion).toBe("1.3.0");

    const headPatch = state([tok("color.primary", "color", "#2563EC")]);
    const dPatch = diffDesignSystem(base, headPatch, { baseVersion: "1.2.0" });
    expect(dPatch.recommendedVersion).toBe("1.2.1");

    const dNone = diffDesignSystem(base, base, { baseVersion: "1.2.0" });
    expect(dNone.recommendedVersion).toBe("1.2.0");
  });

  it("recommendedVersion omitted when baseVersion is unparseable", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([]);
    const d = diffDesignSystem(base, head, { baseVersion: "garbage" });
    expect(d.recommendedVersion).toBeUndefined();
  });
});

// ─── determinism ────────────────────────────────────────────────────────────

describe("diffDesignSystem — determinism", () => {
  it("arrays are sorted and calling twice yields identical output", () => {
    const base = state(
      [tok("color.z", "color", "#000000"), tok("color.a", "color", "#111111")],
      [
        { name: "Zeta", category: "x", tokensUsed: [] },
        { name: "Alpha", category: "x", tokensUsed: [] },
      ],
    );
    const head = state(
      [tok("color.a", "color", "#111112"), tok("color.b", "color", "#222222")],
      [{ name: "Alpha", category: "x", tokensUsed: [] }],
    );
    const d1 = diffDesignSystem(base, head);
    const d2 = diffDesignSystem(base, head);
    expect(d1).toEqual(d2);
    expect(d1.tokens.added.map((t) => t.path)).toEqual(["color.b"]);
    expect(d1.tokens.removed.map((t) => t.path)).toEqual(["color.z"]);
    expect(d1.components.removed).toEqual(["Zeta"]);
  });

  it("full DsDiff shape round-trips through JSON unchanged (no functions/undefined leaks affecting equality)", () => {
    const base = state([tok("color.primary", "color", "#2563EB")]);
    const head = state([tok("color.primary", "color", "#EF4444")]);
    const d = diffDesignSystem(base, head);
    const rehydrated = JSON.parse(JSON.stringify(d));
    expect(rehydrated.classification).toBe(d.classification);
    expect(rehydrated.tokens.changed[0].severity).toBe("breaking");
  });
});

// ─── empty state ────────────────────────────────────────────────────────────

describe("diffDesignSystem — empty states", () => {
  it("empty base and head → none, empty buckets", () => {
    const d = diffDesignSystem(EMPTY, EMPTY);
    expect(d.classification).toBe("none");
    expect(d.recommendedBump).toBe("none");
    expect(d.dangling).toEqual([]);
    expect(d.tokens.added).toEqual([]);
    expect(d.tokens.removed).toEqual([]);
    expect(d.tokens.changed).toEqual([]);
    expect(d.components.added).toEqual([]);
    expect(d.components.removed).toEqual([]);
    expect(d.components.changed).toEqual([]);
  });
});
