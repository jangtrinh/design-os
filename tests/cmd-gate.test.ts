/**
 * `ui gate` — the composed floor judge. The load-bearing property is that every
 * family knob can INDIVIDUALLY turn the gate red: a gate one family cannot fail
 * through is the 3-of-4 hole this command exists to end. One dirty fixture per
 * family, a clean fixture that stays green, declared skips, and the envelope.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";
import { GATE_FAMILIES } from "../src/core/gate.js";
import { GATE_HELP } from "../src/commands/gate.js";

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

describe("the help text lists every family the gate actually runs", () => {
  /**
   * `tell` shipped inside `ui gate` while `ui gate --help` still listed five families.
   * The gate ran six; a reader of the help had no way to know the sixth existed. Caught
   * by smoking a fresh clone before a release tag, not by any test — so this is the test.
   *
   * Derived from GATE_FAMILIES rather than hand-listed, for the same reason the README
   * check counts are derived from CHECK_CATALOG: a hand-kept copy of a list drifts from
   * the list, and the drift is silent.
   */
  it("names each of GATE_FAMILIES in the help output", () => {
    const missing = GATE_FAMILIES.filter((f) => !new RegExp(`^\\s+${f}\\s`, "m").test(GATE_HELP));
    expect(missing, `families that run but are undocumented in \`ui gate --help\``).toEqual([]);
  });

  it("does not advertise a family the gate cannot run", () => {
    // The other direction: a family deleted from the runner but left in the help would
    // promise a check that never happens, which is worse than an undocumented one.
    const advertised = [...GATE_HELP.matchAll(/^ {2}([a-z0-9-]+) {2,}(?:ui |DRY-RUN)/gm)].map((m) => m[1] as string);
    expect(advertised.length).toBeGreaterThan(0);
    expect(advertised.filter((f) => !(GATE_FAMILIES as readonly string[]).includes(f))).toEqual([]);
  });
});

