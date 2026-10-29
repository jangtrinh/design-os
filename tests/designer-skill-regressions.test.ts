/**
 * One test per defect the design-os-designer skill has already shipped and been reviewed for. Each test names the
 * defect it pins in a comment and asserts the behaviour that would regress; each was proven RED once by reverting
 * its guard (the reverts are recorded in the change notes). Browser tests skip where look cannot run.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BROKEN_DIR, DIST_CLI, REPO_ROOT, SKILL_DIR, build, buildRun, ciIsOn, cleanTemps, copySkill, failureLines, forbiddenHits, hasBuiltBinary,
  htmlPage, lines, lookAvailable, lookIsolated, makeProject, makeTemp, node, nodeAsync, readJson, stage, validate, verdictLines, writeFile,
} from "./helpers/designer-skill-harness.js";

afterAll(cleanTemps);
let available = false;
beforeAll(() => { available = lookAvailable(); }, 120000);

const examplePath = (name: string): string => join(SKILL_DIR, "examples", name);
/** With an unreadable project token file the ds-usage family has nothing to judge against; ui says so, in its own words. */
const DS_USAGE_SKIPPED_UNREADABLE = "note: gate: SKIPPED ds-usage: the project's token file is unreadable (see token-coverage/tokens-not-readable), so there is nothing to judge against";
const look = (evidence: string, extra: string[] = []) =>
  node(join(SKILL_DIR, "look.mjs"), ["--evidence", evidence, "--sheet", join(makeTemp(), "s.png"), "--widths", "375", ...extra]);
const l3 = (stdout: string): string => lines(stdout).find((l) => l.startsWith("L3 console-and-network @375")) ?? "";
const l4 = (stdout: string): string => lines(stdout).find((l) => l.startsWith("L4 broken-images @375")) ?? "";
const manifestPaths = (evidence: string): string[] => (readJson(join(evidence, "manifest.json")) as { files: { path: string }[] }).files.map((f) => f.path);

/** Build a page folder (html plus sibling files) into evidence graded in an empty project. */
function buildPage(html: string, extra: Record<string, string | Buffer> = {}): string {
  const dir = makeTemp();
  writeFile(dir, "page.html", html);
  for (const [rel, data] of Object.entries(extra)) writeFile(dir, rel, data);
  return build(join(dir, "page.html"));
}

/** Build `page` from inside `project` with the default evidence folder, deep inside that project. */
function buildInProject(project: string, page: string): string {
  const built = buildRun(["--target", page], project);
  expect(built.status, built.stderr).toBe(0);
  return built.stdout.trim();
}

