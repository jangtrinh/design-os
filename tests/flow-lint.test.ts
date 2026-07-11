/**
 * `lintFlow` — the deterministic IA-graph checks (DESIGN-OS T3). One focused
 * case per check: a positive fixture that fires it, and a negative fixture
 * (usually the shared CLEAN flow) that proves it stays quiet. Plus a fully
 * valid flow asserted to have zero findings, and a determinism check.
 */
import { describe, it, expect } from "vitest";
import { parseFlow } from "../src/core/flow-model.js";
import { lintFlow } from "../src/core/flow-lint.js";
import type { FlowLintResult } from "../src/core/flow-lint.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────
// Named separately (not array-indexed) so re-spreading a single transition
// stays typesafe under noUncheckedIndexedAccess.
const S_HOME = { id: "home" };
const S_DETAIL = { id: "detail" };
const T_HOME_TO_DETAIL = { id: "t1", from: "home", to: "detail", trigger: "ON_CLICK" };
const T_DETAIL_TO_HOME = { id: "t2", from: "detail", to: "home", trigger: "ON_CLICK" };

/** A fully valid two-screen flow: entry → detail → back to entry. Zero findings. */
const CLEAN = {
  entryPoints: [{ id: "e1", screen: "home" }],
  screens: [S_HOME, S_DETAIL],
  transitions: [T_HOME_TO_DETAIL, T_DETAIL_TO_HOME],
};

/** A messier flow exercising several checks at once, for the determinism check. */
const MESSY = {
  entryPoints: [{ id: "e1", screen: "home" }],
  screens: [S_HOME, S_DETAIL, { id: "orphanX", terminal: true }],
  transitions: [
    T_HOME_TO_DETAIL,
    { id: "t2", from: "detail", to: "ghost", trigger: "ON_TAP" },
    { id: "t3", from: "detail", to: "detail", trigger: "ON_CLICK" },
  ],
};

function lint(json: unknown): FlowLintResult {
  return lintFlow(parseFlow(json));
}
function ids(r: FlowLintResult): string[] {
  return r.findings.map((f) => f.checkId);
}

// ─── Baseline ──────────────────────────────────────────────────────────────

describe("lintFlow — a fully valid flow", () => {
  it("has zero findings and errorCount 0", () => {
    const r = lint(CLEAN);
    expect(r.errorCount).toBe(0);
    expect(r.warningCount).toBe(0);
    expect(r.findings).toEqual([]);
  });
});

describe("lintFlow — determinism", () => {
  it("produces the same result across repeated calls on the same flow", () => {
    const f = parseFlow(MESSY);
    expect(lintFlow(f)).toEqual(lintFlow(f));
  });
});

// ─── ERRORS ─────────────────────────────────────────────────────────────────

describe("dangling-ref", () => {
  it("fires when a transition targets a nonexistent screen", () => {
    const bad = { ...CLEAN, transitions: [...CLEAN.transitions, { id: "t3", from: "home", to: "ghost", trigger: "ON_CLICK" }] };
    const r = lint(bad);
    expect(ids(r)).toContain("dangling-ref");
    expect(r.findings.some((f) => f.checkId === "dangling-ref" && f.message.includes("ghost"))).toBe(true);
  });

  it("fires when a transition targets a nonexistent state on an existing screen", () => {
    const bad = { ...CLEAN, transitions: [...CLEAN.transitions, { id: "t3", from: "home", to: "detail.missingState", trigger: "ON_CLICK" }] };
    const r = lint(bad);
    expect(ids(r)).toContain("dangling-ref");
    expect(r.findings.some((f) => f.checkId === "dangling-ref" && f.message.includes("detail.missingState"))).toBe(true);
  });

  it("does not fire on a clean flow", () => {
    expect(ids(lint(CLEAN))).not.toContain("dangling-ref");
  });
});

describe("unreachable-screen", () => {
  it("fires for a screen with no path from any entry point", () => {
    const bad = { ...CLEAN, screens: [...CLEAN.screens, { id: "island", terminal: true }] };
    expect(ids(lint(bad))).toContain("unreachable-screen");
  });

  it("does not fire on a clean flow", () => {
    expect(ids(lint(CLEAN))).not.toContain("unreachable-screen");
  });
});

describe("dead-end", () => {
  it("fires for a non-terminal screen with no outgoing transition", () => {
    const bad = {
      ...CLEAN,
      screens: [...CLEAN.screens, { id: "stuck" }],
      transitions: [...CLEAN.transitions, { id: "t3", from: "home", to: "stuck", trigger: "ON_CLICK" }],
    };
    expect(ids(lint(bad))).toContain("dead-end");
  });

  it("does not fire for a terminal screen with no outgoing transition", () => {
    const good = {
      ...CLEAN,
      screens: [...CLEAN.screens, { id: "success", terminal: true }],
      transitions: [...CLEAN.transitions, { id: "t3", from: "home", to: "success", trigger: "ON_CLICK" }],
    };
    expect(ids(lint(good))).not.toContain("dead-end");
  });

  it("does not fire on a clean flow", () => {
    expect(ids(lint(CLEAN))).not.toContain("dead-end");
  });
});

