/**
 * Tests for GitHub issue #444: ontology query accepts a name that starts with dashes
 * when passed as a positional or as an option without prior positionals.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/core/cli-args.js";
import { runOntologyQuery } from "../src/commands/ontology-query.js";
import { capture } from "./owner-rulings-helpers.js";
import { builtRing1 } from "./ontology-query-helpers.js";

describe("ontology query: query terms starting with dashes (#444)", () => {
  it("runOntologyQuery accepts --button as a query term when passed as a sole unknown flag", () => {
    const p = builtRing1();
    const parsed1 = parseArgs(["ontology", "query", "--button", "--dir", p, "--json"]);
    const res1 = runOntologyQuery(parsed1);
    expect(res1.exitCode).toBe(0);
    const data1 = JSON.parse(res1.stdout!).data;
    expect(data1.query).toBe("--button");

    const parsed2 = parseArgs(["ontology", "query", "--dir", p, "--json", "--", "--button"]);
    const res2 = runOntologyQuery(parsed2);
    expect(res2.exitCode).toBe(0);
    const data2 = JSON.parse(res2.stdout!).data;
    expect(data2.query).toBe("--button");
    expect(data1.matches).toEqual(data2.matches);
  });

  it("still rejects multiple unknown flags or unknown flags with value", () => {
    const p = builtRing1();
    const parsed = parseArgs(["ontology", "query", "--nope", "value", "--dir", p, "--json"]);
    const res = runOntologyQuery(parsed);
    expect(res.exitCode).toBe(1);
    const env = JSON.parse(res.stdout!);
    expect(env.error.code).toBe("UNKNOWN_FLAG");
  });

  it("still rejects unknown flags when a positional is present", () => {
    const p = builtRing1();
    const parsed = parseArgs(["ontology", "query", "button", "--nope", "--dir", p, "--json"]);
    const res = runOntologyQuery(parsed);
    expect(res.exitCode).toBe(1);
    const env = JSON.parse(res.stdout!);
    expect(env.error.code).toBe("UNKNOWN_FLAG");
  });

  it("via CLI capture, 'ui ontology query --mu-surface' returns the CSS-ingested token node and known options keep working", () => {
    const dir = mkdtempSync(join(tmpdir(), "ontology-dash-css-"));
    try {
      const extractJson = join(dir, "extracted.json");
      writeFileSync(
        extractJson,
        JSON.stringify({
          colors: [],
          fonts: [],
          customProperties: [{ name: "--mu-surface", value: "#f8fafc", sources: ["theme.css:L1"], selectors: [":root"] }],
        }),
        "utf8",
      );
      const vocabDir = join(dir, "vocab");
      expect(capture(["ingest-css-ds", extractJson, "--out", vocabDir, "--json"]).code).toBe(0);
      const proj = join(dir, "proj");
      expect(capture(["ds", "import", join(vocabDir, "tokens.json"), "--dir", proj, "--name", "mu", "--json"]).code).toBe(0);
      expect(capture(["ontology", "build", "--dir", proj, "--json"]).code).toBe(0);

      const r = capture(["ontology", "query", "--mu-surface", "--dir", proj, "--budget", "4000", "--json"]);
      expect(r.code).toBe(0);
      const data = JSON.parse(r.out).data as { query: string; budget: number; matches: { id: string }[] };
      expect(data.query).toBe("--mu-surface");
      expect(data.budget).toBe(4000);
      expect(data.matches.map((m) => m.id)).toContain("token:color.mu-surface");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
