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

export interface FileLintResult {
  findings: TellFinding[];
  notEvaluated: Array<{ id: string; reason: string }>;
  unresolvedCount: number;
  waived: number;
  notComputable: number;
  /** True when the reader cannot see the whole cascade, so absence proves nothing. */
  undercount: boolean;
  degraded?: string;
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
    };
  }

  const src = readFileSync(path, "utf8");

  if (extractorId === "html-cascade") {
    const extraction = extractHtml(src, path);
    const result = lintTell(extraction.collector.facts(), profile);
    const { kept, waived } = applyInlineIgnores(result.findings, scanInlineIgnores(src));
    return {
      // Contrast and voice run only on the resolved cascade; the other readers cannot
      // resolve a background, and a guess there is worse than an admitted gap.
      findings: [...kept, ...result.contrast, ...result.voice] as TellFinding[],
      notEvaluated: result.notEvaluated,
      unresolvedCount: extraction.collector.unresolvedCount,
      waived: waived.length,
      notComputable: result.contrastNotComputable.length,
      undercount: extraction.degraded,
      degraded: extraction.degraded ? extraction.degradeReason : undefined,
    };
  }

  const ex =
    extractorId === "swiftui" ? extractSwiftUi(src, path)
      : extractorId === "flutter" ? extractFlutter(src, path)
        : extractorId === "jsx-tailwind" ? extractJsx(src, path)
          : extractorId === "sfc" ? extractSfc(src, path)
            : extractCssOnly(src, path);

  const result = lintTell(ex.collector.facts(), profile);
  const { kept, waived } = applyInlineIgnores(result.findings, scanInlineIgnores(src));
  return {
    findings: kept as TellFinding[],
    notEvaluated: result.notEvaluated,
    unresolvedCount: ex.collector.unresolvedCount,
    waived: waived.length,
    notComputable: 0,
    // Every source reader below the cascade sees declarations, not resolved values.
    undercount: true,
  };
}
