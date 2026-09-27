/**
 * `ui token-coverage <file.html> --tokens <f> [--floor <n>]` — CLI E2E.
 * Mirrors the mkdtempSync + design/design.tokens.json convention in
 * tests/cmd-ds-usage-lint.test.ts.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
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

let dir: string;
let tokensPath: string;
const write = (name: string, contents: string): string => {
  const p = join(dir, name);
  writeFileSync(p, contents, "utf8");
  return p;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ease-token-coverage-"));
  mkdirSync(join(dir, "design"), { recursive: true });
  tokensPath = join(dir, "design", "design.tokens.json");
  writeFileSync(tokensPath, JSON.stringify({
    color: { primary: { $value: "#3b82f6", $type: "color" } },
    space: { md: { $value: "16px", $type: "dimension" } },
  }), "utf8");
});

describe("ui token-coverage — C1 negative controls", () => {
  it("all raw hex → coverage 0, exit 1", () => {
    const file = write("bad.html", `<html><head><style>
      .card { color: #ff0000; background: #00ff00; }
    </style></head><body></body></html>`);
    const r = capture(["token-coverage", file, "--tokens", tokensPath, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { overall: { coverage: number } };
    expect(d.overall.coverage).toBe(0);
  });

  it("only tokens → coverage 1.0, exit 0", () => {
    const file = write("good.html", `<html><head><style>
      .card { color: var(--color-primary); padding: var(--space-md); }
    </style></head><body></body></html>`);
    const r = capture(["token-coverage", file, "--tokens", tokensPath, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { overall: { coverage: number } };
    expect(d.overall.coverage).toBe(1);
  });

  it("a literal equal to a token value counts as token", () => {
    const file = write("literal.html", `<html><head><style>
      .card { color: #3b82f6; }
    </style></head><body></body></html>`);
    const r = capture(["token-coverage", file, "--tokens", tokensPath, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { categories: { color: { token: number; raw: number } } };
    expect(d.categories.color.token).toBe(1);
    expect(d.categories.color.raw).toBe(0);
  });
});

describe("ui token-coverage — --floor", () => {
  it("--floor 0 always passes", () => {
    const file = write("bad.html", `<html><head><style>.card { color: #ff0000; }</style></head><body></body></html>`);
    const r = capture(["token-coverage", file, "--tokens", tokensPath, "--floor", "0", "--json"]);
    expect(r.code).toBe(0);
  });

  it("--floor out of range → BAD_ARG", () => {
    const file = write("ok.html", `<html><body></body></html>`);
    const r = capture(["token-coverage", file, "--tokens", tokensPath, "--floor", "1.5", "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });
});

describe("ui token-coverage — error paths", () => {
  it("missing <file.html> → BAD_ARG", () => {
    const r = capture(["token-coverage", "--tokens", tokensPath, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_ARG");
  });

  it("nonexistent HTML file → FILE_NOT_FOUND", () => {
    const r = capture(["token-coverage", join(dir, "nope.html"), "--tokens", tokensPath, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("FILE_NOT_FOUND");
  });

  it("no token file given or auto-detected → TOKENS_NOT_FOUND", () => {
    const empty = mkdtempSync(join(tmpdir(), "ease-token-coverage-empty-"));
    const file = join(empty, "good.html");
    writeFileSync(file, "<html><body></body></html>", "utf8");
    const r = capture(["token-coverage", file, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("TOKENS_NOT_FOUND");
  });

  it("malformed token JSON → BAD_JSON", () => {
    writeFileSync(tokensPath, "{not valid json", "utf8");
    const file = write("good.html", "<html><body></body></html>");
    const r = capture(["token-coverage", file, "--tokens", tokensPath, "--json"]);
    expect(r.code).toBe(1);
    expect(JSON.parse(r.out).error.code).toBe("BAD_JSON");
  });
});

describe("ui token-coverage — linked stylesheet", () => {
  it("a raw literal in a linked stylesheet is scored", () => {
    writeFileSync(join(dir, "styles.css"), ".card { color: #ff0000; }", "utf8");
    const file = write("page.html", `<html><head><link rel="stylesheet" href="styles.css"></head><body></body></html>`);
    const r = capture(["token-coverage", file, "--tokens", tokensPath, "--json"]);
    expect(r.code).toBe(1);
    const d = JSON.parse(r.out).data as { overall: { coverage: number; raw: number } };
    expect(d.overall.raw).toBe(1);
    expect(d.overall.coverage).toBe(0);
  });
});

describe("ui token-coverage — auto-detect (brand/design/design.tokens.json fallback)", () => {
  it("no --tokens flag, no design/ds.manifest.json, but brand/design/design.tokens.json present → still scores", () => {
    const auto = mkdtempSync(join(tmpdir(), "ease-token-coverage-auto-"));
    mkdirSync(join(auto, "brand", "design"), { recursive: true });
    writeFileSync(join(auto, "brand", "design", "design.tokens.json"), JSON.stringify({
      color: { primary: { $value: "#3b82f6", $type: "color" } },
    }), "utf8");
    const file = join(auto, "auto.html");
    writeFileSync(file, `<html><head><style>.card { color: var(--color-primary); }</style></head><body></body></html>`, "utf8");
    const r = capture(["token-coverage", file, "--json"]);
    expect(r.code).toBe(0);
    const d = JSON.parse(r.out).data as { overall: { coverage: number } };
    expect(d.overall.coverage).toBe(1);
  });
});

describe("ui token-coverage — --help", () => {
  it("mentions the classes, options, and error codes", () => {
    const r = capture(["token-coverage", "--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("--tokens");
    expect(r.out).toContain("--floor");
    expect(r.out).toContain("TOKENS_NOT_FOUND");
  });
});
