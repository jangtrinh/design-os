/**
 * Review-round repros for build.mjs / validate.mjs: each describe was proven RED against the previous
 * implementation before the fix and is GREEN after it.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BROKEN_DIR, DIST_CLI, REPO_ROOT, SKILL_DIR, build, buildRun, cleanTemps, copySkill, hasBuiltBinary, htmlPage, lines, makeProject,
  makeTemp, node, validate, verdictLines, writeFile,
} from "./helpers/designer-skill-harness.js";

afterAll(cleanTemps);
const example = (name: string): string => join(SKILL_DIR, "examples", name);

function buildPage(html: string, extra: Record<string, string | Buffer> = {}, name = "page.html"): string {
  const dir = makeTemp();
  writeFile(dir, name, html);
  for (const [rel, data] of Object.entries(extra)) writeFile(dir, rel, data);
  const run = buildRun(["--target", join(dir, name), "--out", join(makeTemp(), "ev")]);
  expect(run.status, run.stderr).toBe(0);
  return run.stdout.trim();
}

describe.skipIf(!hasBuiltBinary)("project design system is graded explicitly", () => {
  it("rejects an in-project page below the token-coverage floor even from the default evidence folder", () => {
    const project = makeProject();
    const page = writeFile(project, "pages/low.html", readFileSync(example("incident-board.html")));
    const native = JSON.parse(node(DIST_CLI, ["gate", page, "--json"]).stdout).data as { tokenCoverage?: { overall: { coverage: number } } };
    expect(native.tokenCoverage?.overall.coverage ?? 1, "premise: the in-project gate sees the DS and fails the page").toBeLessThan(0.8);

    const built = buildRun(["--target", page], project);
    expect(built.status, built.stderr).toBe(0);
    const evidence = built.stdout.trim();
    expect(evidence).toContain(join(".design-os", "evidence", "designer"));
    const run = validate(evidence);
    expect(run.status).toBe(1);
    expect(lines(run.stdout).some((l) => /^gate: token-coverage \d+% is below the 80% floor/.test(l)), run.stdout).toBe(true);
  });

  it("says out loud that token coverage did not run when no design system is found", () => {
    const evidence = buildPage(htmlPage());
    const run = validate(evidence);
    expect(run.status).toBe(0);
    expect(verdictLines(run.stdout)).toEqual(["ok"]);
    expect(run.stdout).toMatch(/^note: gate: token-coverage did not run — no design system found from /m);
  });

  it("build records the project the page belongs to, and --project overrides the walk", () => {
    const project = makeProject();
    const page = writeFile(project, "a/b/page.html", htmlPage());
    const run = buildRun(["--target", page, "--out", join(makeTemp(), "ev")]);
    const manifest = JSON.parse(readFileSync(join(run.stdout.trim(), "manifest.json"), "utf8")) as { project: { tokens: string } | null };
    expect(manifest.project?.tokens.endsWith(join("design", "design.tokens.json"))).toBe(true);
    const elsewhere = writeFile(makeTemp(), "page.html", htmlPage());
    const forced = buildRun(["--target", elsewhere, "--project", project, "--out", join(makeTemp(), "ev")]);
    expect(forced.status, forced.stderr).toBe(0);
    expect((JSON.parse(readFileSync(join(forced.stdout.trim(), "manifest.json"), "utf8")) as { project: unknown }).project).not.toBeNull();
  });
});

describe.skipIf(!hasBuiltBinary)("external-request reads the whole document", () => {
  const external = (run: { stdout: string }): string[] => lines(run.stdout).filter((l) => l.startsWith("external-request:"));

  it("catches a multi-line tag, an unquoted value and an alternate stylesheet", () => {
    const cases: [string, string, RegExp][] = [
      ["multi-line script", '<script\n  defer\n  src="https://cdn.example.test/a.js"\n></script>', /^external-request: page\.html:\d+ <script> loads https:\/\/cdn\.example\.test\/a\.js/],
      ["unquoted src", "<video controls src=https://media.example.test/v.mp4></video>", /^external-request: page\.html:\d+ <video> loads https:\/\/media\.example\.test\/v\.mp4/],
      ["alternate stylesheet", '<link rel="alternate stylesheet" title="x" href="https://css.example.test/alt.css">', /^external-request: page\.html:\d+ <link> loads https:\/\/css\.example\.test\/alt\.css/],
      ["preload", '<link rel=preload as=font href=//fonts.example.test/f.woff2>', /^external-request: page\.html:\d+ <link> loads \/\/fonts\.example\.test\/f\.woff2/],
    ];
    for (const [label, markup, pattern] of cases) {
      const found = external(validate(buildPage(htmlPage(markup.startsWith("<link") ? markup : "", markup.startsWith("<link") ? undefined : markup))));
      expect({ label, count: found.length }).toEqual({ label, count: 1 });
      expect(found[0], label).toMatch(pattern);
    }
  });

  it("does not flag data-src, a commented-out tag, a plain remote link or a canonical link", () => {
    const body = '<iframe data-src="https://x.example.test/lazy" title="Deferred sample frame"></iframe>\n<div data-src="https://x.example.test/a.png" data-href="https://x.example.test/b"></div>\n<!-- <script src="https://x.example.test/c.js"></script> -->\n<p><a href="https://example.test/docs">Read the docs</a></p>';
    const run = validate(buildPage(htmlPage('<link rel="canonical" href="https://example.test/page">', body)));
    expect(external(run)).toEqual([]);
    expect(run.status, run.stdout).toBe(0);
  });
});

describe.skipIf(!hasBuiltBinary)("local references", () => {
  it("decodes a URL-encoded ref, copies the file and validates ok", () => {
    const evidence = buildPage(htmlPage("", '<img src="my%20photo.png" alt="A sample photograph" width="40" height="40">'), { "my photo.png": Buffer.from("not-a-real-png") });
    const manifest = JSON.parse(readFileSync(join(evidence, "manifest.json"), "utf8")) as { files: { path: string }[] };
    expect(manifest.files.map((f) => f.path)).toEqual(["my photo.png", "page.html"]);
    expect(lines(validate(evidence).stdout).filter((l) => l.startsWith("missing-local-ref:"))).toEqual([]);
  });

  it("reports a local ref that resolves to nothing as missing-local-ref with file, line and the ref as written", () => {
    const html = htmlPage('<link rel="stylesheet" href="missing%20styles.css">', "");
    const run = validate(buildPage(html));
    expect(run.status).toBe(1);
    const found = lines(run.stdout).filter((l) => l.startsWith("missing-local-ref:"));
    expect(found).toEqual(["missing-local-ref: page.html:7 missing%20styles.css — add the file next to the page or fix the path"]);
  });
});

describe.skipIf(!hasBuiltBinary)("contract is also compared with the installed ui", () => {
  it("refuses an edited contract whose header was recomputed", () => {
    const copy = copySkill();
    const body = readFileSync(join(copy, "contract.md"), "utf8").split("\n").slice(1).join("\n").replace("Flags not listed here do not exist.", "Every flag is allowed.");
    writeFileSync(join(copy, "contract.md"), `<!-- sha256: ${createHash("sha256").update(body).digest("hex")} -->\n${body}`);
    // Evidence is built by the edited copy, so its own header and manifest agree: only the comparison with `ui` can object.
    const run = validate(build(example("pricing-page.html"), copy), copy);
    expect(run.status).toBe(1);
    expect(verdictLines(run.stdout)).toEqual(["contract: contract.md differs from what the installed ui generates (stale or edited) — reinstall ease-design to restore the shipped copy"]);
  });

  it("tolerates a UTF-8 BOM at the start of the contract", () => {
    const copy = copySkill();
    const evidence = build(example("pricing-page.html"), copy);
    writeFileSync(join(copy, "contract.md"), "\uFEFF" + readFileSync(join(copy, "contract.md"), "utf8"));
    const run = validate(evidence, copy);
    expect({ status: run.status, out: verdictLines(run.stdout) }).toEqual({ status: 0, out: ["ok"] });
  });
});

describe.skipIf(!hasBuiltBinary)("build never writes into the skill folder", () => {
  it("refuses --out inside the skill folder and a default that would resolve inside it", () => {
    const copy = copySkill();
    const before = readdirSync(copy).sort();
    const explicit = buildRun(["--target", example("pricing-page.html"), "--out", join(copy, "ev")], undefined, copy);
    expect(explicit.status).toBe(1);
    expect(explicit.stderr).toMatch(/^output: .* is inside the skill folder/);
    const fallback = buildRun(["--target", example("pricing-page.html")], copy, copy);
    expect(fallback.status).toBe(1);
    expect(fallback.stderr).toMatch(/^output: .* is inside the skill folder/);
    expect(readdirSync(copy).sort()).toEqual(before);
    expect(existsSync(join(copy, ".design-os"))).toBe(false);
  });
});

describe.skipIf(!hasBuiltBinary)("validate keeps every result visible", () => {
  it("prints gate warnings and still ends with ok", () => {
    const evidence = buildPage(readFileSync(join(REPO_ROOT, "tests", "fixtures", "designer-skill", "warning-only.html"), "utf8"));
    const run = validate(evidence);
    expect(run.status).toBe(0);
    const out = lines(run.stdout);
    expect(out[0]).toMatch(/^warn: gate: content\/bare-confirm-button page\.html:\d+ — /);
    expect(out[out.length - 1]).toBe("ok");
  });

  it("when ui cannot run, still prints the mechanical failures found (exit 1), else exits 2", () => {
    const copy = copySkill();
    const env = { PATH: makeTemp(), DESIGN_OS_UI: "" };
    const tampered = buildPage(htmlPage());
    writeFileSync(join(tampered, "site", "page.html"), readFileSync(join(tampered, "site", "page.html"), "utf8") + "\n<!-- edit -->\n");
    const a = node(join(copy, "validate.mjs"), ["--evidence", tampered], env);
    expect(a.status).toBe(1);
    expect(verdictLines(a.stdout)).toEqual(["artifact-hashes: page.html changed after build — edit the source and rebuild"]);
    expect(a.stderr).toMatch(/runtime: could not run — `ui` binary not found/);

    const clean = buildPage(htmlPage());
    const b = node(join(copy, "validate.mjs"), ["--evidence", clean], env);
    expect(b.status).toBe(2);
    expect(b.stdout).toBe("");
  });

  it("keeps the broken fixtures producing exactly one line", () => {
    const run = validate(buildPage(readFileSync(join(BROKEN_DIR, "gate-missing-title.html"), "utf8")));
    expect(verdictLines(run.stdout)).toHaveLength(1);
  });
});
