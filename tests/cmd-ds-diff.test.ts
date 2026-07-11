/**
 * `ui ds diff <base-dir> <head-dir>` E2E — semver + visual-breaking DS diff.
 * Asserts --json envelope shape, --format variants, dangling → exit 1,
 * purely-additive → exit 0, and the FILE_NOT_FOUND / BAD_JSON / UNKNOWN_FLAG /
 * BAD_ARG error paths.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "../src/cli.js";

function capture(args: string[]): { code: number; out: string; err: string } {
  let out = "";
  let err = "";
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stdout.write = (c: any) => { out += String(c); return true; };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  process.stderr.write = (c: any) => { err += String(c); return true; };
  let code: number;
  try { code = run(args); } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  return { code, out, err };
}

let base: string;
let head: string;

function writeTokens(dir: string, tree: unknown): string {
  const p = join(dir, "design.tokens.json");
  writeFileSync(p, JSON.stringify(tree), "utf8");
  return p;
}
function writeRegistry(dir: string, components: unknown[]): string {
  const p = join(dir, "component-registry.json");
  writeFileSync(p, JSON.stringify({ components }), "utf8");
  return p;
}

const BASE_TOKENS = {
  color: { primary: { $value: "#2563EB", $type: "color" } },
};

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), "ease-dsdiff-base-"));
  head = mkdtempSync(join(tmpdir(), "ease-dsdiff-head-"));
});

describe("ui ds diff — --json envelope shape", () => {
  it("emits classification/recommendedBump/recommendedVersion when --base-version given", () => {
    writeTokens(base, BASE_TOKENS);
    writeTokens(head, { color: { primary: { $value: "#EF4444", $type: "color" } } });
    const r = capture(["ds", "diff", base, head, "--json", "--base-version", "1.2.0"]);
    const envelope = JSON.parse(r.out) as {
      ok: boolean;
      command: string;
      data: { classification: string; recommendedBump: string; recommendedVersion: string };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.command).toBe("ds diff");
    expect(envelope.data.classification).toBe("breaking");
    expect(envelope.data.recommendedBump).toBe("major");
    expect(envelope.data.recommendedVersion).toBe("2.0.0");
  });

  it("omits recommendedVersion when --base-version is not given", () => {
    writeTokens(base, BASE_TOKENS);
    writeTokens(head, { color: { primary: { $value: "#EF4444", $type: "color" } } });
    const r = capture(["ds", "diff", base, head, "--json"]);
    const envelope = JSON.parse(r.out) as { data: { recommendedVersion?: string } };
    expect(envelope.data.recommendedVersion).toBeUndefined();
  });
});

describe("ui ds diff — --format pr-comment", () => {
  it("contains 'Breaking' and the version line for a breaking change", () => {
    writeTokens(base, BASE_TOKENS);
    writeTokens(head, { color: { primary: { $value: "#EF4444", $type: "color" } } });
    const r = capture(["ds", "diff", base, head, "--format", "pr-comment", "--base-version", "1.2.0"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Breaking");
    expect(r.out).toContain("1.2.0 → v2.0.0");
  });
});

describe("ui ds diff — default markdown output", () => {
  it("has a 'Design-system diff' heading", () => {
    writeTokens(base, BASE_TOKENS);
    writeTokens(head, { color: { primary: { $value: "#EF4444", $type: "color" } } });
    const r = capture(["ds", "diff", base, head]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("Design-system diff");
  });
});

describe("ui ds diff — dangling reference scenario", () => {
  it("a head component using a head-removed token → exit 1, dangling populated", () => {
    writeTokens(base, BASE_TOKENS);
    writeRegistry(base, [{ name: "Button", category: "action", tokensUsed: ["color.primary"] }]);
    writeTokens(head, {}); // color.primary removed entirely
    writeRegistry(head, [{ name: "Button", category: "action", tokensUsed: ["color.primary"] }]);
    const r = capture(["ds", "diff", base, head, "--json"]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.out) as {
      ok: boolean;
      data: { classification: string; dangling: { component: string; token: string }[] };
    };
    expect(envelope.ok).toBe(true); // dangling is a data-level signal, not a command error
    expect(envelope.data.classification).toBe("breaking");
    expect(envelope.data.dangling).toEqual([{ component: "Button", token: "color.primary" }]);
  });
});

describe("ui ds diff — purely additive scenario", () => {
  it("only new tokens → classification additive, exit 0", () => {
    writeTokens(base, BASE_TOKENS);
    writeTokens(head, {
      color: {
        primary: { $value: "#2563EB", $type: "color" },
        secondary: { $value: "#EF4444", $type: "color" },
      },
    });
    const r = capture(["ds", "diff", base, head, "--json"]);
    expect(r.code).toBe(0);
    const envelope = JSON.parse(r.out) as { data: { classification: string; recommendedBump: string } };
    expect(envelope.data.classification).toBe("additive");
    expect(envelope.data.recommendedBump).toBe("minor");
  });
});

describe("ui ds diff — registry is optional", () => {
  it("a dir with only tokens (no component-registry.json) still works", () => {
    writeTokens(base, BASE_TOKENS);
    writeTokens(head, BASE_TOKENS);
    const r = capture(["ds", "diff", base, head, "--json"]);
    expect(r.code).toBe(0);
    const envelope = JSON.parse(r.out) as { ok: boolean; data: { classification: string } };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.classification).toBe("none");
  });
});

describe("ui ds diff — error paths", () => {
  it("missing design.tokens.json in a dir → FILE_NOT_FOUND", () => {
    // base has no design.tokens.json at all
    writeTokens(head, BASE_TOKENS);
    const r = capture(["ds", "diff", base, head, "--json"]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.out) as { error: { code: string } };
    expect(envelope.error.code).toBe("FILE_NOT_FOUND");
  });

  it("bad JSON in tokens file → BAD_JSON", () => {
    writeFileSync(join(base, "design.tokens.json"), "{not valid json", "utf8");
    writeTokens(head, BASE_TOKENS);
    const r = capture(["ds", "diff", base, head, "--json"]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.out) as { error: { code: string } };
    expect(envelope.error.code).toBe("BAD_JSON");
  });

  it("bad JSON in component-registry.json → BAD_JSON", () => {
    writeTokens(base, BASE_TOKENS);
    writeFileSync(join(base, "component-registry.json"), "{not valid json", "utf8");
    writeTokens(head, BASE_TOKENS);
    const r = capture(["ds", "diff", base, head, "--json"]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.out) as { error: { code: string } };
    expect(envelope.error.code).toBe("BAD_JSON");
  });

  it("an unknown flag → UNKNOWN_FLAG", () => {
    writeTokens(base, BASE_TOKENS);
    writeTokens(head, BASE_TOKENS);
    const r = capture(["ds", "diff", base, head, "--bogus-flag", "--json"]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.out) as { error: { code: string } };
    expect(envelope.error.code).toBe("UNKNOWN_FLAG");
  });

  it("--format bogus → BAD_ARG", () => {
    writeTokens(base, BASE_TOKENS);
    writeTokens(head, BASE_TOKENS);
    const r = capture(["ds", "diff", base, head, "--format", "bogus", "--json"]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.out) as { error: { code: string } };
    expect(envelope.error.code).toBe("BAD_ARG");
  });

  it("missing positionals → BAD_ARG", () => {
    writeTokens(base, BASE_TOKENS);
    const r = capture(["ds", "diff", base, "--json"]);
    expect(r.code).toBe(1);
    const envelope = JSON.parse(r.out) as { error: { code: string } };
    expect(envelope.error.code).toBe("BAD_ARG");
  });
});
