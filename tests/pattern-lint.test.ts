import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../src/cli.js";

const fixture = join(process.cwd(), "tests", "fixtures", "pattern", "valid-card.json");
type Entry = { value: string; count: number };
type Card = {
  n: number; status: string; n_below_floor?: boolean; evidence: string[]; notes: string; unreliable?: string[];
  core: { layout: Entry[]; density: Entry[] };
  components: Array<{ name: string; count: number; kind?: Entry[]; position?: Entry[] }>;
};

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const oldOut = process.stdout.write.bind(process.stdout);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (chunk: any) => { out += String(chunk); return true; };
  try { return { code: run(args), out }; }
  finally { process.stdout.write = oldOut; }
}

function edited(edit: (card: Card) => void, name = "pricing.json"): string {
  const dir = join(mkdtempSync(join(tmpdir(), "pattern-lint-")), "web");
  mkdirSync(dir);
  const card = JSON.parse(readFileSync(fixture, "utf8")) as Card;
  edit(card);
  writeFileSync(join(dir, name), JSON.stringify(card));
  return join(dir, name);
}

const checkIds = (file: string): string[] => {
  const { out } = capture(["pattern", "lint", file, "--json"]);
  const env = JSON.parse(out) as { data: { files: Array<{ findings: Array<{ checkId: string }> }> } };
  return env.data.files.flatMap((f) => f.findings.map((x) => x.checkId));
};

describe("ui pattern lint", () => {
  it("accepts a valid card (positive control)", () => {
    expect(capture(["pattern", "lint", fixture]).code).toBe(0);
  });

  // C1 negative controls
  it("rejects a share larger than n", () => {
    const file = edited((c) => { c.core.layout[0]!.count = 9; });
    expect(capture(["pattern", "lint", file]).code).toBe(1);
    expect(checkIds(file)).toContain("share-over-n");
  });

  it("rejects a duplicate evidence id", () => {
    const file = edited((c) => { c.evidence[1] = c.evidence[0]!; });
    expect(capture(["pattern", "lint", file]).code).toBe(1);
    expect(checkIds(file)).toContain("evidence-duplicate");
  });

  it("rejects n = 7 without n_below_floor", () => {
    const file = edited((c) => { c.n = 7; c.evidence.pop(); });
    expect(capture(["pattern", "lint", file]).code).toBe(1);
    expect(checkIds(file)).toContain("n-below-floor");
  });

  // Extra guards, each broken independently
  it("accepts n = 6 only as a draft flagged n_below_floor", () => {
    const draft = edited((c) => { c.n = 6; c.evidence.length = 6; c.status = "draft"; c.n_below_floor = true;
      c.core.layout = [{ value: "modal-dialog", count: 6 }]; c.core.density = [{ value: "comfortable", count: 6 }];
      c.components = [{ name: "plan-cards", count: 6 }]; c.unreliable = [];
      Object.assign(c.core, { navigation: [{ value: "topnav", count: 6 }], primary_action: [{ value: "text-link", count: 6 }],
        states: [{ value: "none", count: 6 }], color_mode: [{ value: "light", count: 6 }], copy_language: [{ value: "en", count: 6 }] }); });
    expect(capture(["pattern", "lint", draft]).code).toBe(0);
    const published = edited((c) => { c.n = 6; c.evidence.length = 6; c.n_below_floor = true; c.core.layout = []; c.components = []; });
    expect(checkIds(published)).toContain("draft-required");
  });

  it("rejects a flag claiming below-floor on a full-size card", () => {
    expect(checkIds(edited((c) => { c.n_below_floor = true; }))).toContain("n-below-floor");
  });

  it("rejects evidence count that disagrees with n", () => {
    expect(checkIds(edited((c) => { c.evidence.pop(); }))).toContain("evidence-count");
  });

  it("rejects a component breakdown larger than its component count", () => {
    const file = edited((c) => { c.components[1]!.kind![0]!.count = 7; });
    expect(checkIds(file)).toContain("share-over-component");
  });

  it("rejects a single-valued distribution that sums above n", () => {
    const file = edited((c) => { c.core.density = [{ value: "comfortable", count: 5 }, { value: "compact", count: 5 }]; });
    expect(checkIds(file)).toContain("share-over-n");
  });

  it("rejects an image path or URL anywhere in the card", () => {
    for (const leak of ["see 003.webp", "https://mobbin.com/api/mcp/short/abc", "/Users/x/img/1.png"]) {
      expect(checkIds(edited((c) => { c.notes = leak; }))).toContain("image-reference");
    }
  });

  it("rejects an unknown component name and a dangling unreliable path", () => {
    expect(capture(["pattern", "lint", edited((c) => { c.components[0]!.name = "carousel-of-doom"; })]).code).toBe(1);
    expect(checkIds(edited((c) => { c.unreliable = ["components.plan-cards.position"]; }))).toContain("unreliable-path");
    expect(checkIds(edited((c) => { c.unreliable = ["components.plan-cards", "components.billing-toggle.position", "core.layout"]; }))).not.toContain("unreliable-path");
  });

  it("rejects duplicated values, duplicated components, negative counts and impossible cross-check rows", () => {
    expect(checkIds(edited((c) => { c.core.layout = [{ value: "modal-dialog", count: 1 }, { value: "modal-dialog", count: 1 }]; }))).toContain("distribution-duplicate");
    expect(checkIds(edited((c) => { c.components[1]!.name = "plan-cards"; }))).toContain("component-duplicate");
    expect(checkIds(edited((c) => { c.core.layout[1]!.count = -1; }))).toContain("share-negative");
    expect(checkIds(edited((c) => { (c as unknown as { attempted: number }).attempted = 7; }))).toContain("attempted-below-n");
    const crossed = edited((c) => { Object.assign(c, { extraction: { model: "m", cross_check: { model: "x", images: 10,
      agreement: [{ attribute: "core.layout", agree: 11, of: 10 }] } } }); });
    expect(checkIds(crossed)).toContain("cross-check-range");
  });

  it("rejects a card whose file name disagrees with its archetype", () => {
    expect(checkIds(edited(() => undefined, "checkout.json"))).toContain("path-mismatch");
  });

  it("lints a directory recursively and fails on any bad card", () => {
    const good = edited(() => undefined);
    const dir = join(good, "..", "..");
    expect(capture(["pattern", "lint", dir]).code).toBe(0);
    writeFileSync(join(dir, "web", "checkout.json"), JSON.stringify({ schema: "pattern-card/1" }));
    expect(capture(["pattern", "lint", dir, "--json"]).code).toBe(1);
  });

  it("reports missing and unparseable input with distinct codes", () => {
    expect(capture(["pattern", "lint", join(tmpdir(), "no-such-card.json"), "--json"]).out).toContain("FILE_NOT_FOUND");
    const bad = join(mkdtempSync(join(tmpdir(), "pattern-lint-")), "bad.json");
    writeFileSync(bad, "{nope");
    expect(capture(["pattern", "lint", bad, "--json"]).out).toContain("BAD_JSON");
  });
});
