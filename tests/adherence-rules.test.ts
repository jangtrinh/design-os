/**
 * Adherence rule loader + token-ban evaluator.
 *
 * Pure parse/validate is tested on strings; the fs reader on real temp dirs; the evaluator on the
 * frozen oi-browser fixtures (tests/fixtures/oi-browser/SOURCES.md). Line numbers for the real
 * fixture are pinned literally (taken from `grep -n` on the file), not recomputed with the same
 * splitting logic the evaluator uses.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import { DSError } from "../src/core/design-system.js";
import {
  AdherenceRuleError,
  evaluateTokenBans,
  loadAdherenceRules,
  parseAdherenceRules,
} from "../src/core/adherence-rules.js";

const FIXTURES = fileURLToPath(new URL("./fixtures/oi-browser/", import.meta.url));
const read = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

const banRule = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: "ns-01-monospace-ui-leak",
  kind: "token-ban",
  severity: "error",
  message: "Monospace leaks into UI chrome; use the DS font family.",
  source: "NS-01",
  tokens: ["ui-monospace", "font-mono"],
  ...over,
});
const fileOf = (...rules: unknown[]): string => JSON.stringify({ rules });

function thrown(fn: () => unknown): AdherenceRuleError {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(AdherenceRuleError); return e as AdherenceRuleError; }
  throw new Error("expected the call to throw");
}

describe("parseAdherenceRules", () => {
  it("returns validated rules in file order with their provenance", () => {
    const text = fileOf(banRule(), banRule({ id: "ns-10-gradient", tokens: ["linear-gradient("], severity: "warning", source: "NS-10" }));
    const rules = parseAdherenceRules(text, "design/rules/_adherence.rules.json", "binding");
    expect(rules.map((r) => r.rule.id)).toEqual(["ns-01-monospace-ui-leak", "ns-10-gradient"]);
    expect(rules[0]).toMatchObject({ origin: "binding", file: "design/rules/_adherence.rules.json", index: 0 });
    expect(rules[1]).toMatchObject({ origin: "binding", index: 1 });
    expect(rules[1]!.rule).toMatchObject({ kind: "token-ban", severity: "warning", tokens: ["linear-gradient("], source: "NS-10" });
  });

  it("accepts an empty rules array", () => {
    expect(parseAdherenceRules(fileOf(), "f.json", "binding")).toEqual([]);
  });

  it("rejects invalid JSON with ADHERENCE_BAD_JSON naming the file", () => {
    const e = thrown(() => parseAdherenceRules("{ not json", "design/rules/_adherence.rules.json", "binding"));
    expect(e).toBeInstanceOf(DSError);
    expect(e.code).toBe("ADHERENCE_BAD_JSON");
    expect(e.message).toContain("design/rules/_adherence.rules.json");
  });

  it.each([
    ["an array", "[]"],
    ["null", "null"],
    ["an object without rules", "{}"],
    ["rules that is not an array", JSON.stringify({ rules: {} })],
  ])("rejects a file that is %s with ADHERENCE_BAD_FIELD on 'rules'", (_label, text) => {
    const e = thrown(() => parseAdherenceRules(text, "f.json", "binding"));
    expect(e.code).toBe("ADHERENCE_BAD_FIELD");
    expect(e.field).toBe("rules");
  });

  it("rejects an unknown kind with ADHERENCE_UNKNOWN_KIND, naming the kind, index and id", () => {
    const e = thrown(() => parseAdherenceRules(fileOf(banRule(), { id: "x", kind: "prop-allowlist" }), "f.json", "binding"));
    expect(e.code).toBe("ADHERENCE_UNKNOWN_KIND");
    expect(e.ruleIndex).toBe(1);
    expect(e.message).toContain("prop-allowlist");
    expect(e.message).toContain("#1");
    expect(e.message).toContain("token-ban"); // names what is supported
  });

  it.each(["toString", "constructor", "hasOwnProperty", "__proto__"])(
    "treats the inherited property name '%s' as an unknown kind, not a validator",
    (kind) => {
      const e = thrown(() => parseAdherenceRules(`{"rules":[{"id":"x","kind":"${kind}"}]}`, "f.json", "binding"));
      expect(e.code).toBe("ADHERENCE_UNKNOWN_KIND");
      expect(e.message).toContain(`'${kind}'`);
    },
  );

  it("tolerates a leading UTF-8 byte order mark", () => {
    const rules = parseAdherenceRules(`\uFEFF${fileOf(banRule())}`, "f.json", "binding");
    expect(rules).toHaveLength(1);
  });

  it("still reports invalid JSON behind a byte order mark", () => {
    expect(thrown(() => parseAdherenceRules("\uFEFF{ nope", "f.json", "binding")).code).toBe("ADHERENCE_BAD_JSON");
  });

  it("names the allowed fields when it rejects an unknown one", () => {
    const e = thrown(() => parseAdherenceRules(fileOf(banRule({ sorce: "x" })), "f.json", "binding"));
    expect(e.message).toContain("'sorce'");
    for (const allowed of ["id", "kind", "severity", "message", "source", "tokens"]) expect(e.message).toContain(allowed);
  });

  it("rejects a rule with no kind as a missing field, not an unknown kind", () => {
    const e = thrown(() => parseAdherenceRules(fileOf({ id: "x" }), "f.json", "binding"));
    expect(e.code).toBe("ADHERENCE_BAD_FIELD");
    expect(e.field).toBe("kind");
  });

  it.each<[string, Record<string, unknown>, string]>([
    ["missing id", { id: undefined }, "id"],
    ["empty id", { id: "" }, "id"],
    ["numeric id", { id: 7 }, "id"],
    ["missing severity", { severity: undefined }, "severity"],
    ["unknown severity", { severity: "fatal" }, "severity"],
    ["missing message", { message: undefined }, "message"],
    ["empty message", { message: "   " }, "message"],
    ["missing tokens", { tokens: undefined }, "tokens"],
    ["tokens not an array", { tokens: "ui-monospace" }, "tokens"],
    ["empty tokens", { tokens: [] }, "tokens"],
    ["a non-string token", { tokens: ["ok", 3] }, "tokens[1]"],
    ["an empty token", { tokens: ["ok", ""] }, "tokens[1]"],
    ["a whitespace-only token", { tokens: ["ok", "  "] }, "tokens[1]"],
    ["a token with a newline", { tokens: ["ok", "a\nb"] }, "tokens[1]"],
    ["a token with a carriage return", { tokens: ["ok", "a\rb"] }, "tokens[1]"],
    ["a duplicate token", { tokens: ["ok", "ok"] }, "tokens[1]"],
    ["a duplicate token differing only in case", { tokens: ["Font-Mono", "font-mono"] }, "tokens[1]"],
    ["non-string source", { source: 5 }, "source"],
    ["missing source", { source: undefined }, "source"],
    ["empty source", { source: " " }, "source"],
    ["a misspelled field (sorce)", { source: undefined, sorce: "NS-01" }, "sorce"],
    ["an unknown extra field", { tokens: ["a"], severty: "error" }, "severty"],
  ])("rejects %s with ADHERENCE_BAD_FIELD naming the field and the rule", (_label, over, field) => {
    const e = thrown(() => parseAdherenceRules(fileOf(banRule({ id: "first" }), banRule({ id: "second", ...over })), "rules.json", "binding"));
    expect(e.code).toBe("ADHERENCE_BAD_FIELD");
    expect(e.field).toBe(field);
    expect(e.ruleIndex).toBe(1);
    expect(e.message).toContain(`'${field}'`);
    expect(e.message).toContain("rules.json");
    expect(e.message).toContain("#1");
  });

  it("rejects a rule that is not an object", () => {
    const e = thrown(() => parseAdherenceRules(fileOf(banRule(), "nope"), "f.json", "binding"));
    expect(e.code).toBe("ADHERENCE_BAD_FIELD");
    expect(e.ruleIndex).toBe(1);
  });

  it("rejects a duplicate rule id inside one file and names both positions", () => {
    const e = thrown(() => parseAdherenceRules(fileOf(banRule({ id: "dup" }), banRule({ id: "other" }), banRule({ id: "dup" })), "f.json", "binding"));
    expect(e.code).toBe("ADHERENCE_DUPLICATE_ID");
    expect(e.message).toContain("'dup'");
    expect(e.message).toContain("#0");
    expect(e.message).toContain("#2");
  });
});

describe("loadAdherenceRules", () => {
  const dirs: string[] = [];
  afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
  const designDir = (): string => {
    const d = mkdtempSync(join(tmpdir(), "adherence-rules-"));
    dirs.push(d);
    mkdirSync(join(d, "rules"));
    return d;
  };

  it("loads the binding and the proposed file and records where each rule came from", () => {
    const d = designDir();
    writeFileSync(join(d, "rules", "_adherence.rules.json"), fileOf(banRule({ id: "binding-1" })));
    writeFileSync(join(d, "rules", "_adherence.proposed.json"), fileOf(banRule({ id: "proposed-1" }), banRule({ id: "proposed-2" })));
    const r = loadAdherenceRules(d);
    expect(r.binding.map((x) => [x.rule.id, x.origin, x.file])).toEqual([["binding-1", "binding", join(d, "rules", "_adherence.rules.json")]]);
    expect(r.proposed.map((x) => [x.rule.id, x.origin])).toEqual([["proposed-1", "proposed"], ["proposed-2", "proposed"]]);
    expect(r.proposed[1]!.file).toBe(join(d, "rules", "_adherence.proposed.json"));
    expect(r.skipped).toEqual([]);
  });

  it("treats a missing file as an empty result plus a recorded skip, never an error", () => {
    const d = designDir();
    const r = loadAdherenceRules(d);
    expect(r.binding).toEqual([]);
    expect(r.proposed).toEqual([]);
    expect(r.skipped).toEqual([
      { file: join(d, "rules", "_adherence.rules.json"), reason: "missing" },
      { file: join(d, "rules", "_adherence.proposed.json"), reason: "missing" },
    ]);
  });

  it("records only the missing file when the other one is present", () => {
    const d = designDir();
    writeFileSync(join(d, "rules", "_adherence.proposed.json"), fileOf(banRule()));
    const r = loadAdherenceRules(d);
    expect(r.proposed).toHaveLength(1);
    expect(r.skipped).toEqual([{ file: join(d, "rules", "_adherence.rules.json"), reason: "missing" }]);
  });

  it("does not need the rules directory to exist", () => {
    const d = mkdtempSync(join(tmpdir(), "adherence-rules-"));
    dirs.push(d);
    const r = loadAdherenceRules(d);
    expect(r.skipped.map((s) => s.reason)).toEqual(["missing", "missing"]);
  });

  it("allows the same id in the binding and the proposed file (they are separate lists)", () => {
    const d = designDir();
    writeFileSync(join(d, "rules", "_adherence.rules.json"), fileOf(banRule({ id: "same" })));
    writeFileSync(join(d, "rules", "_adherence.proposed.json"), fileOf(banRule({ id: "same" })));
    const r = loadAdherenceRules(d);
    expect([r.binding[0]!.origin, r.proposed[0]!.origin]).toEqual(["binding", "proposed"]);
  });

  it("surfaces a bad proposed file instead of hiding it behind a good binding file", () => {
    const d = designDir();
    writeFileSync(join(d, "rules", "_adherence.rules.json"), fileOf(banRule()));
    writeFileSync(join(d, "rules", "_adherence.proposed.json"), "{ broken");
    const e = thrown(() => loadAdherenceRules(d));
    expect(e.code).toBe("ADHERENCE_BAD_JSON");
    expect(e.message).toContain("_adherence.proposed.json");
  });

  it("fails loudly when the path exists but cannot be read as a file", () => {
    const d = designDir();
    mkdirSync(join(d, "rules", "_adherence.rules.json"));
    expect(() => loadAdherenceRules(d)).toThrowError(expect.objectContaining({ code: "READ_ERROR" }));
  });
});

describe("evaluateTokenBans", () => {
  const rules = (...r: Record<string, unknown>[]) => parseAdherenceRules(fileOf(...r), "f.json", "binding").map((x) => x.rule);
  const bans = (...r: Record<string, unknown>[]) => rules(...r).flatMap((x) => (x.kind === "token-ban" ? [x] : []));

  it("reports every occurrence with its 1-based line, in line order", () => {
    const text = ["a { font-family: ui-monospace; }", "ok", "b { font-family: ui-monospace, monospace; } /* ui-monospace */"].join("\n");
    const f = evaluateTokenBans(bans(banRule({ tokens: ["ui-monospace"] })), text);
    expect(f.map((x) => [x.line, x.token])).toEqual([[1, "ui-monospace"], [3, "ui-monospace"], [3, "ui-monospace"]]);
  });

  it("carries the rule id, severity and message on each finding", () => {
    const f = evaluateTokenBans(bans(banRule({ severity: "warning", message: "no mono" })), "x font-mono y");
    expect(f).toEqual([{ ruleId: "ns-01-monospace-ui-leak", token: "font-mono", line: 1, severity: "warning", message: "no mono" }]);
  });

  it("orders findings by line, then by rule order, then by token order within the rule", () => {
    const text = "bg-gradient-to-r linear-gradient(\nlinear-gradient(";
    const f = evaluateTokenBans(
      bans(banRule({ id: "r1", tokens: ["linear-gradient("] }), banRule({ id: "r2", tokens: ["bg-gradient-", "linear-gradient("] })),
      text,
    );
    expect(f.map((x) => `${x.line}:${x.ruleId}:${x.token}`)).toEqual([
      "1:r1:linear-gradient(", "1:r2:bg-gradient-", "1:r2:linear-gradient(", "2:r1:linear-gradient(", "2:r2:linear-gradient(",
    ]);
  });

  it("matches case-insensitively in both directions, reporting the token as declared in the rule", () => {
    const f = evaluateTokenBans(bans(banRule({ tokens: ["ui-monospace"] })), "font-family: UI-Monospace;");
    expect(f.map((x) => x.token)).toEqual(["ui-monospace"]);
    const g = evaluateTokenBans(bans(banRule({ tokens: ["JetBrains Mono"] })), "font-family: jetbrains mono;");
    expect(g.map((x) => x.token)).toEqual(["JetBrains Mono"]);
  });

  it("returns nothing for empty text, no rules, or no match", () => {
    expect(evaluateTokenBans(bans(banRule()), "")).toEqual([]);
    expect(evaluateTokenBans([], "ui-monospace")).toEqual([]);
    expect(evaluateTokenBans(bans(banRule()), "plain sans-serif text")).toEqual([]);
  });

  it("counts non-overlapping occurrences: 'aa' in 'aaa' is one hit, in 'aaaa' two", () => {
    expect(evaluateTokenBans(bans(banRule({ tokens: ["aa"] })), "aaa")).toHaveLength(1);
    expect(evaluateTokenBans(bans(banRule({ tokens: ["aa"] })), "aaaa")).toHaveLength(2);
  });

  it("counts overlapping tokens of one rule separately (ui-monospace also contains monospace)", () => {
    const f = evaluateTokenBans(bans(banRule({ tokens: ["ui-monospace", "monospace"] })), "font-family: ui-monospace, monospace;");
    expect(f.map((x) => x.token)).toEqual(["ui-monospace", "monospace", "monospace"]);
  });

  it("counts CRLF files by line, not by carriage return", () => {
    const f = evaluateTokenBans(bans(banRule({ tokens: ["font-mono"] })), "one\r\ntwo font-mono\r\nthree");
    expect(f.map((x) => x.line)).toEqual([2]);
  });

  describe("on the frozen oi-browser fixtures", () => {
    const nsMonospace = bans(banRule({ tokens: ["ui-monospace"] }));

    it("finds ui-monospace in the bad CLI Core screen, on the exact lines", () => {
      const f = evaluateTokenBans(nsMonospace, read("settings-cli-core-bad.html"));
      expect(f.map((x) => x.line)).toEqual([18, 28, 33, 34, 42, 44, 51]);
      expect(new Set(f.map((x) => x.token))).toEqual(new Set(["ui-monospace"]));
    });

    it("finds nothing in the good CLI Core screen and in the hand-composed account anchor", () => {
      const good = read("settings-cli-core-good.html");
      const anchor = read("settings-account.html");
      // The anchor's zero is partly by construction: its stylesheet excerpt deliberately omits the
      // user-agent monospace rule for code/pre (see SOURCES.md). The good screen's zero is a plain copy.
      // A zero is a claim: prove both files were actually read and that the probe can go red on them.
      expect(good).toContain("oi-opt-row");
      expect(anchor).toContain('data-slot="options-group"');
      expect(evaluateTokenBans(bans(banRule({ tokens: ["oi-opt-row"] })), good).length).toBeGreaterThan(0);
      expect(evaluateTokenBans(bans(banRule({ tokens: ["options-group-card"] })), anchor).length).toBeGreaterThan(0);

      expect(evaluateTokenBans(nsMonospace, good)).toEqual([]);
      expect(evaluateTokenBans(nsMonospace, anchor)).toEqual([]);
    });

    it("also catches the generic monospace keyword in the bad screen and not in the good one", () => {
      // 7 declarations, each naming `ui-monospace` and then the generic `monospace` fallback.
      const generic = bans(banRule({ tokens: ["monospace", "font-mono"] }));
      expect(evaluateTokenBans(generic, read("settings-cli-core-bad.html")).length).toBe(14);
      expect(evaluateTokenBans(generic, read("settings-cli-core-good.html"))).toEqual([]);
    });
  });
});
