/**
 * `ui reuse-plan check` — each finding, at the CLI seam, with the plan text that provokes it.
 * Every check has a positive control (the valid form passes) next to its negative.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";

const FIX = fileURLToPath(new URL("./fixtures/reuse-plan/", import.meta.url));
const PROJECT = join(FIX, "project");
const FLAT = join(FIX, "project-flat");

interface Finding { code: string; line: number; screen: string | null; slot: string | null; message: string }
interface Screen { name: string; line: number; pattern: string | null; reuse: number; total: number; skipped: number }
interface Data { ok: boolean; screens: Screen[]; dsNew: { name: string; reason: string; screen: string; slot: string; line: number }[]; findings: Finding[] }

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = ""; let err = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out, err };
}

let scratch: string;
let n = 0;
beforeAll(() => { scratch = mkdtempSync(join(tmpdir(), "reuse-plan-")); });

function planFile(text: string): string {
  const p = join(scratch, `plan-${++n}.md`);
  writeFileSync(p, text, "utf8");
  return p;
}

/** Run `check` on `text` against `dir`; returns exit code + parsed data. */
function check(text: string, dir = PROJECT): { code: number; data: Data; file: string } {
  const file = planFile(text);
  const r = capture(["reuse-plan", "check", file, "--dir", dir, "--json"]);
  const env = JSON.parse(r.out) as { ok: boolean; data?: Data };
  return { code: r.code, data: env.data as Data, file };
}

const codes = (d: Data): string[] => d.findings.map((f) => f.code);

/** A one-screen plan around the given rows (table body lines). */
function screen(rows: string[], pattern = "Pattern/ListPage"): string {
  return [
    "## Screen: S", pattern === "" ? "" : `Pattern: ${pattern}`, "",
    "| Slot | Rung | Use | Reason |", "|---|---|---|---|", ...rows, "",
  ].join("\n");
}

