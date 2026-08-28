/**
 * The field corpus: real pages with adjudicated verdicts.
 *
 * A fixture is a statement of the rule author's model of the world. It catches drift
 * away from that model and, structurally, never an error inside it. Measured on this
 * branch: 8 of 8 substantive defects came from real data, 0 from the 4,000-test suite.
 *
 * This runner closes that gap. Every finding on a real page carries a recorded verdict
 * and a reason, so:
 *   - a fix that silences an adjudicated true positive turns the suite red, naming the
 *     finding and quoting the reason someone wrote when they judged it real;
 *   - a finding nobody has judged fails as `unadjudicated`, which is a two-minute
 *     decision rather than an invisible behavior change.
 *
 * The FIRST page adjudicated found a real bug that 4,038 tests missed: `tight-leading`
 * read `(t.sizePx ?? 16) <= 20`, substituting 16 for an unresolvable `clamp()` size and
 * then calling a 94px headline "16px body copy". Three false positives, one root cause.
 */
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractHtml } from "../src/core/extractors/html/html-extractor.js";
import { lintTell } from "../src/core/tell-lint.js";
import { extractorById } from "../src/core/design-facts/extractor-registry.js";
import { scanInlineIgnores, applyInlineIgnores } from "../src/core/inline-ignores.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CORPUS = join(ROOT, "tests", "field-corpus");

/** What a human decided about one finding. */
type Verdict = "tp" | "fp" | "fp-open";

interface VerdictRow {
  key: string;
  verdict: Verdict;
  reason: string;
  message?: string;
}

interface CorpusPage {
  /** Repo-relative path (pinnedBy "repo-path") or a file inside the page dir ("snapshot"). */
  page: string;
  pinnedBy: "repo-path" | "snapshot";
  sha256?: string;
  extractor: string;
  verdicts: VerdictRow[];
}

/**
 * The verdict key.
 *
 * Built from the stable half of the dedup key the linter already uses at
 * `tell-lint.ts:101` (`checkId ∥ line ∥ nodeRef ∥ message`). `message` is deliberately
 * excluded: `collapseRepeated` folds an element count into it, so keying on message
 * would turn every count change into a phantom new finding.
 *
 * Measured over 73 real files / 263 findings, this key collides once when scoped per
 * page — hence the ordinal, which is inert whenever the key is already unique.
 */
function keyOf(f: { checkId: string; line?: number; nodeRef?: string; actual?: string }): string {
  const locator = f.nodeRef ?? (f.line !== undefined && f.line !== null ? `line:${f.line}` : "doc");
  return `${f.checkId}@${locator}#${f.actual ?? "-"}`;
}

