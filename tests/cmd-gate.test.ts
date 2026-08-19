/**
 * `ui gate` — the composed floor judge. The load-bearing property is that every
 * family knob can INDIVIDUALLY turn the gate red: a gate one family cannot fail
 * through is the 3-of-4 hole this command exists to end. One dirty fixture per
 * family, a clean fixture that stays green, declared skips, and the envelope.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  process.stderr.write = () => true;
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

let dir: string;
const write = (name: string, contents: string): string => {
  const p = join(dir, name);
  writeFileSync(p, contents, "utf8");
  return p;
};
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ease-gate-")); });

/** Clean under every family INCLUDING the autofix dry-run (viewport present, no imgs, no dup ids). */
const CLEAN = (body: string): string =>
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Gate</title></head>' +
  `<body><main>${body}</main></body></html>`;

const BASE = CLEAN("<h1>Alpha</h1><p>Welcome back. Everything is ready.</p>");

describe("ui gate — every family knob turns it red individually", () => {
  it("clean document → exit 0, PASS, every family clean", () => {
    const r = capture(["gate", write("clean.html", BASE), "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data;
    expect(d.pass).toBe(true);
    expect(Object.keys(d.families).sort()).toEqual(["a11y", "autofix", "content", "layout", "taste"]);
    expect(d.errorCount).toBe(0);
  });

  it("layout knob: an unclosed structural tag fails the gate", () => {
    const bad = BASE.replace("</main>", ""); // main never closes
    const r = capture(["gate", write("layout.html", bad), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.families.layout.errorCount).toBeGreaterThan(0);
  });

  it("a11y knob: a positive tabindex fails the gate", () => {
    const bad = BASE.replace("<h1>Alpha</h1>", '<h1>Alpha</h1><div tabindex="3">x</div>');
    const r = capture(["gate", write("a11y.html", bad), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.families.a11y.errorCount).toBeGreaterThan(0);
  });

  it("taste knob: transition: all fails the gate", () => {
    const bad = BASE.replace("</head>", "<style>.x { transition: all .3s ease-out; }</style></head>");
    const r = capture(["gate", write("taste.html", bad), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.families.taste.errorCount).toBeGreaterThan(0);
  });

  it("content knob: lorem ipsum fails the gate", () => {
    const bad = BASE.replace("Everything is ready.", "Lorem ipsum dolor sit amet.");
    const r = capture(["gate", write("content.html", bad), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).data.families.content.errorCount).toBeGreaterThan(0);
  });

  it("autofix knob: a pending repair (duplicate ids) fails the gate as autofix-not-clean", () => {
    const bad = BASE.replace("<h1>Alpha</h1>", '<h1 id="t">Alpha</h1><p id="t">dup</p>');
    const r = capture(["gate", write("autofix.html", bad), "--json"]);
    expect(r.code).toBe(1);
    const fam = JSON.parse(r.out).data.families.autofix;
    expect(fam.findings[0]?.checkId).toBe("autofix-not-clean");
    expect(fam.findings[0]?.message).toContain("duplicate-ids");
  });
});

describe("ui gate — declared skips", () => {
  it("a skipped family cannot fail the gate, and the skip is reported with its reason", () => {
    const bad = BASE.replace("Everything is ready.", "Lorem ipsum dolor sit amet.");
    const r = capture(["gate", write("skip.html", bad), "--skip", "content: mirror evidence", "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data;
    expect(d.families.content).toBeUndefined();
    expect(d.skipped).toEqual(["content: mirror evidence"]);
  });

  it("a skip without a reason is refused (silent partial gating is the failure mode)", () => {
    const r = capture(["gate", write("noreason.html", BASE), "--skip", "content", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("an unknown family is refused", () => {
    const r = capture(["gate", write("badfam.html", BASE), "--skip", "vibes: nope", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });
});

describe("ui gate — text mode and file errors", () => {
  it("text mode prints per-family lines and PASS on clean", () => {
    const r = capture(["gate", write("t.html", BASE)]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("PASS");
    expect(r.out).toContain("layout: clean");
    expect(r.out).toContain("autofix: clean");
  });
  it("missing file → FILE_NOT_FOUND", () => {
    const r = capture(["gate", join(dir, "absent.html"), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("FILE_NOT_FOUND");
  });
});
