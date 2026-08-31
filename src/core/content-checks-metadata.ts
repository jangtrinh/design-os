/**
 * The scaffolding tell: a generation prompt shipped in the page's `<title>`.
 *
 * `content-checks-voice.ts` owns copy that is *generated* — the buzzword stack, the
 * em-dash habit. Those are habits, they are advisory, and they are arguable. This is
 * not: a prompt in the `<title>` has no intentional reading. It is the lorem-ipsum
 * class — scaffolding that was supposed to be replaced and was not — plus a leak,
 * because the `<title>` is the browser tab, the search result and the social card, and
 * the prompt that lands there names internal paths.
 *
 * The voice checks and this one are exact complements: they EXCLUDE `role: "metadata"`
 * because a title is not copy anyone reads, and this one reads nothing else.
 *
 * WHY THE THRESHOLD IS FREE. Measured across 747 real HTML pages (ease-design
 * showcase/site/examples/corpus, EaseUI, design-starter-lab, dana, hvs), 699 of which
 * carry a `<title>`:
 *
 *     chars      pages
 *     0–40         321
 *     40–70        260
 *     70–120        17
 *     120–200        0
 *     200–400        0
 *     400–1000       0
 *     >1000        101      (9 distinct titles, all one generator family)
 *
 * Median 43. The distribution is bimodal with an 880-character hole in it, so the
 * number is not a taste call — anything in roughly 150–900 classifies this corpus
 * identically. 200 sits near the legitimate side, well past the longest real title
 * seen (120) and past what a search result will even display (~60), which leaves the
 * most room to catch a shorter leak than the one we happen to have.
 *
 * DELIBERATELY LENGTH ONLY. Matching prompt-shaped markers — `[var-N]`, "Reference
 * the", a path fragment — would be more precise about the nine titles in front of us
 * and would overfit to one generator's phrasing. Length generalises to any generator
 * that makes this mistake, which is the audience a shared linter has. If a leak ever
 * appears UNDER 200 characters, that is the trigger to add markers, not before.
 */
import type { DesignFact } from "./design-facts/index.js";
import type { FloorFindingBase } from "./finding-schema.js";
import { thr } from "./tell-thresholds.js";
import { forTerminal } from "./output.js";

export type MetadataFinding = FloorFindingBase;

export function checkPromptLeakMetadata(facts: readonly DesignFact[]): MetadataFinding[] {
  const limit = thr("METADATA_MAX_CHARS");
  const out: MetadataFinding[] = [];
  for (const f of facts) {
    if (f.kind !== "text" || f.role !== "metadata") continue;
    if (f.content.length <= limit) continue;
    out.push({
      checkId: "prompt-leak-metadata",
      // Error, like `lorem-ipsum` and `placeholder-copy` — the other content checks
      // that catch scaffolding shipped by accident. A TELL is evidence of inattention
      // and prints without failing a build; this is not a tell. It is a brief on the
      // surface the reader, the crawler and the social card all see.
      severity: "error",
      message: `${f.content.length} characters of document metadata — a title this long is a prompt or a note that was never replaced`,
      line: f.at.line,
      expected: "a title a reader could read",
      // The quote is page-controlled text and rides into `--json` and into the field
      // corpus key. `emitText` normalises whitespace, and ESC is not whitespace.
      actual: `${f.content.length} characters starting "${forTerminal(f.content.slice(0, 60), 60)}"`,
      fixHint: "replace the title with the page's own name; the generation brief does not ship",
    });
  }
  return out;
}
