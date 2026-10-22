/**
 * Second review round for build.mjs / validate.mjs: defects introduced by the first hardening pass. Each
 * test was RED against the previous commit and is GREEN now; the break-probes live in the commit notes.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
  DIST_CLI, SKILL_DIR, buildRun, ciIsOn, cleanTemps, failureLines, hasBuiltBinary, htmlPage, lines, makeProject, makeTemp, node,
  validate, writeFile,
} from "./helpers/designer-skill-harness.js";

afterAll(cleanTemps);

/** Build `html` (plus sibling files) into a fresh evidence folder. */
function buildPage(html: string, extra: Record<string, string | Buffer> = {}, name = "page.html"): string {
  const dir = makeTemp();
  writeFile(dir, name, html);
  for (const [rel, data] of Object.entries(extra)) writeFile(dir, rel, data);
  const run = buildRun(["--target", join(dir, name), "--out", join(makeTemp(), "ev"), "--project", makeTemp()]);
  expect(run.status, run.stderr).toBe(0);
  return run.stdout.trim();
}

describe.skipIf(!hasBuiltBinary)("a recorded token file that ui cannot read", () => {
  const TOKENS_WITHOUT_COLOURS = '{"space":{"s1":{"$type":"dimension","$value":"4px"}}}';

  function projectWithUnusableTokens(): { project: string; tokens: string; evidence: string } {
    const project = makeTemp("designer-brand-");
    mkdirSync(join(project, ".git"));
    const tokens = writeFile(project, "brand/design/design.tokens.json", TOKENS_WITHOUT_COLOURS);
    const page = writeFile(project, "pages/p.html", htmlPage());
    const built = buildRun(["--target", page], project);
    expect(built.status, built.stderr).toBe(0);
    return { project, tokens, evidence: built.stdout.trim() };
  }

  it("falls back to ui's own discovery and says so on stdout", () => {
    const { tokens, evidence } = projectWithUnusableTokens();
    const run = validate(evidence);
    expect(run.status, run.stdout + run.stderr).toBe(0);
    const out = lines(run.stdout);
    expect(out[0]?.startsWith(`note: gate: recorded tokens ${tokens} unusable (TOKENS_NOT_READABLE: `)).toBe(true);
    expect(out[0]).toMatch(/holds no color tokens\).* — graded with ui's own discovery$/);
    expect(out[out.length - 1]).toBe("ok");
  });

  it("keeps a user-passed --tokens that ui refuses as a visible failure carrying ui's own message", () => {
    const { tokens, evidence } = projectWithUnusableTokens();
    const run = validate(evidence, SKILL_DIR, ["--tokens", tokens]);
    expect(run.status).toBe(1);
    expect(failureLines(run.stdout)).toHaveLength(1);
    expect(run.stdout).toMatch(/^gate: ui refused the tokens file \(TOKENS_NOT_READABLE\): --tokens '.*' is not a readable token file/m);
  });
});

describe.skipIf(!hasBuiltBinary)("notes stay on stdout", () => {
  it("prints the no-design-system note before ok", () => {
    const run = validate(buildPage(htmlPage()));
    expect(run.status).toBe(0);
    const out = lines(run.stdout);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^note: gate: token-coverage did not run — no design system found from /);
    expect(out[1]).toBe("ok");
  });
});