describe("missing-error-state", () => {
  it("fires for an async:true outgoing transition when the screen has no 'error' state", () => {
    const bad = { ...CLEAN, transitions: [{ ...T_HOME_TO_DETAIL, async: true }, T_DETAIL_TO_HOME] };
    expect(ids(lint(bad))).toContain("missing-error-state");
  });

  it("fires for an ON_SUBMIT outgoing transition when the screen has no 'error' state", () => {
    const bad = { ...CLEAN, transitions: [{ ...T_HOME_TO_DETAIL, trigger: "ON_SUBMIT" }, T_DETAIL_TO_HOME] };
    expect(ids(lint(bad))).toContain("missing-error-state");
  });

  it("does not fire when the screen declares an 'error' state", () => {
    const good = {
      ...CLEAN,
      screens: [{ id: "home", states: ["default", "error"] }, S_DETAIL],
      transitions: [{ ...T_HOME_TO_DETAIL, async: true }, T_DETAIL_TO_HOME],
    };
    expect(ids(lint(good))).not.toContain("missing-error-state");
  });
});

describe("invalid-trigger", () => {
  it("fires for a trigger outside TRIGGERS", () => {
    const bad = { ...CLEAN, transitions: [{ ...T_HOME_TO_DETAIL, trigger: "ON_TAP" }, T_DETAIL_TO_HOME] };
    expect(ids(lint(bad))).toContain("invalid-trigger");
  });

  it("does not fire on a clean flow", () => {
    expect(ids(lint(CLEAN))).not.toContain("invalid-trigger");
  });
});

describe("noop-self-loop", () => {
  it("fires when from === to on a transition", () => {
    const bad = { ...CLEAN, transitions: [...CLEAN.transitions, { id: "t3", from: "detail", to: "detail", trigger: "ON_CLICK" }] };
    expect(ids(lint(bad))).toContain("noop-self-loop");
  });

  it("does not fire on a clean flow", () => {
    expect(ids(lint(CLEAN))).not.toContain("noop-self-loop");
  });
});

describe("no-entry", () => {
  it("fires when entryPoints is empty", () => {
    const bad = { ...CLEAN, entryPoints: [] };
    expect(ids(lint(bad))).toContain("no-entry");
  });

  it("does not fire on a clean flow", () => {
    expect(ids(lint(CLEAN))).not.toContain("no-entry");
  });
});

// ─── WARNINGS ───────────────────────────────────────────────────────────────

describe("orphan-screen", () => {
  it("fires for a screen wired to nothing (no in/out) that is not an entry", () => {
    const bad = { ...CLEAN, screens: [...CLEAN.screens, { id: "lonely" }] };
    expect(ids(lint(bad))).toContain("orphan-screen");
  });

  it("does not fire on a clean flow", () => {
    expect(ids(lint(CLEAN))).not.toContain("orphan-screen");
  });
});

describe("unreachable-state", () => {
  it("fires for a declared non-default state that no transition targets", () => {
    const bad = { ...CLEAN, screens: [S_HOME, { id: "detail", states: ["default", "confirmed"] }] };
    expect(ids(lint(bad))).toContain("unreachable-state");
  });

  it("does not fire on a clean flow", () => {
    expect(ids(lint(CLEAN))).not.toContain("unreachable-state");
  });
});

describe("missing-back-path", () => {
  it("fires for a reachable non-entry, non-terminal screen with no path back to an entry", () => {
    const bad = {
      entryPoints: [{ id: "e1", screen: "home" }],
      screens: [S_HOME, S_DETAIL, { id: "leaf", terminal: true }],
      transitions: [T_HOME_TO_DETAIL, { id: "t2", from: "detail", to: "leaf", trigger: "ON_CLICK" }],
    };
    expect(ids(lint(bad))).toContain("missing-back-path");
  });

  it("does not fire on a clean flow (detail can navigate back to home)", () => {
    expect(ids(lint(CLEAN))).not.toContain("missing-back-path");
  });
});

describe("missing-empty-state / missing-skeleton", () => {
  it("both fire for a data-mode screen lacking empty and skeleton states", () => {
    const bad = { ...CLEAN, screens: [S_HOME, { id: "detail", mode: "dashboard" }] };
    const r = lint(bad);
    expect(ids(r)).toContain("missing-empty-state");
    expect(ids(r)).toContain("missing-skeleton");
  });

  it("only missing-skeleton fires when empty is declared but skeleton is not", () => {
    const bad = { ...CLEAN, screens: [S_HOME, { id: "detail", mode: "ecommerce", states: ["default", "empty"] }] };
    const r = lint(bad);
    expect(ids(r)).toContain("missing-skeleton");
    expect(ids(r)).not.toContain("missing-empty-state");
  });

  it("neither fires on a clean flow (no data mode declared)", () => {
    const r = lint(CLEAN);
    expect(ids(r)).not.toContain("missing-empty-state");
    expect(ids(r)).not.toContain("missing-skeleton");
  });
});

describe("guard-without-complement", () => {
  it("fires for a guarded transition with no sibling (else) transition from the same from-node", () => {
    const bad = { ...CLEAN, transitions: [{ ...T_HOME_TO_DETAIL, guard: "isValid" }, T_DETAIL_TO_HOME] };
    expect(ids(lint(bad))).toContain("guard-without-complement");
  });

  it("does not fire when a sibling transition exists from the same from-node", () => {
    const good = {
      ...CLEAN,
      transitions: [
        { ...T_HOME_TO_DETAIL, guard: "isValid" },
        { id: "t1b", from: "home", to: "detail", trigger: "ON_CLICK" },
        T_DETAIL_TO_HOME,
      ],
    };
    expect(ids(lint(good))).not.toContain("guard-without-complement");
  });
});