describe.skipIf(!hasBuiltBinary)("regressions: hardening of build, validate and look", { timeout: 120000 }, () => {
  it("validate rejects a page the project's own gate rejects, even from the default evidence folder (design-system depth)", () => {
    const project = makeProject();
    const page = writeFile(project, "pages/low.html", readFileSync(examplePath("incident-board.html")));
    const native = JSON.parse(node(DIST_CLI, ["gate", page, "--json"]).stdout).data as { tokenCoverage?: { overall: { coverage: number } } };
    expect(native.tokenCoverage?.overall.coverage ?? 1, "premise: the in-project gate sees the design system and fails the page").toBeLessThan(0.8);
    const evidence = buildInProject(project, page);
    expect(evidence).toContain(join(".design-os", "evidence", "designer"));
    const run = validate(evidence);
    expect(run.status).toBe(1);
    expect(lines(run.stdout).some((l) => /^gate: token-coverage \d+% is below the 80% floor/.test(l)), run.stdout).toBe(true);
  });

  it("look closes every WebSocket: the server never sees an upgrade and L3 names the socket (websocket leak)", async (ctx) => {
    if (!available) ctx.skip();
    let upgrades = 0;
    const server = createServer();
    server.on("upgrade", (_req, socket) => { upgrades++; socket.destroy(); });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    try {
      const port = (server.address() as AddressInfo).port;
      const evidence = buildPage(htmlPage("", `<script>var s = new WebSocket("ws://127.0.0.1:${port}/live"); s.onerror = function () {};</script>`));
      // Asynchronous on purpose: a blocking spawn would starve this server's event loop.
      const run = await nodeAsync(join(SKILL_DIR, "look.mjs"), ["--evidence", evidence, "--sheet", join(makeTemp(), "s.png"), "--widths", "375"]);
      expect(upgrades, "a WebSocket upgrade reached the local server").toBe(0);
      expect(run.status).toBe(1);
      expect(l3(run.stdout)).toMatch(new RegExp(`blocked websocket ws://127\\.0\\.0\\.1:${port}/live`));
    } finally {
      server.close();
    }
  });

  it("look sees a broken lazy image far below the fold (lazy images missed)", (ctx) => {
    if (!available) ctx.skip();
    const html = htmlPage("", '<div style="height:4000px"></div><img loading="lazy" src="missing-bottom.png" alt="A sample" width="100" height="100">');
    const run = look(buildPage(html));
    expect(run.status).toBe(1);
    expect(l4(run.stdout)).toMatch(/1 broken — missing-bottom\.png FAIL — /);
  });

  it("look names a remote load however the tag is written: multi-line, unquoted, alternate stylesheet (reference grammar cases)", (ctx) => {
    if (!available) ctx.skip();
    const cases: [string, string, string, string][] = [
      ["multi-line script", "", '<script\n  defer\n  src="https://cdn.example.test/a.js"\n></script>', "https://cdn.example.test/a.js"],
      ["unquoted video src", "", "<video controls src=https://media.example.test/v.mp4></video>", "https://media.example.test/v.mp4"],
      ["alternate stylesheet", '<link rel="alternate stylesheet" title="x" href="https://css.example.test/alt.css">', "", "https://css.example.test/alt.css"],
    ];
    for (const [label, head, body, url] of cases) {
      const run = look(buildPage(htmlPage(head, body || undefined)));
      expect({ label, line: l3(run.stdout) }).toEqual({ label, line: expect.stringContaining(`blocked request ${url}`) });
    }
  });

  it("build copies a URL-encoded reference's file because it copies the page folder (URL-encoded refs dropped)", () => {
    const evidence = buildPage(htmlPage("", '<img src="my%20photo.png" alt="A sample photograph" width="40" height="40" onerror="this.hidden=true">'), { "my photo.png": Buffer.from("not-a-real-png") });
    expect(manifestPaths(evidence)).toEqual(["my photo.png", "page.html"]);
    expect({ status: validate(evidence).status }).toEqual({ status: 0 });
  });

  it("validate refuses an edited contract whose header was recomputed (edited contract passed after rehash)", () => {
    const copy = copySkill();
    const body = readFileSync(join(copy, "contract.md"), "utf8").split("\n").slice(1).join("\n").replace("Flags not listed here do not exist.", "Every flag is allowed.");
    writeFileSync(join(copy, "contract.md"), `<!-- sha256: ${createHash("sha256").update(body).digest("hex")} -->\n${body}`);
    // Evidence is built by the edited copy, so its own header and manifest agree: only the comparison with `ui` can object.
    const run = validate(build(examplePath("pricing-page.html"), copy), copy);
    expect(run.status).toBe(1);
    expect(verdictLines(run.stdout)).toEqual(["contract: contract.md differs from what the installed ui generates (stale or edited) — reinstall ease-design to restore the shipped copy"]);
  });

  it("build never writes into the skill folder, with --out or by default (build wrote into skill folder)", () => {
    const copy = copySkill();
    const before = readdirSync(copy).sort();
    const explicit = buildRun(["--target", examplePath("pricing-page.html"), "--out", join(copy, "ev")], undefined, copy);
    expect(explicit.status).toBe(1);
    expect(explicit.stderr).toMatch(/^output: .* is inside the skill folder/);
    const fallback = buildRun(["--target", examplePath("pricing-page.html")], copy, copy);
    expect(fallback.status).toBe(1);
    expect(fallback.stderr).toMatch(/^output: .* is inside the skill folder/);
    expect(readdirSync(copy).sort()).toEqual(before);
    expect(existsSync(join(copy, ".design-os"))).toBe(false);
  });

  it("the package ships only the designer skill folder, not the whole skills tree (npm files too broad)", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { files: string[] };
    expect(pkg.files).toContain("skills/design-os-designer");
    expect(pkg.files).not.toContain("skills");
  });

  it("the ban list flags the model and tool names it once missed and leaves the skill's own words alone (ban-list holes)", () => {
    for (const planted of ["use o3 for review", "o4-mini scouts", "GPT 5 builds", "gemini 2.5 pro critiques", "Claude 4 reviews", "delegate to agy", "run JEV on it", "Laya MLX", "ask Astra"]) {
      expect(forbiddenHits(planted), planted).not.toEqual([]);
    }
    expect(forbiddenHits("fresh subagent, the `explorer` role, a pro-level page, Gemini CLI, Claude Code, L1 overflow, step 3 of 4")).toEqual([]);
    for (const name of ["SKILL.md", "rules.md", "look.md", "concepts.md"]) expect({ name, hits: forbiddenHits(readFileSync(join(SKILL_DIR, name), "utf8")) }).toEqual({ name, hits: [] });
  });

  it("validate prints gate warnings before ok, and CI counts as on only for a real value (validate hid results, CI look skip)", () => {
    const evidence = build(stage(join(REPO_ROOT, "tests", "fixtures", "designer-skill", "warning-only.html")));
    const run = validate(evidence);
    expect(run.status).toBe(0);
    const out = lines(run.stdout);
    expect(out[0]).toMatch(/^warn: gate: content\/bare-confirm-button warning-only\.html:\d+ — /);
    expect(out[out.length - 1]).toBe("ok");
    expect(["1", "true", "TRUE", "yes", "github"].map(ciIsOn)).toEqual([true, true, true, true, true]);
    expect([undefined, "", "0", "false", "False", " 0 "].map(ciIsOn)).toEqual([false, false, false, false, false, false]);
  });
});

