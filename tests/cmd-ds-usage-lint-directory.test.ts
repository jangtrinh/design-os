/**
 * `ui ds-usage-lint <file|dir>` — polyglot files and directory sweeps:
 * sorted deterministic walk, default exclusions, "scanned N of M files", and every skip reason.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";
import { MAX_UI_FILE_BYTES } from "../src/core/polyglot-ui-walk.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/oi-browser/", import.meta.url));
const TOKENS = join(FIXTURES, "tokens.json");

function capture(args: string[]): { code: number; out: string } {
  let out = "";
  const o = process.stdout.write.bind(process.stdout);
  const e = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { out += String(c); return true; };
  let code: number;
  try { code = run(args); } finally { process.stdout.write = o; process.stderr.write = e; }
  return { code, out };
}

let root: string;
const put = (rel: string, body: string): void => {
  const p = join(root, rel);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, body, "utf8");
};
beforeEach(() => { root = mkdtempSync(join(tmpdir(), "ease-ds-usage-dir-")); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

const BAD_FONT = "font-family: ui-monospace, Menlo, monospace";

interface Report {
  scanned: number; total: number; skipped: { path: string; reason: string }[];
  files: { file: string; findings: { checkId: string; line: number }[] }[];
  offSystemFontCount: number; errorCount: number;
}
const jsonRun = (target: string): { code: number; data: Report } => {
  const r = capture(["ds-usage-lint", target, "--tokens", TOKENS, "--json"]);
  return { code: r.code, data: JSON.parse(r.out).data as Report };
};

describe("ui ds-usage-lint <dir>", () => {
  it("walks UI sources in sorted order, skips the default directories by name, and counts scanned of total", () => {
    put("b.svelte", `<p>x</p>\n<style>\n.a { ${BAD_FONT}; }\n</style>`);
    put("a.html", `<style>\n.a { ${BAD_FONT}; }\n</style>`);
    put("z/deep.tsx", `export const A = () => <p className="font-mono">x</p>;`);
    put("ok.ts", `export const t = { fontFamily: "Inter, sans-serif" };`);
    put("notes.css", `.a { ${BAD_FONT}; }`); // not a UI source extension: neither scanned nor counted
    for (const d of ["node_modules/pkg", "dist", "build", ".git", "fixtures", "__fixtures__"]) put(`${d}/hidden.js`, `export const s = { fontFamily: "ui-monospace" };`);
    const { code, data } = jsonRun(root);
    expect(code).toBe(1);
    expect(data.scanned).toBe(4);
    expect(data.total).toBe(4); // excluded directories are never entered, so their files are not counted
    expect(data.files.map((f) => f.file)).toEqual(["a.html", "b.svelte", "z/deep.tsx"]);
    expect(data.offSystemFontCount).toBe(3);
    expect(data.skipped.map((s) => s.path).sort()).toEqual([".git/", "__fixtures__/", "build/", "dist/", "fixtures/", "node_modules/"]);
    expect(data.skipped.every((s) => /excluded directory/.test(s.reason))).toBe(true);
  });

  it("text report prints 'scanned N of M files', every skip reason and each finding with its line", () => {
    put("a.html", `<style>\n.a { ${BAD_FONT}; }\n</style>`);
    put("dist/x.js", "x");
    const r = capture(["ds-usage-lint", root, "--tokens", TOKENS]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("scanned 1 of 1 files");
    expect(r.out).toContain("skipped dist/: excluded directory 'dist' (default sweep)");
    expect(r.out).toMatch(/a\.html: 1 error\(s\), 0 warning\(s\)\n\s+✗ \[off-system-font\] line 2: OFF_SYSTEM_FONT/);
    expect(r.out).toContain("0 of 1 scanned file(s) clean");
  });

  it("two runs over the same tree are byte-identical (deterministic walk)", () => {
    for (const n of ["m", "a", "z", "c"]) put(`${n}.html`, `<style>.a { ${BAD_FONT}; }</style>`);
    expect(capture(["ds-usage-lint", root, "--tokens", TOKENS]).out).toBe(capture(["ds-usage-lint", root, "--tokens", TOKENS]).out);
  });

  it("a clean tree exits 0 and says so", () => {
    put("a.html", `<style>.a { font-family: inherit; }</style>`);
    put("b.tsx", `export const A = () => <p className="font-sans">x</p>;`);
    const r = capture(["ds-usage-lint", root, "--tokens", TOKENS]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("scanned 2 of 2 files");
    expect(r.out).toContain("2 of 2 scanned file(s) clean");
  });

  it("an explicitly named root is entered even when its own name is on the exclusion list", () => {
    put("fixtures/a.html", `<style>.a { ${BAD_FONT}; }</style>`);
    const { code, data } = jsonRun(join(root, "fixtures"));
    expect(code).toBe(1);
    expect(data.scanned).toBe(1);
  });

  it("a tree with no UI source is an error, never a clean pass", () => {
    put("readme.md", "# nothing");
    put("node_modules/p/i.js", "x");
    const r = capture(["ds-usage-lint", root, "--tokens", TOKENS, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("NO_UI_FILES");
  });

  it("an .html file in a sweep is judged with its LOCAL linked stylesheet inlined; an unreadable link is an error", () => {
    put("page.html", `<link rel="stylesheet" href="site.css"><p>x</p>`);
    put("site.css", `.a { ${BAD_FONT}; }`);
    put("broken.html", `<link rel="stylesheet" href="gone.css"><p>x</p>`);
    const { data } = jsonRun(root);
    expect(data.files.map((f) => [f.file, f.findings.map((x) => x.checkId)])).toEqual([
      ["broken.html", ["linked-css-unreadable"]],
      ["page.html", ["off-system-font"]],
    ]);
  });

  it("a file over the size cap and a symlink are counted in the total and skipped with a reason", () => {
    put("big.js", "x".repeat(MAX_UI_FILE_BYTES + 1));
    put("real.html", `<style>.a { font-family: inherit; }</style>`);
    symlinkSync(join(root, "real.html"), join(root, "link.html"));
    const { data } = jsonRun(root);
    expect(data.total).toBe(3);
    expect(data.scanned).toBe(1);
    const reasons = Object.fromEntries(data.skipped.map((s) => [s.path, s.reason]));
    expect(reasons["big.js"]).toMatch(/^larger than 2 MB/);
    expect(reasons["link.html"]).toBe("symlink not followed");
  });
});

describe("ui ds-usage-lint <dir> — what the walk could not read is said, never dropped", () => {
  it("a symlinked directory is not followed and is listed as a skip; a loop link too; the sweep stays clean of them", () => {
    const real = mkdtempSync(join(tmpdir(), "ease-ds-usage-real-"));
    try {
      mkdirSync(join(real, "sub"));
      writeFileSync(join(real, "sub", "a.html"), `<p style="${BAD_FONT}">x</p>`);
      put("b.html", `<style>.a { font-family: inherit; }</style>`);
      symlinkSync(real, join(root, "linked-dir"));
      symlinkSync("..", join(root, "loop"));
      const text = capture(["ds-usage-lint", root, "--tokens", TOKENS]);
      expect(text.code).toBe(0); // the linked tree is not read, so it neither fails nor is it claimed clean
      expect(text.out).toContain("scanned 1 of 1 files");
      expect(text.out).toContain("skipped linked-dir/: symlinked directory not followed");
      expect(text.out).toContain("skipped loop/: symlinked directory not followed");
      expect(text.out).toMatch(/2 path\(s\) skipped/);
      const { data } = jsonRun(root);
      expect(data.skipped.map((x) => [x.path, x.reason]).sort()).toEqual([
        ["linked-dir/", "symlinked directory not followed"],
        ["loop/", "symlinked directory not followed"],
      ]);
    } finally {
      rmSync(real, { recursive: true, force: true });
    }
  });

  it("a symlink to a file that is not UI source, and a dangling link, are not directories and are not reported", () => {
    put("b.html", `<style>.a { font-family: inherit; }</style>`);
    put("notes.txt", "x");
    symlinkSync(join(root, "notes.txt"), join(root, "notes-link"));
    symlinkSync(join(root, "gone"), join(root, "dangling"));
    expect(jsonRun(root).data.skipped).toEqual([]);
  });

  it.skipIf(process.getuid?.() === 0)("an unreadable subdirectory is skipped with its reason and the rest of the sweep is read", () => {
    put("ok.html", `<style>.a { font-family: inherit; }</style>`);
    put("locked/x.html", `<p style="${BAD_FONT}">x</p>`);
    chmodSync(join(root, "locked"), 0o000);
    try {
      const { code, data } = jsonRun(root);
      expect(code).toBe(0);
      expect(data.scanned).toBe(1);
      expect(data.skipped).toHaveLength(1);
      expect(data.skipped[0]?.path).toBe("locked/");
      expect(data.skipped[0]?.reason).toMatch(/^cannot read directory: EACCES/);
    } finally {
      chmodSync(join(root, "locked"), 0o755);
    }
  });

  it("a sweep that read none of its files is an error that names why, never a clean pass", () => {
    put("big.js", "x".repeat(MAX_UI_FILE_BYTES + 1));
    symlinkSync(join(root, "big.js"), join(root, "link.js"));
    const r = capture(["ds-usage-lint", root, "--tokens", TOKENS, "--json"]);
    expect(r.code).toBe(1);
    const err = JSON.parse(r.out).error as { code: string; message: string };
    expect(err.code).toBe("NO_FILES_READ");
    expect(err.message).toContain("read 0 of 2");
    expect(err.message).toContain("big.js: larger than 2 MB");
    expect(err.message).toContain("link.js: symlink not followed");
  });

  it.skipIf(process.getuid?.() === 0)("a tree whose only subdirectory cannot be listed is NO_FILES_READ with the path and cause, in text and JSON", () => {
    put("locked/x.html", `<p>x</p>`);
    chmodSync(join(root, "locked"), 0o000);
    try {
      const text = capture(["ds-usage-lint", root, "--tokens", TOKENS]);
      expect(text.code).toBe(1);
      expect(text.out).toContain("locked/: cannot read directory: EACCES");
      expect(text.out).not.toContain("no .html/.svelte");
      const err = JSON.parse(capture(["ds-usage-lint", root, "--tokens", TOKENS, "--json"]).out).error as { code: string; message: string };
      expect(err.code).toBe("NO_FILES_READ");
      expect(err.message).toContain("locked/: cannot read directory: EACCES");
    } finally {
      chmodSync(join(root, "locked"), 0o755);
    }
  });

  it.skipIf(process.getuid?.() === 0)("a root directory that cannot be listed is NO_FILES_READ, not 'no UI files'", () => {
    put("a.html", `<p>x</p>`);
    chmodSync(root, 0o000);
    try {
      const r = capture(["ds-usage-lint", root, "--tokens", TOKENS, "--json"]);
      expect(r.code).toBe(1);
      const err = JSON.parse(r.out).error as { code: string; message: string };
      expect(err.code).toBe("NO_FILES_READ");
      expect(err.message).toContain("./: cannot read directory: EACCES");
    } finally {
      chmodSync(root, 0o755);
    }
  });

  it("a tree with no UI source and nothing unreadable stays NO_UI_FILES, and says what it skipped", () => {
    put("node_modules/pkg/a.js", "x");
    const text = capture(["ds-usage-lint", root, "--tokens", TOKENS]);
    expect(text.code).toBe(1);
    expect(text.out).toContain("no .html/.svelte");
    expect(text.out).toContain("node_modules/: excluded directory 'node_modules'");
  });
});

describe("ui ds-usage-lint <file> — any UI source type", () => {
  it.each([
    ["x.svelte", `<style>\n.a { ${BAD_FONT}; }\n</style>`],
    ["x.vue", `<style scoped>\n.a { ${BAD_FONT}; }\n</style>`],
    ["x.tsx", `export const A = () => <p style={{ fontFamily: "ui-monospace" }}>x</p>;`],
    ["x.js", "export const S = `.a { " + BAD_FONT + "; }`;"],
    ["x.ts", `export const t = { fontFamily: "ui-monospace" };`],
  ])("%s is linted as its own type and fails on the undeclared monospace", (name, body) => {
    put(name, body);
    const r = capture(["ds-usage-lint", join(root, name), "--tokens", TOKENS]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("1 off-system font(s)");
  });

  it("a file with an unsupported extension is still read as HTML, as before", () => {
    put("page.txt", `<style>\n.a { ${BAD_FONT}; }\n</style>`);
    const r = capture(["ds-usage-lint", join(root, "page.txt"), "--tokens", TOKENS]);
    expect(r.code).toBe(1);
    expect(r.out).toContain("1 off-system font(s)");
  });

  it("HTML output keeps its original shape: one header line, findings, the note", () => {
    put("a.html", `<style>\n.a { color: #ff0000; }\n</style>`);
    const r = capture(["ds-usage-lint", join(root, "a.html"), "--tokens", TOKENS]);
    expect(r.out.split("\n")[0]).toBe(`ds-usage-lint: ${join(root, "a.html")} — 1 hardcoded colour(s), 0 off-system token(s), 0 undeclared reference(s), 0 off-system font(s)`);
    expect(r.out).toContain("NOTE: proves token usage in the page's own CSS only");
  });

  it("--tokens that does not exist is DS_NOT_FOUND naming the path; a missing target is FILE_NOT_FOUND first", () => {
    put("a.html", "<p>x</p>");
    const missingTokens = capture(["ds-usage-lint", join(root, "a.html"), "--tokens", join(root, "none.json"), "--json"]);
    expect(JSON.parse(missingTokens.out).error.code).toBe("DS_NOT_FOUND");
    const missingTarget = capture(["ds-usage-lint", join(root, "nope.html"), "--tokens", join(root, "none.json"), "--json"]);
    expect(JSON.parse(missingTarget.out).error.code).toBe("FILE_NOT_FOUND");
  });
});

describe("ui ds-usage-lint with a design system that declares no fontFamily token", () => {
  const NOTE = "off-system-font: the design system declares no fontFamily token";
  const body = `<style>\n.a { ${BAD_FONT}; color: #ff0000; }\n</style><p class="font-mono">x</p>`;
  let colourOnly: string;
  beforeEach(() => {
    colourOnly = join(root, "colour-only.tokens.json");
    writeFileSync(colourOnly, JSON.stringify({ colors: { brand: { $type: "color", $value: "#3b82f6" } } }));
  });

  it("single file: no off-system-font finding, the skip is printed and in the JSON, colour still fails the file", () => {
    put("a.html", body);
    const text = capture(["ds-usage-lint", join(root, "a.html"), "--tokens", colourOnly]);
    expect(text.code).toBe(1); // the hardcoded colour
    expect(text.out).toContain(`  skipped ${NOTE}`);
    expect(text.out).not.toContain("OFF_SYSTEM_FONT");
    expect(text.out).toContain("0 off-system font(s)");
    const json = JSON.parse(capture(["ds-usage-lint", join(root, "a.html"), "--tokens", colourOnly, "--json"]).out).data as { skippedChecks: string[]; offSystemFontCount: number; hardcodedColorCount: number };
    expect(json).toMatchObject({ skippedChecks: [NOTE], offSystemFontCount: 0, hardcodedColorCount: 1 });
  });

  it("directory: one skip line for the sweep, in the text and in the JSON", () => {
    put("a.html", body);
    put("b.tsx", `export const A = () => <p className="font-mono">x</p>;`);
    const text = capture(["ds-usage-lint", root, "--tokens", colourOnly]);
    expect(text.out.split(NOTE).length - 1).toBe(1);
    expect(text.out).toContain(`  skipped ${NOTE}`);
    const json = JSON.parse(capture(["ds-usage-lint", root, "--tokens", colourOnly, "--json"]).out).data as { skippedChecks: string[]; offSystemFontCount: number };
    expect(json).toMatchObject({ skippedChecks: [NOTE], offSystemFontCount: 0 });
  });

  it("with a font token the same tree is flagged and nothing is reported skipped", () => {
    put("a.html", body);
    const json = JSON.parse(capture(["ds-usage-lint", root, "--tokens", TOKENS, "--json"]).out).data as { skippedChecks: string[]; offSystemFontCount: number };
    expect(json.skippedChecks).toEqual([]);
    expect(json.offSystemFontCount).toBe(2);
  });
});
