/**
 * `ui reuse-plan check` — lifecycle-marked names, variant values, the ds-new dodges,
 * placeholder reasons, and the reuse ratio. Each case is a plan an agent could write.
 */
import { describe, expect, it } from "vitest";
import { capture, check, codes, planFile, screen, FILES, PROJECT } from "./helpers/reuse-plan-kit.js";

describe("lifecycle-marked names", () => {
  it("LIFECYCLE_NAME at rung 3 for [ARCHIVED], [DEPRECATED], the cross mark and the repo's deprecation vocabulary", () => {
    for (const name of ["[ARCHIVED] Banner/Default", "[DEPRECATED] Menu/Default", "❌ Tag/Retired", "Footer/Legacy"]) {
      const r = check(screen([`| s | 3 | ${name} | — |`]));
      expect(r.code, name).toBe(1);
      expect(codes(r.data), name).toEqual(["LIFECYCLE_NAME"]);
      expect(r.data.screens[0]).toMatchObject({ reuse: 0, total: 1 });
    }
  });

  it("LIFECYCLE_NAME at rung 4 and for one member of a rung-5 composition", () => {
    expect(codes(check(screen(["| s | 4 | [ARCHIVED] Banner/Default (Kind=Info) | — |"])).data)).toEqual(["LIFECYCLE_NAME"]);
    const d = check(screen(["| s | 5 | Table/Basic + ❌ Tag/Retired | — |"])).data;
    expect(codes(d)).toEqual(["LIFECYCLE_NAME"]);
    expect(d.findings[0]?.message).toContain("Tag/Retired");
  });

  it("LIFECYCLE_NAME on the Pattern line", () => {
    expect(codes(check(screen(["| s | 3 | Table/Basic | — |"], "❌ Tag/Retired")).data)).toEqual(["LIFECYCLE_NAME"]);
  });

  it("[REVIEW] is a counted warning: exit 0, still reuse, printed in text", () => {
    const r = check(screen(["| s | 3 | [REVIEW] Panel/Draft | — |"]));
    expect(r.code).toBe(0);
    expect(r.data.findings).toEqual([]);
    expect(r.data.warningCount).toBe(1);
    expect(r.data.warnings[0]).toMatchObject({ code: "REVIEW_NAME", slot: "s" });
    expect(r.data.screens[0]).toMatchObject({ reuse: 1, total: 1 });
    const t = capture(["reuse-plan", "check", r.file, "--dir", PROJECT]);
    expect(t.out).toContain("REVIEW_NAME");
    expect(t.out).toContain("1 warning");
  });
});

describe("the registry's own deprecated flag and retired pattern files", () => {
  it("deprecated: true is LIFECYCLE_NAME at rungs 2-5 and on the Pattern line, naming the registry", () => {
    const cases: [string, string][] = [
      ["rung 3", "| s | 3 | Widget/Gone | — |"],
      ["rung 4", "| s | 4 | Widget/Gone (Kind=A) | — |"],
      ["rung 5", "| s | 5 | Table/Basic + Widget/Gone | — |"],
      ["rung 2", "| s | 2 | Pattern/RetiredPage | — |"],
    ];
    for (const [label, row] of cases) {
      const d = check(screen([row])).data;
      expect(codes(d), label).toEqual(["LIFECYCLE_NAME"]);
      expect(d.findings[0]?.message, label).toContain("deprecated in the registry");
    }
    const p = check(screen(["| s | 3 | Table/Basic | — |"], "Pattern/RetiredPage")).data;
    expect(codes(p)).toEqual(["LIFECYCLE_NAME"]);
    expect(p.findings[0]?.message).toContain("deprecated in the registry");
  });

  it("a pattern file whose stem marks it legacy is LIFECYCLE_NAME on the Pattern line and at rung 2", () => {
    expect(codes(check(screen(["| s | 3 | Table / Row | — |"], "legacy-table"), FILES).data)).toEqual(["LIFECYCLE_NAME"]);
    expect(codes(check(screen(["| s | 2 | legacy-table | — |"], "list-page"), FILES).data)).toEqual(["LIFECYCLE_NAME"]);
  });
});

describe("[REVIEW] on the Pattern line", () => {
  it("is a warning, the pattern still resolves", () => {
    const r = check(screen(["| s | 3 | Table / Row | — |"], "[REVIEW] Page content / Orders · Draft"), FILES);
    expect(r.code).toBe(0);
    expect(r.data.warnings.map((w) => w.code)).toEqual(["REVIEW_NAME"]);
    expect(r.data.screens[0]?.patternSource).toBe("registry");
  });
});

describe("ds-new cannot hide at another rung", () => {
  it("ds-new: at rung 1 is NEW_AT_WRONG_RUNG and the item is not listed as skipped-away", () => {
    const d = check(screen(["| a | 1 | ds-new: Fancy widget | not needed for the first release |", "| c | 3 | Table/Basic | — |"])).data;
    expect(codes(d)).toEqual(["NEW_AT_WRONG_RUNG"]);
    expect(d.findings[0]?.message).toContain("rung 1");
  });
});