describe.skipIf(!hasBuiltBinary)("references: comments, srcset, entities, templates", () => {
  const missing = (stdout: string): string[] => lines(stdout).filter((l) => l.startsWith("missing-local-ref:"));

  it("ignores references inside CSS comments (linked sheet and style attribute) and keeps later line numbers right", () => {
    const html = htmlPage('<link rel="stylesheet" href="s.css">', '<div style="/* url(gone.png) */ color: inherit">x</div>');
    const css = "/* old: background: url(legacy/bg.png);\n   more: url(other.png) */\nbody { margin: 0; background: url(real-missing.png); }\n";
    const run = validate(buildPage(html, { "s.css": css }));
    expect(missing(run.stdout)).toEqual(["missing-local-ref: s.css:3 real-missing.png — add the file next to the page or fix the path"]);
  });

  it("splits srcset like the HTML spec: a data: URI with a comma is one candidate; no-space commas split", () => {
    const body = '<img src="a.png" srcset="data:image/png;base64,iVBORw0KGgo= 1x, a.png 2x" alt="A sample" width="10" height="10">\n<img src="a.png" srcset="a.png 1x,b.png 2x" alt="A sample" width="10" height="10">';
    const run = validate(buildPage(htmlPage("", body), { "a.png": "x" }));
    expect(missing(run.stdout)).toEqual(["missing-local-ref: page.html:17 b.png — add the file next to the page or fix the path"]);
  });

  it("decodes HTML entities in attribute values before resolving: a&amp;b.png and a&#x26;c.png are found and copied", () => {
    const body = '<img src="a&amp;b.png" alt="One" width="10" height="10"><img src="a&#x26;c.png" alt="Two" width="10" height="10"><img src="gone&amp;x.png" alt="Three" width="10" height="10">';
    const evidence = buildPage(htmlPage("", body), { "a&b.png": "x", "a&c.png": "y" });
    const manifest = JSON.parse(readFileSync(join(evidence, "manifest.json"), "utf8")) as { files: { path: string }[] };
    expect(manifest.files.map((f) => f.path)).toEqual(["a&b.png", "a&c.png", "page.html"]);
    expect(missing(validate(evidence).stdout)).toEqual(["missing-local-ref: page.html:16 gone&x.png — add the file next to the page or fix the path"]);
  });

  it("treats <template> contents as inert: no external-request for a remote image inside one", () => {
    const run = validate(buildPage(htmlPage("", '<template><script src="https://x.example.test/t.js"></script></template>')));
    expect(lines(run.stdout).filter((l) => l.startsWith("external-request:"))).toEqual([]);
    expect(run.status, run.stdout).toBe(0);
  });
});

describe.skipIf(!hasBuiltBinary)("project discovery matches ui's own", () => {
  const TOKENS = '{"color":{"ink":{"$type":"color","$value":"#112233"}}}';

  /** What the recorded project is for a page, asked of the skill's own shared helper in a subprocess. */
  function ours(startDir: string): { tokens: string } | null {
    const code = `import(${JSON.stringify(join(SKILL_DIR, "shared.mjs"))}).then((m) => console.log(JSON.stringify(m.findProject(${JSON.stringify(startDir)}))));`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
    return JSON.parse(run.stdout) as { tokens: string } | null;
  }

  /** Whether `ui` finds a design system for a page: token-coverage auto-detects exactly like the gate does. */
  const nativeFinds = (page: string): boolean => (JSON.parse(node(DIST_CLI, ["token-coverage", page, "--json"]).stdout) as { ok: boolean }).ok;

  const layouts: [string, () => string][] = [
    ["design system two levels up", () => { const p = makeProject(); return writeFile(p, "pages/x/p.html", htmlPage()); }],
    ["brand tokens only", () => { const p = makeTemp(); writeFile(p, "brand/design/design.tokens.json", TOKENS); return writeFile(p, "pages/p.html", htmlPage()); }],
    ["design system and brand tokens both", () => { const p = makeProject(); writeFile(p, "brand/design/design.tokens.json", TOKENS); return writeFile(p, "pages/p.html", htmlPage()); }],
    ["a kit boundary between the page and an outer design system", () => { const p = makeProject(); writeFile(p, "kit/kit.lock.json", "{}"); return writeFile(p, "kit/p.html", htmlPage()); }],
    ["an inner repository root between the page and an outer design system", () => { const p = makeProject(); mkdirSync(join(p, "inner", ".git"), { recursive: true }); return writeFile(p, "inner/pages/p.html", htmlPage()); }],
    ["a page deeper than the five-level walk", () => { const p = makeProject(); return writeFile(p, "a/b/c/d/e/f/p.html", htmlPage()); }],
    ["no design system at all", () => writeFile(makeTemp(), "p.html", htmlPage())],
  ];

  for (const [label, make] of layouts) {
    it(`agrees with ui on: ${label}`, () => {
      const page = make();
      const dir = page.slice(0, page.lastIndexOf("/"));
      expect({ label, skill: ours(dir) !== null }).toEqual({ label, skill: nativeFinds(page) });
    });
  }

  it("records the design-system tokens, not the brand ones, when both exist", () => {
    const p = makeProject();
    writeFile(p, "brand/design/design.tokens.json", TOKENS);
    expect(ours(join(p, "pages"))?.tokens).toBe(join(p, "design", "design.tokens.json"));
  });
});

describe("the CI flag", () => {
  it("is on only for a real value", () => {
    expect(["1", "true", "TRUE", "yes", "github"].map(ciIsOn)).toEqual([true, true, true, true, true]);
    expect([undefined, "", "0", "false", "False", " 0 "].map(ciIsOn)).toEqual([false, false, false, false, false, false]);
  });
});
