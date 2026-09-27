import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { FIX, capture, useTempDirs } from "./fixtures/knowledge-promotion/cli-capture.js";
import { validateRulingsFile } from "../src/core/rulings-validate.js";

const tmp = useTempDirs("knowledge-draft-");

const draft = (from: string, out: string, extra: string[] = []) =>
  capture(["knowledge", "draft-ruling", "--from", from, "--out", out, "--as-of", "2026-09-27", ...extra]);
const correctionFile = (over: Record<string, unknown>): string => {
  const base = JSON.parse(readFileSync(join(FIX, "correction.json"), "utf8"));
  const p = join(tmp(), "correction.json");
  writeFileSync(p, JSON.stringify({ ...base, ...over }), "utf8");
  return p;
};

describe("ui knowledge draft-ruling", () => {
  it("turns a correction into a draft stub that validates against the rulings schema", () => {
    const out = join(tmp(), "draft.json");
    const r = draft(join(FIX, "correction.json"), out);
    expect(r.code).toBe(0);
    const doc = JSON.parse(readFileSync(out, "utf8"));
    expect(validateRulingsFile(doc)).toEqual([]);
    expect(doc.rulings).toHaveLength(1);
    const ruling = doc.rulings[0];
    expect(ruling).toMatchObject({
      status: "draft", approved_by: [], since: "2026-09-27", category: "correction", verified_by: "unverified",
      text: "Show an inline empty state with the reason and one next action.",
      scope: { screens: ["Org Usage / Summary"] },
      source: ["figma-comment:approved-2026-09-27", "docs/alpha.md#one"],
    });
    expect(ruling.detail).toContain("Empty state showed a blank chart area");
    expect(ruling.id).toMatch(/^r-draft-org-usage-summary-[0-9a-f]{8}$/);
  });

  it("is deterministic: same correction, same file", () => {
    const a = join(tmp(), "a.json"); const b = join(tmp(), "b.json");
    draft(join(FIX, "correction.json"), a); draft(join(FIX, "correction.json"), b);
    expect(readFileSync(b, "utf8")).toBe(readFileSync(a, "utf8"));
  });

  it.each([
    ["screen", ""], ["what_was_wrong", undefined], ["what_is_right", 3], ["evidence", []], ["evidence", ["ok", ""]], ["evidence", "docs/a.md"],
  ])("rejects a correction with a bad %s (%j)", (key, value) => {
    const r = draft(correctionFile({ [key]: value }), join(tmp(), "d.json"), ["--json"]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("BAD_CORRECTION");
    expect(r.out).toContain(`'${key}'`);
  });

  it("refuses to overwrite an existing file unless --force", () => {
    const out = join(tmp(), "draft.json");
    expect(draft(join(FIX, "correction.json"), out).code).toBe(0);
    const again = draft(join(FIX, "correction.json"), out, ["--json"]);
    expect(again.code).toBe(1);
    expect(again.out).toContain("OUT_EXISTS");
    expect(draft(join(FIX, "correction.json"), out, ["--force"]).code).toBe(0);
  });

  it("rejects missing flags, unknown flags, unreadable input and a bad date", () => {
    const out = join(tmp(), "d.json");
    expect(capture(["knowledge", "draft-ruling", "--out", out, "--json"]).out).toContain("--from");
    expect(capture(["knowledge", "draft-ruling", "--from", join(FIX, "correction.json"), "--json"]).out).toContain("--out");
    expect(draft(join(FIX, "correction.json"), out, ["--nope", "1", "--json"]).out).toContain("UNKNOWN_FLAG");
    expect(draft(join(FIX, "missing.json"), out, ["--json"]).out).toContain("FILE_NOT_FOUND");
    expect(draft(join(FIX, "correction.json"), out, ["--as-of", "soon", "--json"]).out).toContain("BAD_AS_OF");
  });

  it("a draft flows through lint and render (status is part of the rulings contract)", () => {
    const out = join(tmp(), "draft.json");
    draft(join(FIX, "correction.json"), out);
    expect(capture(["knowledge", "lint", out, "--root", join(FIX, "root")]).code).toBe(0);
    const dir = tmp();
    expect(capture(["knowledge", "render", out, "--out", dir]).code).toBe(0);
    expect(readFileSync(join(dir, "rulings.en.md"), "utf8")).toContain("status: draft");
  });

  it("a draft is never promoted and never assessed for freshness", () => {
    const out = join(tmp(), "draft.json");
    draft(join(FIX, "correction.json"), out);
    const p = capture(["knowledge", "promote", out, "--ledger", join(FIX, "ledger-recurring.jsonl"), "--out", tmp(), "--min-sources", "1", "--json"]);
    expect(JSON.parse(p.out).data).toMatchObject({ candidates: 0, notLive: 1 });
    const f = capture(["knowledge", "fresh", out, "--json"]);
    expect(JSON.parse(f.out).data).toMatchObject({ summary: "fresh 0 / stale 0 / unanchored 0", notLive: 1 });
  });
});