describe("ui gate — token-coverage required check (PR-TG, A2)", () => {
  it("auto-detected token file + all-raw-hex CSS → token-coverage fails the gate", () => {
    mkdirSync(join(dir, "brand", "design"), { recursive: true });
    writeFileSync(join(dir, "brand", "design", "design.tokens.json"), JSON.stringify({
      color: { primary: { $value: "#3b82f6", $type: "color" } },
    }), "utf8");
    const bad = CLEAN('<style>.card { color: #ff0000; background: #00ff00; padding: 4px; }</style><h1>Alpha</h1><p>Welcome back. Everything is ready.</p>');
    const r = capture(["gate", write("tc.html", bad), "--json"]);
    const d = JSON.parse(r.out).data as { pass: boolean; tokenCoverage: { overall: { coverage: number } } };
    expect(d.tokenCoverage.overall.coverage).toBeLessThan(0.8);
    expect(d.pass).toBe(false);
    expect(r.code).toBe(1);
  });

  it("no token file anywhere on the walk → token-coverage does not run, gate unaffected", () => {
    const r = capture(["gate", write("no-tokens.html", BASE), "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { tokenCoverage: unknown; pass: boolean };
    expect(d.tokenCoverage).toBeUndefined();
    expect(d.pass).toBe(true);
  });
});

describe("ui gate — --tokens grades coverage against THAT file (PR-FU3-r2 A5)", () => {
  it("a page styled entirely with a custom token file scores >= 0.8 with --tokens and < 0.8 without", () => {
    // The auto-detected token file the gate would grade against absent --tokens.
    mkdirSync(join(dir, "brand", "design"), { recursive: true });
    writeFileSync(join(dir, "brand", "design", "design.tokens.json"), JSON.stringify({
      color: { primary: { $type: "color", $value: "#111111" } },
    }), "utf8");
    // A different, project-specific token file the page actually styles with.
    const customTokens = join(dir, "custom.tokens.json");
    writeFileSync(customTokens, JSON.stringify({
      color: { accent: { $type: "color", $value: "#ff00ff" } },
    }), "utf8");
    const file = write("custom-styled.html", CLEAN(
      '<style>.card { color: #ff00ff; background: #ff00ff; }</style><h1>Alpha</h1><p>Welcome back. Everything is ready.</p>',
    ));

    const withoutTokens = JSON.parse(capture(["gate", file, "--json"]).out).data as {
      tokenCoverage: { overall: { coverage: number } };
    };
    const withTokens = JSON.parse(capture(["gate", file, "--tokens", customTokens, "--json"]).out).data as {
      tokenCoverage: { overall: { coverage: number } };
    };

    expect(withTokens.tokenCoverage.overall.coverage).toBeGreaterThanOrEqual(0.8);
    expect(withoutTokens.tokenCoverage.overall.coverage).toBeLessThan(0.8);
  });

  it("a bad --tokens value still fails loud on the coverage path, not just the raw-hex path", () => {
    // A file that reads as JSON with a color hex (so loadTokenHexes succeeds)
    // but fails DTCG token-shape validation (so scoreTokenCoverage must throw).
    const badTokens = join(dir, "bad.tokens.json");
    writeFileSync(badTokens, JSON.stringify({ color: { primary: "#123456" } }), "utf8");
    const r = capture(["gate", write("bad-tok.html", BASE), "--tokens", badTokens, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("TOKENS_NOT_READABLE");
  });
});

describe("ui gate — --family applies a persona's gate_policy (PR-FU3-r2 A8)", () => {
  const HAIRLINE_SHADOW_PAGE = CLEAN(
    '<style>.card { border: 1px solid #ccc; box-shadow: 0 2px 24px rgba(0,0,0,0.12); }</style>' +
    '<div class="card"><h1>Alpha</h1><p>Welcome back. Everything is ready.</p></div>',
  );

  it("without --family, gpt-thin-border-wide-shadow stays advisory (default) and the gate passes", () => {
    const r = capture(["gate", write("no-family.html", HAIRLINE_SHADOW_PAGE), "--json"]);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).data.pass).toBe(true);
  });

  it("--family <hairline slug> upgrades gpt-thin-border-wide-shadow to error and fails the gate", () => {
    const families = JSON.parse(readFileSync(join(process.cwd(), "knowledge", "personas", "families.json"), "utf8")) as {
      families: Array<{ slug: string; gate_policy?: Record<string, string> }>;
    };
    const hairline = families.families.find((f) => f.gate_policy?.["gpt-thin-border-wide-shadow"] === "error");
    expect(hairline).toBeDefined();

    const r = capture(["gate", write("family.html", HAIRLINE_SHADOW_PAGE), "--family", hairline!.slug, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { pass: boolean; families: { tell: { errorCount: number; findings: Array<{ checkId: string; severity: string }> } } };
    expect(d.pass).toBe(false);
    const finding = d.families.tell.findings.find((f) => f.checkId === "gpt-thin-border-wide-shadow");
    expect(finding?.severity).toBe("error");
  });

  it("unknown --family slug is FAMILY_NOT_FOUND, never a silent no-op", () => {
    const r = capture(["gate", write("unknown-family.html", BASE), "--family", "not-a-real-slug", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("FAMILY_NOT_FOUND");
  });
});

describe("ui gate — --family legitimizes the family's own accent for ai-color-palette (PR-FU5b A1)", () => {
  // #735acc is web-serif-display-plus-sans's real declared accent
  // (knowledge/personas/families.json starting_tokens.tokens.color.accent.$value).
  const PURPLE_ACCENT_PAGE = CLEAN(
    '<style>.hero { background: #735acc; }</style>' +
    '<div class="hero"><h1>Alpha</h1><p>Welcome back. Everything is ready.</p></div>',
  );

  interface Findings { checkId: string; severity: string; message: string }
  interface Tell { findings: Findings[] }
  interface GateData { families: { tell?: Tell } }

  const familySlug = "web-serif-display-plus-sans";

  it("without --family, ai-color-palette alarms on the family's own accent", () => {
    const r = capture(["gate", write("no-family-accent.html", PURPLE_ACCENT_PAGE), "--json"]);
    const d = JSON.parse(r.out).data as GateData;
    const f = d.families.tell?.findings.find((x) => x.checkId === "ai-color-palette");
    expect(f?.message).toMatch(/most recognisable palette tell/);
  });

  it("--family <slug> reports the SAME hex as the family's own accent instead", () => {
    const r = capture(["gate", write("family-accent.html", PURPLE_ACCENT_PAGE), "--family", familySlug, "--json"]);
    const d = JSON.parse(r.out).data as GateData;
    const f = d.families.tell?.findings.find((x) => x.checkId === "ai-color-palette");
    expect(f?.message).toContain(`family accent (${familySlug})`);
    expect(f?.message).not.toMatch(/most recognisable palette tell/);
    // Legitimacy never turns into an ERROR — it stays the rule's own advisory severity.
    expect(f?.severity).toBe("advisory");
  });

  it("a DIFFERENT family's slug (no matching hue) still alarms on the same page", () => {
    const families = JSON.parse(readFileSync(join(process.cwd(), "knowledge", "personas", "families.json"), "utf8")) as {
      families: Array<{ slug: string; starting_tokens?: { tokens?: { color?: { accent?: { $value?: unknown } } } } }>;
    };
    // Any family whose accent isn't near #735acc's ~290° hue (or that declares none).
    const other = families.families.find((f) => f.slug !== familySlug);
    expect(other).toBeDefined();
    const r = capture(["gate", write("other-family-accent.html", PURPLE_ACCENT_PAGE), "--family", other!.slug, "--json"]);
    const d = JSON.parse(r.out).data as GateData;
    const f = d.families.tell?.findings.find((x) => x.checkId === "ai-color-palette");
    expect(f?.message).toMatch(/most recognisable palette tell/);
  });
});
