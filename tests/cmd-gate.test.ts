/**
 * `ui gate` — the composed floor judge. The load-bearing property is that every
 * family knob can INDIVIDUALLY turn the gate red: a gate one family cannot fail
 * through is the 3-of-4 hole this command exists to end. One dirty fixture per
 * family, a clean fixture that stays green, declared skips, and the envelope.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
    expect(Object.keys(d.families).sort()).toEqual(["a11y", "autofix", "content", "layout", "taste", "tell"]);
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

describe("ui gate — --tokens must fail loud", () => {
  it("an unreadable --tokens path is an error, never a silently weaker gate", () => {
    const r = capture(["gate", write("tok.html", BASE), "--tokens", join(dir, "absent.json"), "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("TOKENS_NOT_READABLE");
  });
});

describe("ui gate coverage — the registry triage routes on", () => {
  it("lists every catalog check with per-project activity (raw-hex inactive without tokens)", () => {
    const r = capture(["gate", "coverage", "--dir", dir, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data;
    expect(d.checks.length).toBeGreaterThanOrEqual(80);
    const rawHex = d.checks.find((c: { id: string }) => c.id === "raw-hex-when-token-exists");
    expect(rawHex.active).toBe(false);
    expect(d.project.tokensPresent).toBe(false);
    expect(Object.keys(d.families).sort()).toEqual(["a11y", "autofix", "content", "layout", "taste", "tell"]);
  });

  it("a project with a token file activates the tokens-gated check", () => {
    mkdirSync(join(dir, "design"), { recursive: true });
    writeFileSync(join(dir, "design", "design.tokens.json"), JSON.stringify({ color: { brand: { $type: "color", $value: "#123456" } } }));
    const r = capture(["gate", "coverage", "--dir", dir, "--json"]);
    const d = JSON.parse(r.out).data;
    expect(d.project.tokensPresent).toBe(true);
    expect(d.checks.find((c: { id: string }) => c.id === "raw-hex-when-token-exists").active).toBe(true);
  });
});

describe("FloorFinding schema v1 — reference checks carry repair fields", () => {
  it("input-unlabeled declares expected/fixHint/repairScope nodes", () => {
    const bad = BASE.replace("<h1>Alpha</h1>", '<h1>Alpha</h1><input type="email">');
    const r = capture(["gate", write("schema-a11y.html", bad), "--json"]);
    const f = JSON.parse(r.out).data.families.a11y.findings.find((x: { checkId: string }) => x.checkId === "input-unlabeled");
    expect(f.expected).toBeTruthy();
    expect(f.fixHint).toBeTruthy();
    expect(f.repairScope).toBe("nodes");
    expect(f.nodeRef).toContain("input");
  });
  it("sticky-hover-unguarded and data-numbers-not-tabular declare global repairScope pointing at their autofixers", () => {
    const bad = BASE.replace("</head>", "<style>.b:hover{color:red}</style></head>")
      .replace("</main>", "<table><tr><td>1,204</td></tr><tr><td>982</td></tr><tr><td>1,410</td></tr></table></main>");
    const r = capture(["gate", write("schema-global.html", bad), "--json"]);
    const d = JSON.parse(r.out).data;
    const hover = d.families.layout.findings.find((x: { checkId: string }) => x.checkId === "sticky-hover-unguarded");
    const tab = d.families.taste.findings.find((x: { checkId: string }) => x.checkId === "data-numbers-not-tabular");
    expect(hover.repairScope).toBe("global");
    expect(hover.fixHint).toContain("autofix");
    expect(tab.repairScope).toBe("global");
  });
  it("equal-nested-radii carries expected/actual for the concentric formula", () => {
    const bad = BASE.replace("<h1>Alpha</h1>", '<div class="rounded-xl p-4"><div class="rounded-xl">x</div></div><h1>Alpha</h1>');
    const r = capture(["gate", write("schema-radii.html", bad), "--json"]);
    const f = JSON.parse(r.out).data.families.taste.findings.find((x: { checkId: string }) => x.checkId === "equal-nested-radii");
    expect(f.expected).toContain("outer = inner + padding");
    expect(f.actual).toContain("rounded-xl");
    expect(f.repairScope).toBe("nodes");
  });
});

describe("nodeRef stability — the stuck detector's identity contract", () => {
  it("the identity tuple is invariant under an unrelated edit ABOVE the node", () => {
    const before = BASE.replace("<h1>Alpha</h1>", '<h1>Alpha</h1><input type="email">');
    const after = BASE.replace("<h1>Alpha</h1>", '<h1>Alpha</h1><p>an unrelated paragraph</p><input type="email">');
    const ref = (html: string): string => {
      const r = capture(["gate", write(`stable-${html.length}.html`, html), "--json"]);
      return JSON.parse(r.out).data.families.a11y.findings.find((x: { checkId: string }) => x.checkId === "input-unlabeled").nodeRef;
    };
    expect(ref(before)).toBe(ref(after));
  });
  it("two distinct unlabeled controls never share one identity", () => {
    const bad = BASE.replace("<h1>Alpha</h1>", '<h1>Alpha</h1><input type="email"><input type="text">');
    const r = capture(["gate", write("two-inputs.html", bad), "--json"]);
    const refs = JSON.parse(r.out).data.families.a11y.findings
      .filter((x: { checkId: string }) => x.checkId === "input-unlabeled")
      .map((x: { nodeRef: string }) => x.nodeRef);
    expect(refs).toHaveLength(2);
    expect(new Set(refs).size).toBe(2);
  });
});
