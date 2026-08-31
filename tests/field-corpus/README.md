# The field corpus

Real pages. Every finding carries a recorded verdict and a reason.

## Why this exists

A fixture states the rule author's model of the world. It catches drift away from that
model and, structurally, never an error *inside* it. Measured on this branch:

| | |
|---|---|
| Substantive defects found by real data | **8** |
| Substantive defects found by the 4,000-test fixture suite | **0** |
| Red probes fired deliberately | 63+ |
| Probes that came back green (a guard that did not guard) | 13 |
| Times a precision fix silenced findings that were real | 2 |

The first page adjudicated here found a bug that 4,038 tests missed: `tight-leading` read
`(t.sizePx ?? 16) <= 20`, substituting 16 for an unresolvable `clamp()` size and then
reporting a 94px headline as *"line-height 0.93 on 16px body copy"*. Three false positives
from one silent substitution.

That is the whole argument. This corpus is where a wrong verdict fails loudly instead of
shipping.

## What the runner asserts

`tests/field-corpus.test.ts`, for every page:

1. The page still exists and **its content hash is unchanged** since adjudication.
2. Every finding that fires has a verdict row. One that does not fails as
   `unadjudicated — triage me`, printing a paste-ready row.
3. Every `tp` still fires. **This is the guard against widening a refusal condition** —
   the failure names the finding and quotes the reason someone wrote when they judged it real.
4. Every `fp` stays silent. A fixed false positive that returns fails.

## Verdict values

| Verdict | Meaning | Runner asserts |
|---|---|---|
| `tp` | A real defect. The rule is right. | it still fires |
| `fp` | A false positive, **fixed**. | it stays silent |
| `fp-open` | A false positive, **known and reasoned, not yet fixed**. | it still fires, and it is counted as FP debt |

`fp-open` exists so that a known false positive is neither invisible nor blocking. The
runner prints the live FP rate on every run. An FP rate nobody measures is one that drifts
upward, and a gate readers have learned to ignore has already stopped being a gate.

## Adding a page

1. Run the linter on it and read every finding.
2. Create `tests/field-corpus/<slug>/verdicts.json`.
3. For an **in-repo** page use `"pinnedBy": "repo-path"` with the repo-relative path. For an
   **external** page, snapshot it and its CSS into the directory and use `"pinnedBy": "snapshot"`.
   In-repo pages are referenced rather than copied: a copy silently diverges from the real
   page, where a hash mismatch fails loudly and asks for re-adjudication.
4. Leave `"sha256": ""`. The first run fails and prints the hash to paste in.
5. Give **every** finding a verdict and a non-empty reason. Run until green.

## The rule about verdicts

**A verdict change is a reviewable diff and must carry its reason.** The corpus rots the
moment verdicts get blessed instead of adjudicated — at which point it is a snapshot test
that ratifies bugs. If you are changing a verdict, say why in the `reason` field, in the
same commit.

## Coverage

Coverage is **registry-driven**: the test reads `EXTRACTOR_PROFILES` and fails by name for
any profile with neither a corpus page nor a waiver. A hand-kept list would go stale the
moment someone adds a ninth extractor, and the blind spot would arrive silently.

| Profile | Status |
|---|---|
| `html-cascade` | covered — `showcase/.../d03-orchestrated-r2/index.html` |
| `css-only` | covered — `site/deck.css` |
| `jsx-tailwind` | covered — snapshot of real dana-ui React |
| `swiftui` | covered — snapshot of real AgentTour SwiftUI (clean row) |
| `sfc`, `flutter`, `figma-nodes`, `rendered-cdp` | waived, with evidence, in `coverage-waivers.json` |

`sfc` and `flutter` are waived for an honest reason worth stating plainly: **no real Vue,
Svelte or Dart source exists on this machine.** The only candidates were fixtures this repo
wrote itself, and adjudicating our own fixture would make the corpus circular — it would
encode the author's model, which is the exact thing the corpus exists to escape. Both
extractors are nonetheless proven working: each fires 6 findings on its slop fixture.

The corpus also asserts that **both severity tiers are exercised**. A corpus made only of
advisory findings cannot guard the tier that actually fails the gate.

## What the numbers do and do not mean

The runner prints a line like:

```
field corpus: 9 page(s), 42 adjudicated findings — 34 true positive, 8 open false positive,
0 fixed false positive (live FP rate 19.0%)
```

**The FP rate is not the health number.** A binomial interval on 8/42 is roughly 9–33%; fifty
more verdicts would still leave it ±8 points. Worse, an *unconditional* FP rate mostly measures
the page mix — add slop pages and it falls, add impeccable pages and it rises. It rose from 9.7%
to 19.0% when this corpus grew, and that is not a regression.

Three numbers do matter:

**1. Rule coverage — `20/43` tell rules have at least one adjudicated firing.**
A rule with zero corpus firings has no drift guard at all: it can break and nothing goes red.
This is the number to drive up. Of the 23 unguarded, **7 are `rendered-cdp`-only** (they need a
live browser, so they are not corpus-guardable until captures are pinned) — leaving **16
realistically guardable**. The corpus also guards 4 adjacent checks that ride along in `lintTell`
but keep their own family: `low-contrast`, `em-dash-overuse`, `marketing-buzzword`,
`theater-slop-phrase`.

**2. The `fp-open` list is a debt register, not a score.** Each one is a concrete, fixable work
item and — once fixed and flipped to `fp` — a permanent regression tripwire. Read them; they are
the most useful thing in this directory.

**3. Precision on impeccable, human-authored pages.** The tell family claims to detect generated
slop. Its fatal failure is flagging a good designer's deliberate choice. FP rate *conditional on
page quality* is the trustworthy-product number; that is why owner-authored EaseUI and
jang-personal-site pages have slots here.

Any **recall** computed on this corpus is a lower bound, never an accuracy score. Do not quote it
as accuracy.

## Owner review

Rows carrying `"needsOwnerReview": true` were adjudicated by the rule author on pages the *owner*
wrote. On his own work his verdicts are ground truth and mine are provisional — the corpus exists
to escape the author's own model of the world, and an author grading his own detector against his
own taste is the circularity in a new hat. Review every `fp-open` first; they are the claims most
likely to be wrong.