describe.skipIf(!hasBuiltBinary)("regressions: bounded look and project discovery", { timeout: 120000 }, () => {
  it("look stops on a page that grows without end on every run, says UNVERIFIED and leaves no browser (look hang on growing page)", async (ctx) => {
    if (!available) ctx.skip();
    for (let attempt = 0; attempt < 3; attempt++) {
      const { run, leftovers } = await lookIsolated(join(BROKEN_DIR, "look-growing-page.html"), ["--deadline", "30000"]);
      expect(run.status, run.stdout + run.stderr).toBe(1);
      expect(l4(run.stdout)).toMatch(/UNVERIFIED: page kept growing.* FAIL — /);
      expect(leftovers).toEqual([]);
    }
  });

  it("a project token file with no colour tokens is scored by ui, never refused or swapped for another file (unusable recorded tokens)", () => {
    const project = makeTemp("designer-brand-");
    mkdirSync(join(project, ".git"));
    writeFile(project, "brand/design/design.tokens.json", '{"space":{"s1":{"$type":"dimension","$value":"4px"}}}');
    const evidence = buildInProject(project, writeFile(project, "pages/p.html", htmlPage()));
    const run = validate(evidence);
    // ui scored the colourless file (the page declares colours it cannot match): the verdict is the floor line, not a refusal.
    expect({ status: run.status, out: verdictLines(run.stdout) }).toEqual({ status: 1, out: ["gate: token-coverage 0% is below the 80% floor — style with the project's tokens"] });
    expect(run.stdout).not.toMatch(/unreadable|unusable|refused|note:/);
  });

  it("a CSS comment or a srcset with commas never rejects a page; no script reads the markup (comment and srcset false rejects)", () => {
    const html = htmlPage('<link rel="stylesheet" href="s.css">',
      '<div style="/* url(gone.png) */ color: inherit">x</div>\n<img src="a.png" srcset="data:image/png;base64,iVBORw0KGgo= 1x, a.png 2x" alt="A sample" width="10" height="10" onerror="this.hidden=true">\n<img src="a.png" srcset="a.png 1x,b.png 2x" alt="A sample" width="10" height="10" onerror="this.hidden=true">');
    const css = "/* old: background: url(legacy/bg.png);\n   more: url(other.png) */\nbody { margin: 0; }\n";
    const run = validate(buildPage(html, { "s.css": css, "a.png": "x", "b.png": "y" }));
    expect({ status: run.status, failures: failureLines(run.stdout) }).toEqual({ status: 0, failures: [] });
  });

  it("an HTML entity in a reference is no problem: the file is simply in the copied folder (entities)", () => {
    const body = '<img src="a&amp;b.png" alt="One" width="10" height="10" onerror="this.hidden=true"><img src="a&#x26;c.png" alt="Two" width="10" height="10" onerror="this.hidden=true">';
    const evidence = buildPage(htmlPage("", body), { "a&b.png": "x", "a&c.png": "y" });
    expect(manifestPaths(evidence)).toEqual(["a&b.png", "a&c.png", "page.html"]);
    expect(validate(evidence).status).toBe(0);
  });

  it("a kit boundary decides the design system because ui owns discovery (kit.lock boundary)", () => {
    const project = makeProject();
    writeFile(project, "kit/kit.lock.json", "{}");
    const evidence = buildInProject(project, writeFile(project, "kit/p.html", htmlPage()));
    const run = validate(evidence);
    expect(run.status).toBe(1);
    const kitTokens = join(project, "kit", "design", "design.tokens.json");
    expect(lines(run.stdout)).toEqual([
      DS_USAGE_SKIPPED_UNREADABLE,
      `gate: token-coverage did not run — ${kitTokens} is unreadable (the token file is missing) — fix the project's token file`,
    ]);
  });
});

