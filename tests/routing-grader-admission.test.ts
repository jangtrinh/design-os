import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const grader = join(root, "eval", "routing-grader.mjs");
const corpusPath = join(root, "eval", "routing-prompts.json");

let tempDir = "";

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = "";
  }
});

function getTemp(): string {
  if (!tempDir) {
    tempDir = mkdtempSync(join(tmpdir(), "routing-grader-test-"));
  }
  return tempDir;
}

function runGrader(args: string[]) {
  return spawnSync(process.execPath, [grader, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

describe("routing-grader admission hardness", () => {
  it("exists at eval/routing-grader.mjs", () => {
    expect(existsSync(grader)).toBe(true);
  });

  describe("corpus validation", () => {
    it("fails with exit 2 when corpus file cannot be read", () => {
      const res = runGrader(["eval/non-existent-prompts.json", "dummy.json"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("non-existent-prompts.json");
    });

    it("fails with exit 2 on invalid JSON in corpus file", () => {
      const dir = getTemp();
      const badCorpus = join(dir, "bad-corpus.json");
      writeFileSync(badCorpus, "{ invalid json");
      const badDecisions = join(dir, "decisions.json");
      writeFileSync(badDecisions, "[]");

      const res = runGrader([badCorpus, badDecisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain(badCorpus);
    });

    it("fails with exit 2 when corpus root is not an object with prompts array", () => {
      const dir = getTemp();
      const badCorpus = join(dir, "bad-corpus.json");
      writeFileSync(badCorpus, JSON.stringify({ prompts: "not-an-array" }));
      const decisions = join(dir, "decisions.json");
      writeFileSync(decisions, "[]");

      const res = runGrader([badCorpus, decisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain(badCorpus);
    });

    it("fails with exit 2 when corpus has duplicate prompt IDs", () => {
      const dir = getTemp();
      const badCorpus = join(dir, "duplicate-prompts.json");
      writeFileSync(
        badCorpus,
        JSON.stringify({
          prompts: [
            { id: "v01", category: "verb", prompt: "first", expectedRoute: ["why"] },
            { id: "v01", category: "verb", prompt: "second", expectedRoute: ["why"] },
          ],
        }),
      );
      const decisions = join(dir, "decisions.json");
      writeFileSync(decisions, "[]");

      const res = runGrader([badCorpus, decisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v01");
    });

    it("fails with exit 2 when corpus prompt has unknown category", () => {
      const dir = getTemp();
      const badCorpus = join(dir, "bad-cat.json");
      writeFileSync(
        badCorpus,
        JSON.stringify({
          prompts: [
            { id: "v01", category: "unknown-category", prompt: "foo", expectedRoute: ["why"] },
          ],
        }),
      );
      const decisions = join(dir, "decisions.json");
      writeFileSync(decisions, "[]");

      const res = runGrader([badCorpus, decisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("unknown-category");
    });

    it("fails with exit 2 when corpus prompt has invalid expectedRoute for non-must-ask", () => {
      const dir = getTemp();
      const badCorpus = join(dir, "bad-route.json");
      writeFileSync(
        badCorpus,
        JSON.stringify({
          prompts: [
            { id: "v01", category: "verb", prompt: "foo", expectedRoute: [] },
          ],
        }),
      );
      const decisions = join(dir, "decisions.json");
      writeFileSync(decisions, "[]");

      const res = runGrader([badCorpus, decisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v01");
    });

    it("fails with exit 2 when must-ask prompt has invalid or missing expectedAsk", () => {
      const dir = getTemp();
      const badCorpus = join(dir, "bad-must-ask.json");
      writeFileSync(
        badCorpus,
        JSON.stringify({
          prompts: [
            { id: "a01", category: "must-ask", prompt: "audit", expectedRoute: [], expectedAsk: "invalid-ask" },
          ],
        }),
      );
      const decisions = join(dir, "decisions.json");
      writeFileSync(decisions, "[]");

      const res = runGrader([badCorpus, decisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("a01");
    });
  });

  describe("decisions admission validation", () => {
    it("fails with exit 2 when decisions file cannot be read", () => {
      const res = runGrader([corpusPath, "eval/non-existent-decisions.json"]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("non-existent-decisions.json");
    });

    it("fails with exit 2 on invalid JSON in decisions file", () => {
      const dir = getTemp();
      const badDecisions = join(dir, "bad-decisions.json");
      writeFileSync(badDecisions, "not json");

      const res = runGrader([corpusPath, badDecisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain(badDecisions);
    });

    it("fails with exit 2 when decisions root is not an array", () => {
      const dir = getTemp();
      const badDecisions = join(dir, "bad-decisions.json");
      writeFileSync(badDecisions, JSON.stringify({ id: "v01" }));

      const res = runGrader([corpusPath, badDecisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("array");
    });

    it("fails with exit 2 when a decision is not an object or has empty id", () => {
      const dir = getTemp();
      const badDecisions = join(dir, "bad-decisions.json");
      writeFileSync(badDecisions, JSON.stringify(["not an object"]));

      const res = runGrader([corpusPath, badDecisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain(badDecisions);
    });

    it("fails with exit 2 when decision contains duplicate ID", () => {
      const dir = getTemp();
      const dupDecisions = join(dir, "dup-decisions.json");
      writeFileSync(
        dupDecisions,
        JSON.stringify([
          { id: "v01", route: ["why"], ask: "none" },
          { id: "v01", route: ["why"], ask: "none" },
        ]),
      );

      const res = runGrader([corpusPath, dupDecisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v01");
      expect(res.stderr).toMatch(/duplicate/i);
    });

    it("fails with exit 2 when decision contains unknown ID not in corpus", () => {
      const dir = getTemp();
      const unknownDecisions = join(dir, "unknown-decisions.json");
      writeFileSync(
        unknownDecisions,
        JSON.stringify([{ id: "v999_unknown", route: ["why"], ask: "none" }]),
      );

      const res = runGrader([corpusPath, unknownDecisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v999_unknown");
    });

    it("fails with exit 2 when decision route is not an array of strings", () => {
      const dir = getTemp();
      const badRoute = join(dir, "bad-route.json");
      writeFileSync(
        badRoute,
        JSON.stringify([{ id: "v01", route: "why", ask: "none" }]),
      );

      const res = runGrader([corpusPath, badRoute]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v01");
    });

    it("fails with exit 2 when decision ask is 'none' but route is empty", () => {
      const dir = getTemp();
      const emptyRoute = join(dir, "empty-route.json");
      writeFileSync(
        emptyRoute,
        JSON.stringify([{ id: "v01", route: [], ask: "none" }]),
      );

      const res = runGrader([corpusPath, emptyRoute]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v01");
    });

    it("fails with exit 2 when decision ask is not in the closed enum", () => {
      const dir = getTemp();
      const badAsk = join(dir, "bad-ask.json");
      writeFileSync(
        badAsk,
        JSON.stringify([{ id: "v01", route: ["why"], ask: "clarify" }]),
      );

      const res = runGrader([corpusPath, badAsk]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v01");
      expect(res.stderr).toContain("clarify");
    });

    it("fails with exit 2 when decision variants is neither absent nor boolean", () => {
      const dir = getTemp();
      const badVariants = join(dir, "bad-variants.json");
      writeFileSync(
        badVariants,
        JSON.stringify([{ id: "v01", route: ["why"], ask: "none", variants: "yes" }]),
      );

      const res = runGrader([corpusPath, badVariants]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v01");
    });
  });

  describe("--require-complete and coverage output", () => {
    it("fails with exit 2 under --require-complete when decisions are incomplete, naming missing IDs", () => {
      const dir = getTemp();
      const partialDecisions = join(dir, "partial.json");
      writeFileSync(
        partialDecisions,
        JSON.stringify([{ id: "v01", route: ["why"], ask: "none" }]),
      );

      const res = runGrader(["--require-complete", corpusPath, partialDecisions]);
      expect(res.status).toBe(2);
      expect(res.stderr).toContain("v02");
    });

    it("supports partial run by default and outputs explicit coverage block", () => {
      const dir = getTemp();
      const partialDecisions = join(dir, "partial.json");
      writeFileSync(
        partialDecisions,
        JSON.stringify([{ id: "v01", route: ["why"], ask: "none" }]),
      );

      const res = runGrader([corpusPath, partialDecisions]);
      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.coverage).toEqual({
        covered: 1,
        total: 84,
        complete: false,
        missingIds: expect.arrayContaining(["v02", "a01"]),
      });
      expect(parsed.coverage.missingIds).not.toContain("v01");
      expect(parsed.summary.verb.covered).toBe("1/58");
      expect(parsed.summary.verb.passed).toBe(1);
      expect(parsed.misses).toEqual([]);
    });

    it("succeeds under --require-complete when all corpus prompts are provided", () => {
      const dir = getTemp();
      const completeDecisions = join(dir, "complete.json");
      const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
      const decisions = corpus.prompts.map((p: { id: string; category: string; expectedRoute: string[]; expectedAsk?: string }) => ({
        id: p.id,
        route: p.category === "must-ask" ? [] : p.expectedRoute,
        ask: p.category === "must-ask" ? p.expectedAsk : "none",
      }));
      writeFileSync(completeDecisions, JSON.stringify(decisions));

      const res = runGrader([corpusPath, completeDecisions, "--require-complete"]);
      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.coverage).toEqual({
        covered: 84,
        total: 84,
        complete: true,
        missingIds: [],
      });
      expect(parsed.summary.verb.passed).toBe(58);
      expect(parsed.summary["must-ask"].passed).toBe(12);
      expect(parsed.summary["selection-route"].passed).toBe(6);
      expect(parsed.summary.composite.passed).toBe(8);
      expect(parsed.misses).toHaveLength(0);
    });
  });

  describe("grading rules preserved", () => {
    it("grades wrong route as a miss without rejecting input", () => {
      const dir = getTemp();
      const wrongDecisions = join(dir, "wrong.json");
      writeFileSync(
        wrongDecisions,
        JSON.stringify([{ id: "v01", route: ["wrong-verb"], ask: "none" }]),
      );

      const res = runGrader([corpusPath, wrongDecisions]);
      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.summary.verb.covered).toBe("1/58");
      expect(parsed.summary.verb.passed).toBe(0);
      expect(parsed.summary.verb.pct).toBe(0);
      expect(parsed.misses).toHaveLength(1);
      expect(parsed.misses[0].id).toBe("v01");
      expect(parsed.misses[0].pass).toBe(false);
      expect(parsed.misses[0].got.route).toEqual(["wrong-verb"]);
    });

    it("ignores route on must-ask category when ask matches expectedAsk", () => {
      const dir = getTemp();
      const decisionsFile = join(dir, "must-ask.json");
      // a01 expects ask-1
      writeFileSync(
        decisionsFile,
        JSON.stringify([{ id: "a01", route: ["some", "tentative", "route"], ask: "ask-1" }]),
      );

      const res = runGrader([corpusPath, decisionsFile]);
      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.summary["must-ask"].covered).toBe("1/12");
      expect(parsed.summary["must-ask"].passed).toBe(1);
      expect(parsed.misses).toHaveLength(0);
    });

    it("records tasteInterrogations and variantsOffered for selection-route", () => {
      const dir = getTemp();
      const decisionsFile = join(dir, "selection.json");
      // s01 is selection-route
      writeFileSync(
        decisionsFile,
        JSON.stringify([
          { id: "s01", route: ["generate"], ask: "ask-2", variants: true },
        ]),
      );

      const res = runGrader([corpusPath, decisionsFile]);
      expect(res.status).toBe(0);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.summary.tasteInterrogations).toBe(1);
      expect(parsed.summary.variantsOffered).toBe(1);
    });
  });
});
