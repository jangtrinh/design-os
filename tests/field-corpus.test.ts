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
import { lintFileByExtractor } from "../src/core/lint-file-by-extractor.js";
import type { FactCensus } from "../src/core/lint-file-by-extractor.js";
import { extractorById, EXTRACTOR_PROFILES } from "../src/core/design-facts/index.js";
import { withOrdinals } from "./helpers/finding-key.js";

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
  /** What the engine saw at adjudication time. A floor, never an equality. */
  censusFloor?: { total: number; kinds: string[] };
  verdicts: VerdictRow[];
}

// The verdict key and its ordinal disambiguation live in one shared place —
// `tests/helpers/finding-key.ts` — because the metamorphic laws need the SAME
// notion of "the same finding". Two copies of an identity function drift, and the
// drift would surface as a law and this corpus disagreeing about what they mean.

function pageDirs(): string[] {
  if (!existsSync(CORPUS)) return [];
  return readdirSync(CORPUS).filter((d) => {
    const p = join(CORPUS, d);
    return statSync(p).isDirectory() && existsSync(join(p, "verdicts.json"));
  });
}

const DIRS = pageDirs();

/**
 * Run exactly the pipeline `ui tell-lint` runs.
 *
 * Via the shared dispatch, not a copy of it: a second copy would let the corpus drift
 * into judging a pipeline users do not run, and its verdicts would then certify the
 * wrong thing.
 */
function lintPage(absPath: string, extractorId: string): {
  keys: string[]; byKey: Map<string, string>; severities: string[]; census: FactCensus;
} {
  const profile = extractorById(extractorId);
  if (profile === undefined) throw new Error(`extractor profile is not registered: ${extractorId}`);
  const result = lintFileByExtractor(absPath, extractorId, profile);
  const all = result.findings as unknown as Array<{
    checkId: string; line?: number; nodeRef?: string; actual?: string; message: string; severity: string;
  }>;
  const keys = withOrdinals(all);
  const byKey = new Map<string, string>();
  keys.forEach((k, i) => byKey.set(k, all[i]?.message ?? ""));
  return { keys, byKey, severities: all.map((f) => f.severity), census: result.census };
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

      it("the engine still sees what it saw when this page was adjudicated", () => {
        // A page can keep producing the same findings while the reader quietly goes
        // blind on a whole fact kind — a rule that needed `spacing` simply stops
        // running, and NOT-EVALUATED absorbs it. Pinning the census catches that.
        //
        // A FLOOR, not an equality: the question is "did the engine still see this
        // much", not "exactly how much". Exact counts would redden on every unrelated
        // edit and the row would be deleted within a week.
        const { census } = lintPage(absPath, spec.extractor);
        if (spec.censusFloor === undefined) {
          throw new Error(
            `no censusFloor recorded for ${dir}. Paste this into verdicts.json:\n` +
              `  "censusFloor": { "total": ${census.total}, "kinds": ${JSON.stringify(Object.keys(census.byKind).sort())} }`,
          );
        }
        expect(census.total, `${dir}: the engine now sees fewer facts than when it was adjudicated`)
          .toBeGreaterThanOrEqual(spec.censusFloor.total);
        const missing = spec.censusFloor.kinds.filter((k) => !(k in census.byKind));
        expect(missing, `${dir}: the reader went blind on fact kind(s) it used to see`).toEqual([]);
      });

      it("fires exactly what was adjudicated to fire, and nothing unadjudicated", () => {
        const { keys, byKey } = lintPage(absPath, spec.extractor);
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

  it("covers every extractor profile, or names the gap", () => {
    // Registry-driven on purpose. A hand-kept list of profiles goes stale the moment
    // someone adds a ninth extractor, and the blind spot arrives silently.
    const covered = new Set(
      DIRS.map((d) => (JSON.parse(readFileSync(join(CORPUS, d, "verdicts.json"), "utf8")) as CorpusPage).extractor),
    );
    const waivers = JSON.parse(readFileSync(join(CORPUS, "coverage-waivers.json"), "utf8")) as {
      waivers: Array<{ extractor: string; reason: string; evidence: string }>;
    };
    for (const w of waivers.waivers) {
      expect(w.reason.trim().length, `waiver for ${w.extractor} has no reason`).toBeGreaterThan(0);
      expect(w.evidence.trim().length, `waiver for ${w.extractor} has no evidence`).toBeGreaterThan(0);
    }
    const waived = new Set(waivers.waivers.map((w) => w.extractor));

    const uncovered = EXTRACTOR_PROFILES.map((p) => p.id).filter((id) => !covered.has(id) && !waived.has(id));
    expect(
      uncovered,
      `extractor profile with neither a corpus page nor a waiver — add one, or record why not:\n  ${uncovered.join("\n  ")}`,
    ).toEqual([]);
  });

  it("exercises every severity tier the family can emit", () => {
    // A corpus made only of advisory findings cannot guard the tier that actually
    // fails the gate. Measured across 86 real findings: 76 advisory, 10 error.
    const seen = new Set<string>();
    for (const dir of DIRS) {
      const spec = JSON.parse(readFileSync(join(CORPUS, dir, "verdicts.json"), "utf8")) as CorpusPage;
      const abs = spec.pinnedBy === "repo-path" ? join(ROOT, spec.page) : join(CORPUS, dir, spec.page);
      if (!existsSync(abs)) continue;
      for (const s of lintPage(abs, spec.extractor).severities) seen.add(s);
    }
    expect([...seen].sort(), "the corpus never exercises error severity").toContain("error");
    expect([...seen].sort()).toContain("advisory");
  });

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