describe.skipIf(!hasBuiltBinary)("regressions: token-file provenance, assets and growth", { timeout: 120000 }, () => {
  it("missing or corrupt project tokens fail validate with the unreadable line, from the default evidence folder (missing tokens passed)", () => {
    for (const [label, damage] of [["missing", null], ["corrupt", "{ not json"]] as const) {
      const project = makeProject();
      const tokens = join(project, "design", "design.tokens.json");
      if (damage === null) rmSync(tokens);
      else writeFileSync(tokens, damage);
      const run = validate(buildInProject(project, writeFile(project, "pages/p.html", htmlPage())));
      expect({ label, status: run.status }).toEqual({ label, status: 1 });
      expect({ label, out: lines(run.stdout) }).toEqual({ label, out: [DS_USAGE_SKIPPED_UNREADABLE, expect.stringMatching(new RegExp(`^gate: token-coverage did not run — ${tokens.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} is unreadable \\(.+\\) — fix the project's token file$`))] });
    }
  });

  it("assets inside a template or shadow DOM are copied, and look names a remote request made from a shadow root (template and shadow DOM assets)", (ctx) => {
    const inert = '<template><img src="template-only.png" alt="Sample" width="10" height="10" onerror="this.hidden=true"></template>';
    const shadow = '<div><template shadowrootmode="open"><img src="shadow-only.png" alt="Sample" width="10" height="10" onerror="this.hidden=true"></template></div>';
    const evidence = buildPage(htmlPage("", `${inert}\n${shadow}`), { "template-only.png": "x", "shadow-only.png": "y" });
    expect(manifestPaths(evidence)).toEqual(["page.html", "shadow-only.png", "template-only.png"]);
    expect(validate(evidence).status).toBe(0);
    if (!available) ctx.skip();
    const remote = '<div><template shadowrootmode="open"><img src="https://img.example.test/remote.png" alt="Sample" width="10" height="10" onerror="this.hidden=true"></template></div>';
    expect(l3(look(buildPage(htmlPage("", remote))).stdout)).toContain("blocked request https://img.example.test/remote.png");
  });

  it("a finite lazy loader that grows the page once is not reported as growing, on three runs (growth check flakiness)", (ctx) => {
    if (!available) ctx.skip();
    const evidence = build(join(BROKEN_DIR, "look-lazy-finite-page.html"));
    for (let attempt = 0; attempt < 3; attempt++) {
      const run = look(evidence);
      expect({ attempt, status: run.status, l4: l4(run.stdout) }).toEqual({ attempt, status: 0, l4: expect.stringMatching(/ ok$/) });
    }
  });

  it("a user --tokens that ui refuses ends the gate verdict with that one line; the rerun shows the rest (missing user tokens hide findings, accepted)", () => {
    const missing = join(makeTemp(), "absent.tokens.json");
    const evidence = build(join(BROKEN_DIR, "gate-missing-title.html"));
    const refused = validate(evidence, SKILL_DIR, ["--tokens", missing]);
    expect(refused.status).toBe(1);
    expect(verdictLines(refused.stdout)).toHaveLength(1);
    expect(verdictLines(refused.stdout)[0]).toMatch(new RegExp(`^gate: ui refused --tokens ${missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(TOKENS_NOT_READABLE\\): .* — fix the path or drop the flag$`));
    expect(refused.stdout).not.toContain("document-title");
    const rerun = validate(evidence);
    expect(failureLines(rerun.stdout).join("\n")).toMatch(/^gate: a11y\/document-title /);
  });

  it("a CSS comment inside a string value builds and validates cleanly (comment inside strings)", () => {
    const head = '<style>.a::before { content: "/* not a comment url(gone.png) */"; }\n.b { color: #1b2a2f; }</style>';
    const run = validate(buildPage(htmlPage(head)));
    expect({ status: run.status, failures: failureLines(run.stdout) }).toEqual({ status: 0, failures: [] });
  });
});
