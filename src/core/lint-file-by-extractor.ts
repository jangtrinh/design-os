/**
 * One file in, tell findings out — the single dispatch from an extractor id to its reader.
 *
 * This used to live inline in `commands/tell-lint.ts` as three near-identical branches.
 * The field corpus needs the same dispatch, and a second copy would have been worse than
 * duplication: the corpus would silently judge a pipeline that had drifted from the one
 * users actually run, and its verdicts would certify the wrong thing.
 *
 * So it moves to the shared layer, per the repo's own rule — when a second consumer needs
 * a behavior, extract it rather than patching it where it surfaced.
 */
import { readFileSync } from "node:fs";
import { extractHtml } from "./extractors/html/html-extractor.js";
import { extractSwiftUi } from "./extractors/native/swiftui-extractor.js";
import { extractFlutter } from "./extractors/native/flutter-extractor.js";
import { extractJsx } from "./extractors/web/jsx-extractor.js";
import { extractSfc, extractCssOnly } from "./extractors/web/sfc-extractor.js";
import { lintTell, TELL_RULES } from "./tell-lint.js";
import type { TellFinding } from "./tell-rules.js";
import type { ExtractorProfile } from "./design-facts/extractor-registry.js";
import { scanInlineIgnores, applyInlineIgnores } from "./inline-ignores.js";

/**
 * What the engine actually saw, per fact kind.
 *
 * `0 findings` from a page the reader was blind to looks exactly like `0 findings`
 * from a clean page. Two defects on this branch survived in precisely that gap: the
 * engine saw nothing and said nothing. The census is the repo's own "a zero is a
 * claim" rule turned on the engine's own input — `1400 elements, 0 color facts` is a
 * self-evident red flag, and no debugger is needed to see it.
 *
 * Advisory. It reports; it does not change the exit code. Choosing a failure threshold
 * before measuring what a normal census looks like would be the same guess this whole
 * instrument exists to replace.
 */
export interface FactCensus {
  /** Fact count per kind, kinds with zero facts omitted. */
  byKind: Record<string, number>;
  /** Total facts the collector accepted. */
  total: number;
  /** Distinct elements the reader attributed facts to — 0 for tiers with no DOM. */
  nodes: number;
}

export interface FileLintResult {
  findings: TellFinding[];
  notEvaluated: Array<{ id: string; reason: string }>;
  unresolvedCount: number;
  waived: number;
  notComputable: number;
  /** True when the reader cannot see the whole cascade, so absence proves nothing. */
  undercount: boolean;
  degraded?: string;
  census: FactCensus;
  /**
   * `<link rel=stylesheet>` hrefs the reader could not open.
   *
   * A page whose stylesheets all failed to load produces no findings for the same
   * reason a blank page does, and the two must not print alike. The census found this
   * on a real Vercel export: 982 elements, 4 colour facts, 0 spacing, 0 typography —
   * and `undercount: false`, because `extractHtml` had always returned this list and
   * no caller had ever read it.
   */
  unresolvedSheets: string[];
}

function censusOf(facts: readonly { kind: string; at: { nodeRef?: string } }[]): FactCensus {
  const byKind: Record<string, number> = {};
  const nodes = new Set<string>();
  for (const f of facts) {
    byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
    if (f.at.nodeRef !== undefined) nodes.add(f.at.nodeRef);
  }
  return { byKind, total: facts.length, nodes: nodes.size };
}

/** Extractor ids that have a reader. Anything else is reported NOT ANALYSED, never clean. */
const SOURCE_READERS = new Set(["html-cascade", "swiftui", "flutter", "jsx-tailwind", "sfc", "css-only"]);

export function hasReader(extractorId: string): boolean {
  return SOURCE_READERS.has(extractorId);
}

/**
 * Lint one file with the reader its extractor id names.
 *
 * An id with no reader yet returns every rule as NOT-EVALUATED rather than an empty
 * finding list — a file nobody could read is not a file that passed.
 */
export function lintFileByExtractor(
  path: string,
  extractorId: string,
  profile: ExtractorProfile,
): FileLintResult {
  if (!SOURCE_READERS.has(extractorId)) {
    return {
      findings: [],
      notEvaluated: TELL_RULES.map((r) => ({ id: r.id, reason: `${extractorId} extractor not implemented yet` })),
      unresolvedCount: 0,
      waived: 0,
      notComputable: 0,
      undercount: true,
      census: { byKind: {}, total: 0, nodes: 0 },
      unresolvedSheets: [],
    };
  }

  const src = readFileSync(path, "utf8");

  if (extractorId === "html-cascade") {
    const extraction = extractHtml(src, path);
    const htmlFacts = extraction.collector.facts();
    const result = lintTell(htmlFacts, profile);
    const { kept, waived } = applyInlineIgnores(result.findings, scanInlineIgnores(src));
    return {
      // Contrast and voice run only on the resolved cascade; the other readers cannot
      // resolve a background, and a guess there is worse than an admitted gap.
      findings: [...kept, ...result.contrast, ...result.content] as TellFinding[],
      notEvaluated: result.notEvaluated,
      unresolvedCount: extraction.collector.unresolvedCount,
      waived: waived.length,
      notComputable: result.contrastNotComputable.length,
      // A stylesheet the reader could not open makes the whole run an undercount.
      // Absence of CSS means absence of findings proves nothing — the same rule the
      // NOT-EVALUATED contract applies to rules, applied to the engine's own input.
      undercount: extraction.degraded || extraction.unresolvedSheets.length > 0,
      degraded: extraction.degraded ? extraction.degradeReason : undefined,
      census: censusOf(htmlFacts),
      unresolvedSheets: [...extraction.unresolvedSheets],
    };
  }

  const ex =
    extractorId === "swiftui" ? extractSwiftUi(src, path)
      : extractorId === "flutter" ? extractFlutter(src, path)
        : extractorId === "jsx-tailwind" ? extractJsx(src, path)
          : extractorId === "sfc" ? extractSfc(src, path)
            : extractCssOnly(src, path);

  const exFacts = ex.collector.facts();
  const result = lintTell(exFacts, profile);
  const { kept, waived } = applyInlineIgnores(result.findings, scanInlineIgnores(src));
  return {
    // The content half rides along here too. Dropping it was silent: a SwiftUI file
    // with three voice findings returned none, while `check-catalog.ts` promises these
    // rules "read Swift and Dart too". Contrast is deliberately absent — it needs a
    // resolved background, which no reader below the cascade has.
    findings: [...kept, ...result.content] as TellFinding[],
    notEvaluated: result.notEvaluated,
    unresolvedCount: ex.collector.unresolvedCount,
    waived: waived.length,
    notComputable: 0,
    // Every source reader below the cascade sees declarations, not resolved values.
    undercount: true,
    census: censusOf(exFacts),
    unresolvedSheets: [],
  };
}
