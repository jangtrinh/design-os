# Routing-accuracy benchmark (manual — never CI)

Measures whether `knowledge/need-routing.md` actually steers a blind model from a stated
user need to the right design:os application. Companion asset: `eval/routing-prompts.json`
(the committed ground-truth prompt set). Results are stateful records, not evergreen
authority — each run lands as a dated report under the maintainer's `plans/reports/`.

## What is measured

83 one-sentence English needs, four categories:

| Category | n | Pass condition | Target |
|---|---|---|---|
| verb | 57 (3 × 19 verbs) | top-1 route verb matches, no question asked | ≥ 85% |
| must-ask | 12 (4 × 3 asks) | the router asks exactly the sanctioned ask (#1 bare audit, #2 keep-or-throw, #3 ambiguous reference) | 100% |
| selection-route | 6 | NO question on taste vagueness; routes to the deliverable's verb (variants offered tracked) | 0 taste interrogations |
| composite | 8 | full capture-then-produce sequence matches, in order | tracked |

## Authorship separation (why the numbers mean something)

- The prompt set is authored by a context-clean agent that sees ONLY the 19 workflow
  frontmatter descriptions plus the three sanctioned-ask definitions — never the routing
  tree itself. Expected routes therefore cannot be tautological with the tree's wording.
- Routers are separate context-clean agents that read ONLY `knowledge/need-routing.md`
  and never see the expected answers.
- Grading is deterministic string comparison in the harness script — no model grades
  itself. Author-vs-router disagreements on an expected route are surfaced in the run
  report for owner adjudication, never silently rescored.

## How to rerun

1. Prompts: reuse `eval/routing-prompts.json` (stable baseline — comparable across runs),
   or re-author a fresh set with the author contract above when the verb registry changes
   (the `routing-verb-uncovered` gate tells you when it has).
2. For each prompt, a context-clean agent (workhorse tier, e.g. Sonnet) receives the
   verbatim text of `knowledge/need-routing.md` and the need sentence, and returns
   `{route: verb[], ask: none|ask-1|ask-2|ask-3, variants: boolean}`. Batching ~10
   prompts per agent is acceptable; instruct the agent to treat each need independently.
3. Grade per the table above; report per-category percentages, every miss with the
   router's actual output, and any prompts rejected at validation (unknown verbs,
   missing expectedAsk).
4. Write the dated report to `plans/reports/eval-<date>-routing-accuracy.md` and record
   the headline numbers there — never in this file.

Cost note: one full run ≈ 10 small agents (1 author + 9 routers). Run on demand after
routing-doctrine edits or new verbs — the parity gate in `ui knowledge check` guarantees
the table covers every verb, but only this benchmark measures whether the doctrine
ROUTES correctly.