function withOrdinals(findings: ReadonlyArray<{ checkId: string; line?: number; nodeRef?: string; actual?: string }>): string[] {
  const seen = new Map<string, number>();
  return findings.map((f) => {
    const base = keyOf(f);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base}~${n}`;
  });
}

function pageDirs(): string[] {
  if (!existsSync(CORPUS)) return [];
  return readdirSync(CORPUS).filter((d) => {
    const p = join(CORPUS, d);
    return statSync(p).isDirectory() && existsSync(join(p, "verdicts.json"));
  });
}

const DIRS = pageDirs();

/** Run the same pipeline `ui tell-lint` runs for the html-cascade tier. */
function lintPage(absPath: string): { keys: string[]; byKey: Map<string, string> } {
  const profile = extractorById("html-cascade");
  if (profile === undefined) throw new Error("html-cascade profile is not registered");
  const source = readFileSync(absPath, "utf8");
  const extraction = extractHtml(source, absPath);
  const result = lintTell(extraction.collector.facts(), profile);
  const { kept } = applyInlineIgnores(result.findings, scanInlineIgnores(source));
  const all = [...kept, ...result.contrast, ...result.voice] as Array<{
    checkId: string; line?: number; nodeRef?: string; actual?: string; message: string;
  }>;
  const keys = withOrdinals(all);
  const byKey = new Map<string, string>();
  keys.forEach((k, i) => byKey.set(k, all[i]?.message ?? ""));
  return { keys, byKey };
}

describe("field corpus", () => {
  it("has pages, and every page has a verdict sidecar", () => {
    // A runner that silently skips every page is a green that means nothing.
    expect(DIRS.length).toBeGreaterThan(0);
  });

  for (const dir of DIRS) {
    const spec = JSON.parse(readFileSync(join(CORPUS, dir, "verdicts.json"), "utf8")) as CorpusPage;
    const absPath = spec.pinnedBy === "repo-path" ? join(ROOT, spec.page) : join(CORPUS, dir, spec.page);

    describe(dir, () => {
      it("the adjudicated page still exists", () => {
        expect(existsSync(absPath), `corpus page is missing: ${spec.page}`).toBe(true);
      });

      it("the page has not changed since it was adjudicated", () => {
        const hash = createHash("sha256").update(readFileSync(absPath)).digest("hex");
        if (spec.sha256 === undefined || spec.sha256 === "") {
          // First run records the hash by failing loudly with the value to paste.
          throw new Error(`no sha256 recorded for ${dir}. Paste this into verdicts.json:\n  "sha256": "${hash}"`);
        }
        expect(
          hash,
          `${spec.page} changed since ${dir} was adjudicated — re-adjudicate, then update sha256`,
        ).toBe(spec.sha256);
      });

      it("every verdict row is well formed", () => {
        for (const v of spec.verdicts) {
          expect(v.reason.trim().length, `empty reason for ${v.key}`).toBeGreaterThan(0);
          expect(["tp", "fp", "fp-open"]).toContain(v.verdict);
        }
        // A duplicate key would make one verdict unreachable.
        const keys = spec.verdicts.map((v) => v.key);
        expect(new Set(keys).size, "duplicate verdict keys").toBe(keys.length);
      });

      it("fires exactly what was adjudicated to fire, and nothing unadjudicated", () => {
        const { keys, byKey } = lintPage(absPath);
        const fired = new Set(keys);
        const byVerdict = new Map(spec.verdicts.map((v) => [v.key, v]));

        // 1. Anything firing that nobody judged.
        const unadjudicated = keys.filter((k) => !byVerdict.has(k));
        expect(
          unadjudicated,
          `unadjudicated — triage me. Add a verdict row for each, with a reason:\n` +
            unadjudicated.map((k) => `  { "key": ${JSON.stringify(k)}, "verdict": "tp|fp|fp-open", "reason": "" }   // ${byKey.get(k) ?? ""}`).join("\n"),
        ).toEqual([]);

        // 2. Anything judged real that stopped firing. This is the guard against the
        //    "widen the refusal condition" fix that has cost this repo twice.
        const silenced = spec.verdicts
          .filter((v) => (v.verdict === "tp" || v.verdict === "fp-open") && !fired.has(v.key))
          .map((v) => `${v.key}\n      adjudicated ${v.verdict}: ${v.reason}`);
        expect(
          silenced,
          `a finding that was judged real (or a known-open false positive) stopped firing:\n    ${silenced.join("\n    ")}`,
        ).toEqual([]);

        // 3. Anything judged a fixed false positive that came back.
        const regressed = spec.verdicts
          .filter((v) => v.verdict === "fp" && fired.has(v.key))
          .map((v) => `${v.key}\n      adjudicated fp: ${v.reason}`);
        expect(regressed, `a fixed false positive fired again:\n    ${regressed.join("\n    ")}`).toEqual([]);
      });
    });
  }

  it("reports outstanding false-positive debt", () => {
    // `fp-open` is a false positive that is known, reasoned, and not yet fixed. Counting
    // it is the point: an FP rate nobody measures is an FP rate that drifts upward, and a
    // gate the reader has learned to ignore is not a gate.
    let tp = 0, fpOpen = 0, fpFixed = 0;
    for (const dir of DIRS) {
      const spec = JSON.parse(readFileSync(join(CORPUS, dir, "verdicts.json"), "utf8")) as CorpusPage;
      for (const v of spec.verdicts) {
        if (v.verdict === "tp") tp++;
        else if (v.verdict === "fp-open") fpOpen++;
        else fpFixed++;
      }
    }
    const total = tp + fpOpen + fpFixed;
    // Not a threshold — a visible number. It fails only if the corpus is empty.
    expect(total).toBeGreaterThan(0);
    console.log(
      `field corpus: ${DIRS.length} page(s), ${total} adjudicated findings — ` +
        `${tp} true positive, ${fpOpen} open false positive, ${fpFixed} fixed false positive` +
        (total > 0 ? ` (live FP rate ${((fpOpen / total) * 100).toFixed(1)}%)` : ""),
    );
  });
});
