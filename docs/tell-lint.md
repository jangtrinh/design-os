# `ui tell-lint`

Detects **design tells** — involuntary, machine-detectable signs that a surface was
made without design judgment — across every language the extractor registry can
read. AI-generation fingerprints are the salient subclass, not the definition.

```
ui tell-lint <file|dir|glob>...        # HTML, JSX/TSX, Vue/Svelte/Astro, CSS, Swift, Dart
ui tell-lint src/ --render             # also the 7 rules that need a real render
ui tell-lint --coverage                # which rules can run against which extractor
```

## Which family a finding belongs to

| Family | Question it answers |
|---|---|
| `taste` | Was a rubric law broken? |
| `tell` | Was a habit revealed? |
| `a11y` | Does it meet a WCAG floor? |
| `content` | Is the copy wrong, or generated? |

The difference between `taste` and `tell` is not severity — it is whether a stated
rule was violated or a habit was exposed. See `knowledge/design-tells.md`.

## Severity

- `error` — unambiguous: `gradient-text`, `justified-text`, `side-tab`, plus the
  rendered `content-hidden-at-rest`, `broken-image`, `script-error`.
- `advisory` — everything else. **Printed, never counted toward failure.** A tell is
  evidence of inattention, not a defect, so the exit code keys on errors alone.

Exit code is 1 iff an error-severity finding survived.

## What the output tells you it did NOT do

Every run reports its own limits as loudly as its findings. None of these are
decoration — each one exists so a low finding count cannot be mistaken for a
clean page:

| Note | Meaning |
|---|---|
| `UNDERCOUNT` | a line-scanner tier: literals were read, computed values were not |
| `DEGRADED: …` | the document could not be fully parsed |
| `N unresolved read(s)` | values seen but not followable — a theme lookup, a `cn()` call |
| `N rule(s) NOT-EVALUATED` | the extractor cannot supply the facts those rules need |
| `N contrast pair(s) NOT COMPUTABLE` | a background that is a gradient or unresolvable |
| `N waived in-file` | in-file waivers honoured, each with its stated reason |
| `skipped <path>: <reason>` | a path no extractor claims |
| `TRUNCATED` | the walk hit its budget; the note names what was not examined |

## Extractor tiers

| Target | Extractor | Confidence |
|---|---|---|
| `.html` `.htm` | resolved cascade (real selector matching, `var()` resolution, linked local sheets) | `resolved` |
| `.css` `.scss` | declarations only, no DOM | `resolved` (no structure, no text) |
| `.vue` `.svelte` `.astro` | `<style>` through the cascade, template through the scanner | mixed |
| `.jsx` `.tsx` | Tailwind resolver + literal scan | `literal` (structure `heuristic`) |
| `.swift` | SwiftUI line scanner | `literal` (no structure) |
| `.dart` | Flutter line scanner | `literal` (no structure) |
| a rendered page | CDP capture (`--render`) | `rendered` |

`ui tell-lint --coverage` prints the full rule x extractor matrix, naming for each
combination either that it runs or exactly which facts are missing.

## In-file waivers

A reason is mandatory. A directive without one is reported malformed, not honoured.

```
<!-- design-os-disable side-tab -- exported brand doc -->
/* design-os-disable-line overused-font -- client mandate */
// design-os-disable-next-line pulsing-dot -- genuinely live data
```

Scopes: `-disable` waives the file, `-line` the line it sits on, `-next-line` the
one after. Ids are comma-separated, or omitted for every rule. Every waived
finding is counted in the output.

## The rendered tier

`--render` drives a Chrome, Chromium or Edge **already installed on the machine**.
Nothing is downloaded, and there is no npm browser dependency: the CDP client is
stdlib-only. Point it with `--browser <path>`, `$CHROME_PATH`, or
`$PUPPETEER_EXECUTABLE_PATH`.

Findings are stated under their engine — never "the page is broken", always
"broken under Chrome 151 at 1280x800". Without `--render` these seven rules are
NOT-EVALUATED and are never counted as passing.

When no browser is found the tier reports the variable to set. It never installs
one, and it never passes silently.

## The fact census

Every file reports what the reader actually saw — fact counts per kind, and the elements
they came from. Human output prints it whenever a file yields no findings, which is exactly
when it matters: a clean page and a page the reader was blind to otherwise print the
identical zero, and two defects lived in that gap.

```
../vercel/source.html  [html-cascade — resolved cascade]  (UNDERCOUNT; 4 stylesheet(s) NOT LOADED)
  saw 1261 facts across 982 elements — structure 982, text 275, color 4
```

982 elements yielding four colours and no spacing is not a clean page; it is an unread one.
That page links its stylesheets by absolute server paths that do not exist on disk, so an
unresolved sheet now marks the whole run UNDERCOUNT and the sheets are named.

The census is **advisory**. It reports; it never changes the exit code. A failure threshold
will be chosen once there is a measurement of what a normal census looks like, not before.

## How the rules are kept honest

Three instruments, each answering a failure the fixtures could not.

**The field corpus** (`tests/field-corpus/`) pins real pages with a recorded verdict and a
reason per finding. A fix that silences an adjudicated true positive turns the suite red,
naming the finding and quoting the reason someone wrote when they judged it real. A finding
nobody has judged fails as `unadjudicated`. It prints the live false-positive rate on every
run, because an FP rate nobody measures is one that drifts upward — and a gate readers have
learned to ignore has already stopped being a gate.

**The threshold table** (`src/core/tell-thresholds.ts`) holds every number that decides a
verdict, with its owner and provenance. Each is pinned by an executable boundary pair: a
value at the threshold that must stay silent, one past it that must fire. A constant with
neither a pair nor a stated reason fails the meta-test.

**The mutation audit** (`npm run audit:mutation`) mutates rule predicates and reports which
mutants survived — the machine-generated version of "these guards do not guard". It runs
**nightly or on demand, never on a pull request**. As a gate it is slow and noisy on
cosmetic code and would be disabled within a month; as an audit it produces a number that
trends and a list somebody reads on purpose.

Baseline, 2026-08-28: **62.91%** mutation score over the six rule modules — 731 killed, 418
survived, 2m25s. Weakest module `tell-rules-labels.ts` at 46.71%, strongest
`tell-rules-type.ts` at 71.43%.
