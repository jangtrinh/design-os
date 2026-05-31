/**
 * Edit-strategy selection and line-number diff logic.
 *
 * Three strategies, ordered by preference:
 *   1. deterministic — simple pattern-based edits (color/text swaps)
 *   2. ln_diff       — LLM produces a line-number diff; we apply it here
 *   3. full_regen    — complete regeneration (always works, most expensive)
 *
 * ln-diff wire format:
 *   @@ line 45-47 @@
 *   - <old line>
 *   + <new line>
 *     <context line>   (two-space prefix → copied to both old and new)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditStrategy = "deterministic" | "ln_diff" | "full_regen";

export interface LnDiffChunk {
  startLine: number;
  endLine: number;
  oldLines: string[];
  newLines: string[];
}

// ─── Strategy selection ───────────────────────────────────────────────────────

/** Patterns that indicate a small, directly-pattern-matchable edit. */
const DETERMINISTIC_PATTERNS = [
  /(?:change|make|set)\s+(?:the\s+)?(?:color|background|bg)\s+(?:to|=)\s+/i,
  /(?:change|update|replace)\s+(?:the\s+)?(?:text|title|heading|label)\s+(?:to\s+)?"[^"]{1,80}"/i,
];

/** Patterns that indicate a large structural change — skip ln-diff entirely. */
const FULL_REGEN_PATTERNS = [
  /(?:completely|entirely|whole|all|redesign|rebuild|restructure|from\s+scratch)/i,
  /(?:new\s+layout|different\s+structure|rethink|overhaul)/i,
];

/**
 * Choose the best edit strategy for a change request.
 *
 * - `deterministic` if the request matches a simple color/text pattern.
 * - `full_regen` if the request signals a major structural change.
 * - `ln_diff` otherwise (default for moderate edits).
 */
export function selectEditStrategy(changeRequest: string): EditStrategy {
  for (const pat of DETERMINISTIC_PATTERNS) {
    if (pat.test(changeRequest)) return "deterministic";
  }
  for (const pat of FULL_REGEN_PATTERNS) {
    if (pat.test(changeRequest)) return "full_regen";
  }
  return "ln_diff";
}

// ─── Line numbering ───────────────────────────────────────────────────────────

/**
 * Prefix every line with a right-aligned line number.
 * Format: `"   1| <content>"` — pad width is the digit count of the last line.
 */
export function addLineNumbers(html: string): string {
  const lines = html.split("\n");
  const pad = String(lines.length).length;
  return lines
    .map((line, i) => `${String(i + 1).padStart(pad)}| ${line}`)
    .join("\n");
}

// ─── LN-diff parser ───────────────────────────────────────────────────────────

/**
 * Parse a ln-diff string into structured chunks.
 *
 * Recognises:
 *   `- ` prefix → old line (removed)
 *   `+ ` prefix → new line (added)
 *   `  ` prefix → context line (present in both old and new)
 *
 * Returns an empty array on garbage input — never throws.
 */
export function parseLnDiff(diffOutput: string): LnDiffChunk[] {
  const chunks: LnDiffChunk[] = [];
  const chunkPattern =
    /@@\s*line\s+(\d+)(?:\s*-\s*(\d+))?\s*@@\n([\s\S]*?)(?=(?:@@\s*line)|$)/g;

  let match: RegExpExecArray | null;
  while ((match = chunkPattern.exec(diffOutput)) !== null) {
    const startLine = parseInt(match[1] ?? "0", 10);
    const endLine = match[2] !== undefined ? parseInt(match[2], 10) : startLine;
    const body = (match[3] ?? "").trimEnd();

    const oldLines: string[] = [];
    const newLines: string[] = [];

    for (const line of body.split("\n")) {
      if (line.startsWith("- ")) {
        oldLines.push(line.slice(2));
      } else if (line.startsWith("+ ")) {
        newLines.push(line.slice(2));
      } else if (line.startsWith("  ")) {
        // Context line — present in both old and new
        oldLines.push(line.slice(2));
        newLines.push(line.slice(2));
      }
    }

    if (oldLines.length > 0 || newLines.length > 0) {
      chunks.push({ startLine, endLine, oldLines, newLines });
    }
  }

  return chunks;
}

// ─── LN-diff application ──────────────────────────────────────────────────────

const FUZZY_RANGE = 5;

/**
 * Apply ln-diff chunks to an HTML string.
 *
 * - Chunks are applied bottom-up so earlier line numbers stay valid.
 * - Each chunk first attempts an exact match at `startLine`; if that fails,
 *   searches ±5 lines (fuzzy match).
 * - Returns `null` if any chunk cannot be matched — the caller should fall
 *   back to full regeneration.
 * - Returns `null` immediately if `chunks` is empty.
 */
export function applyLnDiff(html: string, chunks: LnDiffChunk[]): string | null {
  if (chunks.length === 0) return null;

  const lines = html.split("\n");
  // Bottom-up: largest startLine first preserves validity of earlier positions.
  const sorted = [...chunks].sort((a, b) => b.startLine - a.startLine);

  for (const chunk of sorted) {
    const start = chunk.startLine - 1; // convert to 0-indexed
    const end = chunk.endLine;         // exclusive splice end

    // Exact match
    const slice = lines.slice(start, end);
    const exactMatch =
      chunk.oldLines.length > 0 &&
      chunk.oldLines.every((old, i) => slice[i]?.trim() === old.trim());

    if (exactMatch) {
      // Splice exactly the verified lines (oldLines.length), NOT the header
      // range (end - start). Models routinely emit a wide `@@ line a-b @@`
      // header while quoting fewer old lines; splicing the header width would
      // silently delete the unverified trailing lines. This mirrors the fuzzy
      // path below, keeping both branches consistent.
      lines.splice(start, chunk.oldLines.length, ...chunk.newLines);
      continue;
    }

    // Fuzzy match within ±FUZZY_RANGE lines
    const searchStart = Math.max(0, start - FUZZY_RANGE);
    const searchEnd = Math.min(lines.length, end + FUZZY_RANGE);
    let found = false;

    for (let i = searchStart; i < searchEnd; i++) {
      const candidate = lines.slice(i, i + chunk.oldLines.length);
      if (
        chunk.oldLines.length > 0 &&
        chunk.oldLines.every((old, j) => candidate[j]?.trim() === old.trim())
      ) {
        lines.splice(i, chunk.oldLines.length, ...chunk.newLines);
        found = true;
        break;
      }
    }

    if (!found) return null;
  }

  return lines.join("\n");
}
