/**
 * Stream parsing utilities — pure, deterministic, no I/O.
 *
 * `stripFences`      — remove ```html / ``` code-fence wrappers from LLM output.
 * `parseJsonStream`  — extract all complete top-level JSON objects from a buffer.
 *
 * NOTE: The year-rewrite step present in the EaseUI source is intentionally
 * omitted here. Rewriting copyright years is non-deterministic (depends on
 * current date) and is not appropriate for a pure transform binary.
 */

// ─── stripFences ─────────────────────────────────────────────────────────────

/**
 * Strip markdown code-fence wrappers that LLMs sometimes emit around HTML.
 *
 * Handles:
 *   - ` ```html ` prefix (with optional leading whitespace after the fence)
 *   - ` ``` ` prefix
 *   - ` ``` ` suffix
 *
 * The prefix checks use `else if` deliberately: a string that starts with
 * ` ```html ` must not also be treated as ` ``` ` (the html suffix would be
 * left behind). This matches EaseUI's original semantics — only one prefix
 * is stripped per invocation.
 *
 * Does NOT rewrite copyright years (non-deterministic — see module note).
 */
export function stripFences(input: string): string {
  let s = input.trim();
  if (s.startsWith("```html")) s = s.substring(7).trimStart();
  else if (s.startsWith("```")) s = s.substring(3).trimStart();
  if (s.endsWith("```")) s = s.substring(0, s.length - 3).trimEnd();
  return s;
}

// ─── parseJsonStream ─────────────────────────────────────────────────────────

export interface JsonStreamResult {
  /** All complete top-level `{...}` objects successfully parsed, in order. */
  objects: Record<string, unknown>[];
  /**
   * Remaining bytes after the last successfully parsed object. May be empty,
   * whitespace, or a partial JSON object.
   */
  remainder: string;
}

/**
 * Parse a buffer containing one or more concatenated JSON objects.
 *
 * Uses a brace-depth scanner to locate complete `{...}` spans, then
 * `JSON.parse` to validate and deserialise each span.
 *
 * Malformed mid-stream spans (brace-balanced but not valid JSON) are
 * **silently discarded** — the scanner skips past the opening brace and
 * continues searching. Only the trailing incomplete span (one that never
 * closes its outermost brace) ends up in `remainder`.
 *
 * This is synchronous and operates on a complete buffer — suitable for a
 * one-shot CLI invocation that has already read all input.
 */
export function parseJsonStream(buffer: string): JsonStreamResult {
  const objects: Record<string, unknown>[] = [];
  let pos = buffer.indexOf("{");

  while (pos !== -1) {
    let depth = 0;
    let end = -1;

    for (let i = pos; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) break; // incomplete object — everything from pos onward is remainder

    const span = buffer.substring(pos, end + 1);
    try {
      const parsed = JSON.parse(span) as Record<string, unknown>;
      objects.push(parsed);
      buffer = buffer.substring(end + 1);
      pos = buffer.indexOf("{");
    } catch {
      // Malformed span — skip past the opening brace and search for next `{`
      buffer = buffer.substring(pos + 1);
      pos = buffer.indexOf("{");
    }
  }

  return { objects, remainder: buffer };
}