describe("valid plan", () => {
  it("exit 0, no findings, per-screen reuse ratio and the ds-new list", () => {
    const r = check(screen([
      "| header | 3 | Page header/Default | — |",
      "| list | 5 | Filter bar/Default + Table/Basic | — |",
      "| status | 4 | Chip/Status (Tone=Info) | — |",
      "| gutter | 6 | spacing.4, colors.surface | — |",
      "| owner chip | 7 | ds-new: Owner chip | no email chip in registry |",
    ]));
    expect(r.code).toBe(0);
    expect(r.data.ok).toBe(true);
    expect(r.data.findings).toEqual([]);
    expect(r.data.screens[0]).toMatchObject({ name: "S", reuse: 4, total: 5, pattern: "Pattern/ListPage" });
    expect(r.data.dsNew).toEqual([expect.objectContaining({ name: "Owner chip", reason: "no email chip in registry", screen: "S", slot: "owner chip" })]);
  });

  it("text mode prints reuse: N/M per screen and the ds-new items", () => {
    const file = planFile(screen(["| header | 3 | Page header/Default | — |", "| chip | 7 | ds-new: Owner chip | no chip |"]));
    const r = capture(["reuse-plan", "check", file, "--dir", PROJECT]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("reuse: 1/2");
    expect(r.out).toMatch(/ds-new: Owner chip/);
    expect(r.out).toContain("no chip");
  });

  it("is deterministic: two runs print identical bytes", () => {
    const file = planFile(screen(["| a | 3 | Table/Basik | — |", "| b | 3 | Nope/Nope | — |", "| c | 9 | x | — |"]));
    const a = capture(["reuse-plan", "check", file, "--dir", PROJECT]);
    const b = capture(["reuse-plan", "check", file, "--dir", PROJECT]);
    expect(a.out).toBe(b.out);
    expect(a.err).toBe(b.err);
    expect(a.code).toBe(1);
  });
});

describe("UNKNOWN_COMPONENT (rungs 2-5) with did-you-mean", () => {
  it("rung 3 near-miss names the closest registered component and the file:line", () => {
    const r = check(screen(["| list | 3 | Table/Basik | — |"]));
    expect(r.code).toBe(1);
    const f = r.data.findings.find((x) => x.code === "UNKNOWN_COMPONENT");
    expect(f).toBeDefined();
    expect(f?.line).toBe(6);
    expect(f?.screen).toBe("S");
    expect(f?.slot).toBe("list");
    expect(f?.message).toContain("did you mean 'Table/Basic'");
    const text = capture(["reuse-plan", "check", r.file, "--dir", PROJECT]).out;
    expect(text).toContain(`UNKNOWN_COMPONENT ${r.file}:6`);
  });

  it("a name far from everything gets no suggestion, still a finding", () => {
    const f = check(screen(["| x | 3 | Totally unrelated widget name | — |"])).data.findings[0];
    expect(f?.code).toBe("UNKNOWN_COMPONENT");
    expect(f?.message).not.toContain("did you mean");
  });

  it("rung 2 unknown", () => {
    expect(codes(check(screen(["| x | 2 | Pattern/ListPag | — |"])).data)).toContain("UNKNOWN_COMPONENT");
  });

  it("rung 5 flags each unknown member and only those", () => {
    const d = check(screen(["| list | 5 | Filter bar/Default + Table/Basik + Card/Sumary | — |"])).data;
    const msgs = d.findings.filter((f) => f.code === "UNKNOWN_COMPONENT").map((f) => f.message);
    expect(msgs).toHaveLength(2);
    expect(msgs.join("\n")).toContain("Table/Basik");
    expect(msgs.join("\n")).toContain("Card/Sumary");
    expect(msgs.join("\n")).not.toContain("'Filter bar/Default' is not");
  });

  it("rung 4 resolves the name without the (Axis=Value) tail", () => {
    expect(check(screen(["| s | 4 | Chip/Status (Tone=Info) | — |"])).code).toBe(0);
    const d = check(screen(["| s | 4 | Chip/Statu (Tone=Info) | — |"])).data;
    expect(codes(d)).toEqual(["UNKNOWN_COMPONENT"]);
    expect(d.findings[0]?.message).toContain("did you mean 'Chip/Status'");
  });

  it("rung 4 without an (Axis=Value) is BAD_VARIANT; rung 5 with one name is BAD_COMPOSITION", () => {
    expect(codes(check(screen(["| s | 4 | Chip/Status | — |"])).data)).toEqual(["BAD_VARIANT"]);
    expect(codes(check(screen(["| s | 5 | Table/Basic | — |"])).data)).toEqual(["BAD_COMPOSITION"]);
    expect(codes(check(screen(["| s | 5 | Table/Basic + | — |"])).data)).toEqual(["BAD_COMPOSITION"]);
  });

  it("a slot with a finding is not counted as reuse", () => {
    const d = check(screen(["| a | 3 | Table/Basic | — |", "| b | 3 | Table/Basik | — |"])).data;
    expect(d.screens[0]).toMatchObject({ reuse: 1, total: 2 });
  });

  it("an empty Use is EMPTY_USE at rungs 2-6", () => {
    for (const rung of [2, 3, 4, 5, 6]) {
      expect(codes(check(screen([`| s | ${rung} |  | — |`])).data), `rung ${rung}`).toEqual(["EMPTY_USE"]);
    }
  });
});

describe("rung 7 — ds-new:", () => {
  it("NEW_MISSING_PREFIX when a rung-7 name lacks ds-new:", () => {
    expect(codes(check(screen(["| s | 7 | Owner chip | no chip in registry |"])).data)).toEqual(["NEW_MISSING_PREFIX"]);
  });

  it("NEW_WITHOUT_REASON for an empty, dash-only or whitespace reason", () => {
    for (const reason of ["", "—", "-", "–", "   "]) {
      expect(codes(check(screen([`| s | 7 | ds-new: Owner chip | ${reason} |`])).data), JSON.stringify(reason)).toEqual(["NEW_WITHOUT_REASON"]);
    }
  });

  it("NEW_WITHOUT_NAME for a bare ds-new:", () => {
    expect(codes(check(screen(["| s | 7 | ds-new: | why |"])).data)).toEqual(["NEW_WITHOUT_NAME"]);
  });

  it("NOT_NEW when the ds-new name IS registered — exact and normalised (case, spacing)", () => {
    for (const name of ["Chip/Status", "chip/status", "Chip/Status  "]) {
      const d = check(screen([`| s | 7 | ds-new: ${name} | thought it was missing |`])).data;
      expect(codes(d), name).toEqual(["NOT_NEW"]);
      expect(d.findings[0]?.message).toContain("rung 3");
    }
  });

  it("ds-new: at rungs 2-6 is NEW_AT_WRONG_RUNG", () => {
    expect(codes(check(screen(["| s | 3 | ds-new: Owner chip | x |"])).data)).toEqual(["NEW_AT_WRONG_RUNG"]);
  });

  it("a ds-new item with a defect is still listed for the owner only when it is well formed", () => {
    const d = check(screen(["| a | 7 | ds-new: Owner chip | — |", "| b | 7 | ds-new: Tag | needed |"])).data;
    expect(d.dsNew.map((x) => x.name)).toEqual(["Tag"]);
  });
});

describe("Pattern line", () => {
  it("MISSING_PATTERN when the screen has none, reported on the Screen heading line", () => {
    const d = check(screen(["| s | 3 | Table/Basic | — |"], "")).data;
    expect(codes(d)).toEqual(["MISSING_PATTERN"]);
    expect(d.findings[0]?.line).toBe(1);
  });

  it("MISSING_PATTERN when the Pattern value is empty", () => {
    expect(codes(check(screen(["| s | 3 | Table/Basic | — |"], " ")).data)).toEqual(["MISSING_PATTERN"]);
  });

  it("none needs a reason; none — reason passes and shows in the screen summary", () => {
    expect(codes(check(screen(["| s | 3 | Table/Basic | — |"], "none")).data)).toEqual(["PATTERN_NONE_NO_REASON"]);
    expect(codes(check(screen(["| s | 3 | Table/Basic | — |"], "none —")).data)).toEqual(["PATTERN_NONE_NO_REASON"]);
    const ok = check(screen(["| s | 3 | Table/Basic | — |"], "none — one-off wizard step"));
    expect(ok.code).toBe(0);
    expect(ok.data.screens[0]?.pattern).toBeNull();
  });

  it("UNKNOWN_PATTERN for an unregistered name, with did-you-mean", () => {
    const d = check(screen(["| s | 3 | Table/Basic | — |"], "Pattern/ListPag")).data;
    expect(codes(d)).toEqual(["UNKNOWN_PATTERN"]);
    expect(d.findings[0]?.message).toContain("did you mean 'Pattern/ListPage'");
  });

  it("PATTERN_NOT_TEMPLATE: a registry that declares Pattern/* needs one of them (or none — reason)", () => {
    expect(codes(check(screen(["| s | 3 | Table/Basic | — |"], "Table/Dense")).data)).toEqual(["PATTERN_NOT_TEMPLATE"]);
  });

  it("a registry with no Pattern/* names accepts any registered name as the template", () => {
    const text = screen(["| s | 3 | Table / Row | — |"], "Page content / Orders · List");
    const r = check(text, FLAT);
    expect(r.code).toBe(0);
    expect(r.data.screens[0]?.pattern).toBe("Page content / Orders · List");
    expect(codes(check(screen(["| s | 3 | Table / Row | — |"], "Page content / Nope"), FLAT).data)).toEqual(["UNKNOWN_PATTERN"]);
  });

  it("a trailing explanation after an em dash does not break the name", () => {
    expect(check(screen(["| s | 3 | Table/Basic | — |"], "Pattern/ListPage — list screens")).code).toBe(0);
  });
});

describe("structure findings", () => {
  it("EMPTY_SCREEN: a screen with no slot rows, even with a Pattern line", () => {
    const d = check("## Screen: Empty\nPattern: Pattern/ListPage\n\n| Slot | Rung | Use | Reason |\n|---|---|---|---|\n").data;
    expect(codes(d)).toEqual(["EMPTY_SCREEN"]);
    expect(d.screens[0]).toMatchObject({ reuse: 0, total: 0 });
  });

  it("EMPTY_PLAN: empty file, whitespace only, and prose without a Screen section", () => {
    for (const text of ["", "   \n\n\t\n", "# Plan\n\nWe will reuse things.\n"]) {
      const r = check(text);
      expect(r.code, JSON.stringify(text)).toBe(1);
      expect(codes(r.data)).toEqual(["EMPTY_PLAN"]);
    }
  });

  it("ROW_OUTSIDE_SCREEN: slot rows before any Screen heading", () => {
    const d = check("| Slot | Rung | Use | Reason |\n|---|---|---|---|\n| a | 3 | Table/Basic | — |\n\n" + screen(["| b | 3 | Table/Basic | — |"])).data;
    expect(codes(d)).toEqual(["ROW_OUTSIDE_SCREEN"]);
    expect(d.findings[0]?.line).toBe(3);
  });

  it("BAD_RUNG for 0, 8, text and empty — and the slot is not counted as reuse", () => {
    for (const rung of ["0", "8", "x", "", "3.5", "-1"]) {
      const d = check(screen([`| s | ${rung} | Table/Basic | — |`])).data;
      expect(codes(d), JSON.stringify(rung)).toEqual(["BAD_RUNG"]);
      expect(d.screens[0]).toMatchObject({ reuse: 0, total: 1 });
    }
  });

  it("BAD_ROW for a row that does not have four cells", () => {
    expect(codes(check(screen(["| s | 3 | Table/Basic |"])).data)).toEqual(["BAD_ROW"]);
    expect(codes(check(screen(["| s | 3 | Table/Basic | — | extra |"])).data)).toEqual(["BAD_ROW"]);
  });

  it("rung 1 (skip) needs a reason and counts as skipped, not as reuse", () => {
    const bad = check(screen(["| s | 1 | skip | — |", "| t | 3 | Table/Basic | — |"])).data;
    expect(codes(bad)).toEqual(["SKIP_WITHOUT_REASON"]);
    const ok = check(screen(["| s | 1 | skip | the page already shows this | ", "| t | 3 | Table/Basic | — |"]));
    expect(ok.code).toBe(0);
    expect(ok.data.screens[0]).toMatchObject({ reuse: 1, total: 1, skipped: 1 });
  });

  it("findings come out in file order", () => {
    const d = check(screen(["| a | 9 | x | — |", "| b | 3 | Nope | — |", "| c | 7 | Oops | y |"], "")).data;
    const lines = d.findings.map((f) => f.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(codes(d)).toEqual(["MISSING_PATTERN", "BAD_RUNG", "UNKNOWN_COMPONENT", "NEW_MISSING_PREFIX"]);
  });
});

describe("rung 6 — tokens", () => {
  it("UNRESOLVED_TOKEN for a path not in the DS tokens; resolving paths pass", () => {
    expect(check(screen(["| g | 6 | spacing.4, colors.brand | — |"])).code).toBe(0);
    const d = check(screen(["| g | 6 | spacing.4, spacing.99 | — |"])).data;
    expect(codes(d)).toEqual(["UNRESOLVED_TOKEN"]);
    expect(d.findings[0]?.message).toContain("spacing.99");
  });

  it("no token file at all is an UNRESOLVED_TOKEN finding that says so — never a silent pass", () => {
    const d = check(screen(["| g | 6 | spacing.4 | — |"], "Page content / Orders · List"), FLAT).data;
    expect(codes(d)).toEqual(["UNRESOLVED_TOKEN"]);
    expect(d.findings[0]?.message).toMatch(/no design tokens|tokens file/i);
  });

  it("a rung-6 Use that holds no path (only separators) is EMPTY_USE", () => {
    expect(codes(check(screen(["| g | 6 | , , | — |"])).data)).toEqual(["EMPTY_USE"]);
  });

  it("a plan without rung 6 never needs a token file", () => {
    expect(check(screen(["| s | 3 | Table / Row | — |"], "Page content / Orders · List"), FLAT).code).toBe(0);
  });
});