describe("rung-4 variant values", () => {
  it("BAD_VARIANT_VALUE lists the record's valid values", () => {
    const d = check(screen(["| w | 4 | Chip/Status (Tone=Bogus) | — |"])).data;
    expect(codes(d)).toEqual(["BAD_VARIANT_VALUE"]);
    expect(d.findings[0]?.message).toContain("Tone=Info");
    expect(d.findings[0]?.message).toContain("Tone=Warn");
  });

  it("valid values pass, alone or several; one bad value among good ones fails", () => {
    expect(check(screen(["| w | 4 | Chip/Status (Tone=Info) | — |"])).code).toBe(0);
    expect(check(screen(["| w | 4 | Chip/Status (Tone=Info, Tone=Warn) | — |"])).code).toBe(0);
    expect(codes(check(screen(["| w | 4 | Chip/Status (Tone=Info, Tone=Nope) | — |"])).data)).toEqual(["BAD_VARIANT_VALUE"]);
  });

  it("a record without variants keeps syntax-only checking", () => {
    expect(check(screen(["| w | 4 | Table/Basic (Size=Large) | — |"])).code).toBe(0);
  });
});

describe("ds-new dodges", () => {
  it("NOT_NEW through separator folding, a variant suffix, or a composition of registered names", () => {
    for (const name of ["Button / Primary", "button-primary", "Button_Primary", "Button/Primary (State=Hover)", "Filter bar/Default + Table/Basic"]) {
      const d = check(screen([`| s | 7 | ds-new: ${name} | looked missing |`])).data;
      expect(codes(d), name).toEqual(["NOT_NEW"]);
      expect(d.dsNew, name).toEqual([]);
    }
  });

  it("a composition with an unregistered member is still a genuine new item", () => {
    const r = check(screen(["| s | 7 | ds-new: Filter bar/Default + Brand new strip | nothing like it |"]));
    expect(r.code).toBe(0);
    expect(r.data.dsNew).toHaveLength(1);
  });

  it("a near match is a hint on the item, never a finding", () => {
    const r = check(screen(["| s | 7 | ds-new: Buttons/Primary | secondary action variant |", "| t | 7 | ds-new: Gauge/Radial | no gauge |"]));
    expect(r.code).toBe(0);
    expect(r.data.findings).toEqual([]);
    expect(r.data.dsNew.find((x) => x.name === "Buttons/Primary")?.hint).toContain("Button/Primary");
    expect(r.data.dsNew.find((x) => x.name === "Gauge/Radial")?.hint).toBeUndefined();
    const t = capture(["reuse-plan", "check", r.file, "--dir", PROJECT]).out;
    expect(t).toMatch(/hint:.*Button\/Primary/);
  });
});

describe("placeholder reasons", () => {
  const placeholders = ["n/a", "N/A", "na", "N/A.", "none", "TBD", "todo", "?", "x", ".", "`—`", "`n/a`", "`-`", " - ", "Owner chip."];

  it("rung 7: a placeholder is NEW_WITHOUT_REASON", () => {
    for (const reason of placeholders) {
      expect(codes(check(screen([`| owner chip | 7 | ds-new: Owner chip | ${reason} |`])).data), reason).toEqual(["NEW_WITHOUT_REASON"]);
    }
  });

  it("rung 1: a placeholder is SKIP_WITHOUT_REASON", () => {
    for (const reason of ["n/a", "`-`", "tbd", "?"]) {
      expect(codes(check(screen([`| s | 1 | skip | ${reason} |`])).data), reason).toEqual(["SKIP_WITHOUT_REASON"]);
    }
  });

  it("Pattern: none — <placeholder> is PATTERN_NONE_NO_REASON", () => {
    for (const reason of ["n/a", "TBD", "`—`", "none", "todo"]) {
      expect(codes(check(screen(["| s | 3 | Table/Basic | — |"], `none — ${reason}`)).data), reason).toEqual(["PATTERN_NONE_NO_REASON"]);
    }
  });

  it("a real reason that merely starts like a placeholder passes", () => {
    for (const reason of ["no email chip in the registry", "x-ray panel has no equivalent", "nothing registered fits a radial gauge"]) {
      expect(check(screen([`| owner chip | 7 | ds-new: Owner chip | ${reason} |`])).code, reason).toBe(0);
    }
  });
});

describe("reuse ratio", () => {
  it("rung 1 slots leave the denominator and print as skipped", () => {
    const r = check(screen(["| a | 1 | skip | the page already shows it |", "| b | 3 | Table/Basic | — |", "| c | 7 | ds-new: Gauge/Radial | no gauge |"]));
    expect(r.code).toBe(0);
    expect(r.data.screens[0]).toMatchObject({ reuse: 1, total: 2, skipped: 1 });
    const t = capture(["reuse-plan", "check", r.file, "--dir", PROJECT]).out;
    expect(t).toContain("reuse: 1/2");
    expect(t).toContain("1 skipped");
  });

  it("a plan whose only slots are skipped prints 0/0 and 1 skipped", () => {
    const r = check(screen(["| a | 1 | skip | the page already shows it |"]));
    expect(r.data.screens[0]).toMatchObject({ reuse: 0, total: 0, skipped: 1 });
  });
});

describe("planFile helper sanity", () => {
  it("writes distinct files", () => { expect(planFile("a")).not.toBe(planFile("a")); });
});
