# Stage 5 — Codex (GPT-5) cross-model review — VERBATIM

**Run:** `CMUX_CODEX_HOOKS_DISABLED=1 codex exec --sandbox read-only --skip-git-repo-check`
**Model:** gpt-5.6-sol · **codex-cli** 0.144.6 · exit 0 · 119,824 tokens
**Session:** 019f9a30-0eda-7f53-ac6a-98105c8e36ab · **Date:** 2026-07-25
**Inputs given:** prior Opus report, Fable Stage-1, Opus Stage-2 draft, MengTo clone @21b278c, ease-design.
**Owner media steering was included verbatim in the prompt.**

Everything between the markers is Codex's unedited stdout. No paraphrase.

<!-- BEGIN VERBATIM CODEX OUTPUT -->

VERDICT: BLOCKER

CONFIRMED findings

1. **BLOCKER** · `/private/tmp/mengto-opus-draft.md:173` · The pilot is internally impossible as specified. I checked §G’s arithmetic and protocol against `specs/018-improving-proof-benchmark/benchmark-contract.md:31-50`. Four tranches × six pairs requires 24 pairs and 48 renders, not “12 renders” (`:216`). Twelve renders provide only six pairs total. Further, treatment adds an entire tranche—three candidates in T1/T2, four in T3, two in T4—while claiming “exactly one variable” (`:197-200`). A win therefore cannot be attributed to any candidate, and interactions within a tranche remain confounded. Action: redesign as a screening experiment followed by candidate-level confirmation. Use one candidate patch per arm-pair, multiple briefs per candidate, and separately preregister family-level and candidate-level decisions. Recalculate render count and cost honestly.

2. **BLOCKER** · `/private/tmp/mengto-opus-draft.md:157` · The media architecture violates Article I despite §A claiming all invariants hold. The draft places network-facing `search()` and `resolve()` implementations for Unsplash, ImageGen, and stock providers under `src/adapters/` (`:165-168`). The constitution makes the binary a zero-network, zero-model-call, zero-runtime-dependency kernel (`.specify/memory/constitution.md:6-14`), while existing doctrine explicitly says host-side tools acquire assets and the binary never fetches or generates them (`knowledge/generation-craft-defaults.md:30-52`). It also duplicates the proposed role/ratio doctrine into code, contrary to Article I.1. Action: keep provider adapters in generated runtime-specific host workflows/plugins, outside `src/` and outside the published deterministic kernel. Let `ui` validate a provider-neutral manifest only.

3. **HIGH** · `/private/tmp/mengto-opus-draft.md:29` · The “55/79 negative-constraint” count does not reproduce. I enumerated the 79 `agent-skills/web-design/*/SKILL.md` files and matched section headings with:

   `node -e '... /^##+\\s+Avoid\\b/im ... Common pitfalls ... Guardrails ... Taste Rules ...'`

   Actual counts were `Avoid=37`, `Common pitfalls=12`, `Guardrails=6`, `Taste Rules=8`, with **61 unique files**, not 55. The draft’s `Common pitfalls ×10` is also wrong, and its four category totals overlap. Action: replace the claim with the exact matching definition, unique count of 61, per-heading counts, and overlap disclosure.

4. **HIGH** · `/private/tmp/mengto-opus-draft.md:30` · The size distribution does not reproduce. Command:

   `find .../agent-skills/web-design -mindepth 2 -maxdepth 2 -name SKILL.md -exec wc -l {} + | sort -n`

   Actual nearest-rank results are `n=79`, `min=20`, **median=72**, **p75=153**, `max=617`; not median 71/p75 145. The 52–55 cluster contains **23**, not 24, files (`:210`). Conventional interpolated p75 is about 149, still not 145. Action: publish the percentile definition and corrected values.

5. **HIGH** · `/private/tmp/mengto-opus-draft.md:125` · “0 aspect-ratio-token hits across the entire tree” is literally false. Command:

   `rg -n -i -e '1:1|4:5|3:4|16:9|9:16' knowledge`

   produced four hits:

   - `knowledge/figma-craft/visual-craft.md:36`
   - `knowledge/figma-craft/layout-mastery.md:294`
   - `knowledge/figma-agent-hand.md:126`
   - `knowledge/color-science.md:60`

   These are incidental rather than media-role prescriptions, so the substantive gap is real but the measurement is not. Action: say “zero role-to-aspect media contracts,” and use a semantic search scoped to asset/media language.

6. **HIGH** · `/private/tmp/mengto-opus-draft.md:96` · The GSAP numeric claim is materially misstated. `rg -n '[0-9]' knowledge/gsap-motion-direction.md` returned headings plus concrete settings at `:71, :79, :82-83`, including breakpoint 768, duration 0.7, y 28, scale 0.96, and offset 0.12. It is not “2 numeric lines total.” `rg -n -i '\\blenis\\b' knowledge` did correctly return zero hits. Action: characterize the narrower gap accurately: limited GSAP calibration and no Lenis doctrine, not an almost value-free file.

7. **HIGH** · `/private/tmp/mengto-opus-draft.md:103` · Cutting DNS/private-address/redirect guards is unsafe. `templates/workflows/from-url.md:67-95` tells a host to fetch an arbitrary user URL and every linked stylesheet, including via `curl`; “human initiated” does not prevent a supplied URL from targeting loopback, cloud metadata, or private services. MengTo’s implementation checks HTTPS, credentials, ports, allowlists, loopback/private/ULA addresses, DNS resolution, and redirects (`scripts/sync-neuform-skill-demos.mjs:223-260`). Action: retain scheme validation, DNS/private-range rejection, redirect revalidation, response-size/type caps, and credential stripping at the host-fetch layer. A global domain allowlist is unsuitable for arbitrary from-URL work and may be omitted or made policy-configurable, but SSRF guards should not be dropped.

8. **HIGH** · `/private/tmp/mengto-opus-draft.md:103` · The CSP preview is not hypothetical. `templates/workflows/from-url.md:282-304` always creates `DESIGN.preview.html` from fetched `source.html` and deliberately allows remote images/fonts after URL absolutization. Therefore the proposed “only if inventory shows a path” condition is already satisfied. Hash verification proves integrity, not safety; it can faithfully verify malicious bytes. Action: require a tested sandbox/CSP/sanitization contract for the existing preview path. Do not assume CSP alone is complete—test event handlers, iframe/object/embed, navigation, forms, remote subresources, and script stripping.

9. **HIGH** · `/private/tmp/mengto-opus-draft.md:157` · The media proposal overstates what the two source files support and makes context-specific constants into global failures. The actual media skills contain a short generic ratio/crop table (`aura.../SKILL.md:36-44`; `unsplash.../SKILL.md:23-29,102-111`) plus curated URLs. They do support role-aware crops, basic narrative register, resolution variants, and simple fallback. They do **not** provide a substantive generated-vs-sourced decision method, lighting framework, provenance manifest, or robust per-role selection rubric. A hard `hero-background 1:1 fails` rule also ignores responsive art direction, art-directed square heroes, and source-set crops. Action: adopt provider-neutral host guidance for `role`, intended placement, focal point, crop variants, safe areas, licence, provenance, and generated-vs-sourced reasoning. Treat ratios and 30–50% reserve as candidate heuristics, not universal linter errors. Validate rendered focal/text safety at 390/768/1440 rather than file ratio alone.

10. **HIGH** · `/private/tmp/mengto-opus-draft.md:18` · “Art II holds in every proposal” is false. Several proposed standards are pure knowledge edits: tuning knobs/boundary sentences (`:79-81`), invariant/variant language (`:85`), similarity dial/protected elements (`:88-94`), and genre timing DNA (`:96-100`). Article II says a convention ships with an emitter and a linter (`.specify/memory/constitution.md:16-22`). The draft explains neither what emits these structures nor what deterministic check detects absence/malformed scope. Action: distinguish non-normative guidance from enforceable standards. For normative persona fields, add schema/index emission and structural checks; do not pretend subjective quality or “four changed elements” can be deterministically verified.

11. **HIGH** · `/private/tmp/mengto-opus-draft.md:69` · The librarian contradiction is real only in a narrower form, and route (i) is underspecified. The grep:

   `rg -n -i -e 'external|third-party|outside|corpus|import' knowledge/librarian-loop.md`

   returned zero hits. The loop collects project gap ledgers (`knowledge/librarian-loop.md:39-42`) and caps `recurrent:false` at `surface` (`:56-64`). Thus there is no external-corpus evidence type. But “a MengTo-derived candidate has no project recurrence by construction” is too absolute: it could recur across independently chosen project trials. More importantly, recurrence protects against turning one context’s taste into studio law; a single owner judging repeated briefs is not automatically stronger evidence.

   Action: add a separate evidence class such as `external-candidate`, but do not simply substitute “4/6 owner wins” for recurrence. Permit pilot success to advance to `candidate` or `contextual-recipe`; require independent briefs across categories, contradiction/isolation success, fresh-context judgment, and later project evidence before studio-wide `promoted/act`. This aligns with `knowledge/world-class-learning-loop.md:132-143`.

12. **HIGH** · `/private/tmp/mengto-opus-draft.md:197` · Passing all linters does not equalize the taste floor. Linters establish minimum correctness; they do not equalize content quality, model stochasticity, asset suitability, prompt activation strength, repair choices, or how much usable instruction each patch contributes. DESIGN:OS itself separates floor from ceiling (`knowledge/world-class-learning-loop.md:12-18`). Moreover, treatment-specific rules may make one arm easier or harder to lint, introducing unequal repair exposure despite a nominally equal time budget. Action: preserve initial outputs, record all repair rounds, use fixed repair budgets and blind repair operators, report pre-repair and post-repair comparisons, and treat lint parity only as eligibility—not experimental control.

13. **HIGH** · `/private/tmp/mengto-opus-draft.md:203` · The judgment design remains biased and statistically weak. Six pairwise votes with a `<4/6` cutoff means a 4–2 result is treated as success even though, under a 50/50 null, outcomes of 4 or more wins occur 34.4% of the time. The owner’s taste is relevant, but sole-owner pairwise judgment estimates owner preference, not transferable superiority. Confidence scores do not repair non-independence. Action: label an owner-only run “preference screening,” not validation. Use multiple independent blind judges or repeated owner judgments with duplicates to estimate consistency; collect axis-level reasons; and require confirmatory holdouts before canonical adoption.

14. **MEDIUM** · `/private/tmp/mengto-opus-draft.md:175` · Spec 018 supplies useful protocol principles, not a directly reusable harness. Its treatment is one binary variable—recalled learning enabled/disabled—and it requires at least three cases across two categories, every case winning, mean blind delta ≥10, repair reduction, correction reduction, zero regressions, and contradiction/isolation safeguards (`benchmark-contract.md:31-56`). The draft discards most of those measurements and replaces them with a tiny win count while still claiming direct reuse. Spec 018 is itself marked “preregistration draft” (`:3`), and its review says the completed examples were not a blind comparative score (`review-report.md:5,44`). Action: say the pilot borrows design principles from 018; create a separate contract and executable result schema for taste transfer.

15. **MEDIUM** · `/private/tmp/mengto-opus-draft.md:39` · Persona count rot reproduces exactly. Commands:

   - `rg -n '26 personas|23 personas|full set of 23|Total' knowledge/persona-index.md`
   - `node -e "const x=require('./knowledge/personas/personas.json'); console.log(x.length)"`

   found 26 at `persona-index.md:3,11`, 23 at `:54,79`, and JSON length 26. Action: fix independently of this adoption program and add/repair the existing persona-drift check. Do not use it as evidence for or against MengTo taste.

16. **MEDIUM** · `/private/tmp/mengto-opus-draft.md:15` · The maintenance and brand-world claims reproduce. `find ... -name SKILL.md | wc -l` returned 121. `node scripts/validate-skill-demos.mjs` exited nonzero with exactly 109 issues. `test -d .github` returned status 1. The brand-world skill explicitly contains the non-metric 30/50/70/85 dial (`SKILL.md:20-29`), reusable-grammar/protected-elements split (`:31-58`), and four-element floor (`:127-138`). Action: retain these claims, but treat the percentage dial as communication vocabulary and the four-element rule as a human originality heuristic, not legal assurance or deterministic lint.

17. **MEDIUM** · `/private/tmp/mengto-opus-draft.md:21` · The legal line is source ownership, not file extension or paraphrase. MengTo’s repository root MIT licence permits modification and redistribution but requires the notice for copies or substantial portions (`/private/tmp/mengto-skills/LICENSE:1-19`). Studying methods and writing independently expressed house guidance is generally low-risk; close paraphrase, copied tables, distinctive taxonomy, or vendored source text should retain the MIT notice as well as provenance. An `ease:source` marker is provenance, not necessarily licence compliance.

   The Neuform demos are different: their `source.json` files identify Neuform and third-party page URLs, but I found no per-demo licence grant. Root MIT labelling cannot safely be assumed to cover third-party HTML, images, fonts, brands, or page copy. Action: do not copy, vendor, redistribute, or use the 38 HTML files as treatment artifacts without a documented licence. Public visual study and independently recreated abstractions are not automatically forbidden, but provenance, trademark, privacy, and asset licences still require review. The draft’s “reject-from-study total” is legally overbroad; “quarantine from reuse and training fixtures” is the defensible boundary. This is not legal advice.

18. **MEDIUM** · `/private/tmp/mengto-opus-draft.md:89` · Sequencing should be brand-worlds clarification first, then a redesigned pilot. Fable is right on this narrow question. The protected-elements split is cheap, preventive, directly relevant to any reference-led pilot, and already framed as non-measurable intent. Running the pilot first would generate reference-derived artifacts before adopting the very boundary intended to keep those artifacts original. Action: first add or clarify the generation-side originality boundary—with its Article-II companion if normative—then preregister and run the pilot. The persona count fix can happen independently. Proof specimens follow whichever candidates survive confirmation.

SPECULATIVE findings

19. **MEDIUM** · `/private/tmp/mengto-skills/agent-skills/codex/optimize-web-animations/SKILL.md:14-72` · The reviews still underweight animation lifecycle evidence. This skill’s transferable value is not another timing constant; it is measurement across scroll positions, idle periods, route cycles, DOM/canvas counts, offscreen pausing, and cleanup verification. That complements DESIGN:OS’s motion floors and Article X performance priority more directly than importing Lenis defaults. Action: compare it against `motion-craft.md` and consider a provider-neutral “animation runtime qualification” workflow with before/after evidence and deterministic checks where observable.

20. **MEDIUM** · `/private/tmp/mengto-skills/agent-skills/codex/article-prompts-to-skills/SKILL.md:10-55` · This corpus contains its own better answer to §D: an extraction ledger separating source observation, portable contract, accessibility/performance constraints, examples, and proof. The prior reviews mention the skill but do not connect it to external-corpus intake architecture. Action: study this as the shape for an `external-candidate` evidence packet—source hash/licence, extracted claim, context boundary, counterexample, adapted wording, proposed emitter/linter, and pilot result—without importing its skill packaging.

21. **LOW** · `/private/tmp/mengto-skills/agent-skills/codex/daily-ui-inspiration-capture/SKILL.md:50-147` · Selection manifests and explicit fallback reasons may be more transferable than the fixed style cards. They can make corpus sampling auditable and prevent cherry-picking only the most activation-friendly references. Action: require candidate inclusion/exclusion reasons and failed-capture records in the pilot preregistration, while keeping capture tooling runtime-specific.

22. **LOW** · `/private/tmp/mengto-opus-draft.md:210` · The 52–55-line cluster supports a templating hypothesis but does not prove “templated fill.” Repetition could reflect deliberate concise standardization. Content authorship and information density require semantic or historical evidence, not line clustering. Action: test duplicate phrasing, shared sentence skeletons, commit provenance, and whether candidate-specific clauses alter blind outcomes. Do not prejudge T1 from length alone.
hook: Stop
hook: Stop Completed

<!-- END VERBATIM CODEX OUTPUT -->

---

## Opus reconciliation

I re-ran every disputed measurement rather than accepting either side. Codex is **substantially
correct**, including on three errors of mine. Verdict `BLOCKER` is **CONFIRMED, not disputed** —
findings 1 and 2 are real defects in my Stage-2 draft.

### CONFIRMED — Codex right, I was wrong (4)

**F1 (BLOCKER) — pilot arithmetic impossible. CONFIRMED.**
4 tranches × 6 pairs = 24 pairs = 48 renders. I wrote "12 renders" while listing 12 candidates in
4 tranches — I conflated *candidate count* with *render count*, inheriting Fable's "6 briefs × 2
arms = 12 renders" figure which was sized for 3 tranches, then adding a 4th. The
tranche-level/candidate-level attribution flaw is also real; I had flagged it as open question 3
and Codex correctly escalates it to blocking. **Action: redesign as screening → candidate-level
confirmation. Recompute cost honestly.**

**F2 (BLOCKER) — media architecture violates Article I. CONFIRMED.**
I placed network-facing `search()`/`resolve()` provider implementations under `src/adapters/`.
`.specify/memory/constitution.md:6-14` makes the binary a zero-network kernel;
`generation-craft-defaults.md` says the binary "never fetches or generates assets". `src/adapters/`
ships inside the published npm kernel. This was my error and it is exactly the invariant I claimed
in §A was preserved. **Action: provider adapters live in generated host-side workflows/plugins,
outside `src/`. `ui` validates a provider-neutral manifest only.**

**F4 — size distribution. CONFIRMED.** My awk used `int(NR/2)` and `int(NR*0.75)` — off-by-one
against nearest-rank. Re-run: median **72** (not 71), p75 **153** (not 145), 52–55 cluster **23**
(not 24). n=79, min=20, max=617 stand.

**F6 — GSAP claim materially misstated. CONFIRMED.** My `grep -cE '[0-9]+\s*(ms|s)\b|0\.[0-9]+'`
returned 2; `grep -cE '[0-9]'` returns **15**, and `knowledge/gsap-motion-direction.md:71-83`
carries real calibration (`duration: 0.7`, `y: 28`, `scale: 0.96`, `"establish+=0.12"`,
`min-width: 768px`, `ease: "power3.out"`). "No concrete values at all" is **false** — and this
also corrects **Fable's** R2, which asserted the same thing "grep-verified". Lenis = 0 hits stands.
**Corrected gap: no Lenis doctrine and no persona-scoped timing DNA — not a value-free file.**

### CONFIRMED — Codex right, and my error was worse than it knew (1)

**F5 — "0 aspect-ratio hits" is false. CONFIRMED, root cause found.**
Codex found 4 hits. The cause was not regex: I ran that grep with the shell **inside the MengTo
clone**, where `knowledge/` does not exist, with `2>/dev/null` swallowing the error. A wrong-cwd
**false zero**, reported as a headline measurement. Reproduced:
`cd /private/tmp/mengto-skills && grep -rn ... knowledge/ 2>/dev/null | wc -l` → `0`;
`ls knowledge` → `No such file or directory`.
This is the precise failure class recorded in my own notes as a silent-no-op false zero.
The 4 real hits are incidental (contrast ratio `1:1`, Figma node id `'123:45'`, a CSS `gap` 1:1
mapping) — **the substantive gap survives, the measurement did not.**
**Corrected claim: "zero role→aspect-ratio media contracts in `knowledge/`", never "zero hits".**

### CONFIRMED — Codex right, and the correction STRENGTHENS the finding (1)

**F3 — 61 unique files, not 55. CONFIRMED.** My union regex omitted `Taste Rules` while my
parenthetical listed it — an internal inconsistency. And `Common pitfalls` ×10 counted exact
heading *lines*; unique *files* = **12** (variants `## Common Pitfalls`, `## Common pitfalls (and
fixes)`). True union = **61/79 (77%)**. Per-heading unique-file counts: Avoid 37 · Common pitfalls
12 · Taste Rules 8 · Guardrails 6 · Anti-patterns 0 (overlapping sets).
The prior report's "no anti-pattern lists per style" is **more** wrong than I said, not less.

### CONFIRMED — security findings that OVERTURN my recommendation (2)

**F7 — cutting SSRF guards is unsafe. CONFIRMED; I withdraw the cut.**
`templates/workflows/from-url.md:67-95` instructs the host to fetch an arbitrary user-supplied URL
**and every linked stylesheet**, explicitly offering `curl` for runtimes without WebFetch.
Human initiation does not stop a supplied URL from resolving to loopback, `169.254.169.254`, or a
private range. My "we don't have an automated unattended pipeline, so drop the fence" reasoning
confused *who triggers the fetch* with *where the fetch can reach*. **Retain scheme validation,
DNS/private-range rejection, redirect revalidation, size/type caps, credential stripping — at the
host-fetch layer.** A global domain allowlist remains unsuitable for arbitrary from-URL work
(Codex agrees) and may be omitted or policy-configurable.

**F8 — the CSP preview path is not hypothetical. CONFIRMED; my "only if" condition is already met.**
`from-url.md:293-298` **always** runs `ui designmd snapshot … --out <slug>/DESIGN.preview.html`,
and `:299-304` states it "absolutises root-relative URLs against `--origin` **so images and fonts
still load**" — i.e. it deliberately preserves remote subresource loading from an untrusted origin.
`:369` lists the file as a standard artifact. Codex's point that hash verification proves
**integrity, not safety** ("it can faithfully verify malicious bytes") is correct and is the
sharpest single sentence in this review. **Action: a tested sandbox/CSP/sanitisation contract for
the existing preview path, asserting event handlers, iframe/object/embed, navigation, forms,
remote subresources, and script stripping — not CSP alone, not hash alone.**

### AGREED with refinement (7)

- **F9 (media overstatement).** Agreed and important. The two files do **not** contain a
  generated-vs-sourced decision method, a lighting framework, or a provenance manifest — the owner's
  steering listed those as things to look for, and I already reported provenance as absent; Codex is
  right that lighting and generated-vs-sourced are equally absent. I over-labelled §F "A4 per-role
  selection rubric" — it is thin. **Accepted:** ratios and the 30–50% reserve become **candidate
  heuristics**, not universal linter errors; a hard `hero-background 1:1 fails` rule is wrong
  (art-directed square heroes and `srcset` crops are legitimate). Validate **rendered** focal/text
  safety at 390/768/1440 instead of file ratio. This materially improves my §F proposal.
- **F10 (Article II overclaim).** Agreed. Most of my ADOPT list is pure knowledge prose with no
  emitter and no linter. **Fix: split "non-normative guidance" from "enforceable standard"**; only
  the latter owes Art II. Do not pretend "four changed elements" or subjective quality is
  deterministically checkable.
- **F11 (librarian).** Agreed; my §D was too absolute. A corpus candidate *could* recur across
  independent project trials, and recurrence exists to stop one context's taste becoming studio law
  — a single owner judging repeated briefs is not automatically stronger. **Adopt Codex's shape:** a
  distinct `external-candidate` evidence class advancing only to `candidate`/`contextual-recipe`,
  with studio-wide `act` still requiring later project evidence. Better than my route (i).
- **F12 (lint parity ≠ equal floors).** Agreed. `world-class-learning-loop.md:12-18` separates floor
  from ceiling. Lint parity is **eligibility, not control**. Adopt: preserve pre-repair outputs,
  fixed repair budgets, blind repair operators, report pre- and post-repair.
- **F13 (judgment weak).** Agreed and quantified: under a 50/50 null, ≥4 of 6 occurs **34.4%** of
  the time. An owner-only run is **preference screening, not validation** — correct framing, and it
  is the honest label for what the owner actually asked for.
- **F14 (spec 018 principles, not harness).** Agreed; I overstated "directly reusable". 018 is
  itself marked *preregistration draft* and its own review says the completed examples were not a
  blind comparative score. **Say: borrows design principles; needs its own contract.**
- **F17 (legal).** Agreed, and it corrects me in the *permissive* direction: my "reject-from-study,
  total" on the Neuform HTML is **legally overbroad**. The defensible boundary is **quarantine from
  reuse, redistribution, and training/treatment fixtures** — not a prohibition on looking. MIT
  compliance also needs the **notice** retained for substantial portions, which `ease:source`
  provenance alone does not satisfy.

### AGREED, no change (2)

- **F15 (persona count rot)** — reproduces exactly (26 at `:3,:11`; 23 at `:54,:79`; JSON 26). Fix
  independently; Codex is right that it is evidence about **us**, not about MengTo taste.
- **F16 (maintenance + brand-worlds)** — 121 skills, 109 issues, no `.github/`, dial at `:20-29`,
  grammar/protected split at `:31-58`, four-element floor at `:127-138`. Treat the dial as
  communication vocabulary and the four-element rule as a human heuristic, never lint or legal
  assurance.

### AGREED on sequencing — I was wrong, Fable was right (1)

- **F18.** Codex sides with Fable against my draft. The argument that decides it: running the pilot
  first would **generate reference-derived artifacts before adopting the very boundary meant to keep
  them original**. **Revised order: brand-worlds originality boundary → preregister → redesigned
  pilot.** Persona count fix proceeds independently.

### SPECULATIVE — accepted as genuinely new (4)

- **F19 `optimize-web-animations`** — animation *lifecycle* evidence (scroll positions, idle, route
  cycles, DOM/canvas counts, offscreen pausing, cleanup verification). Neither Claude review saw
  this; both fixated on timing constants. This is a **fourth** transferable class and it is more
  Art-X-relevant than Lenis defaults.
- **F20 `article-prompts-to-skills` as the §D answer** — the corpus contains its own extraction-
  ledger shape (source observation → portable contract → a11y/perf constraints → examples → proof).
  Adopt as the **`external-candidate` evidence-packet schema**. Best structural idea in this review.
- **F21 `daily-ui-inspiration-capture`** — selection manifests + explicit fallback reasons make
  corpus sampling auditable and **prevent cherry-picking activation-friendly references**. Directly
  answers a real bias in my own candidate selection. Adopt into the preregistration.
- **F22 (templating hypothesis unproven)** — correct; line clustering is not authorship evidence.
  My "templated fill" caution was itself a hypothesis stated too strongly. **Do not prejudge T1 from
  length.** Test duplicate phrasing / shared skeletons / commit provenance instead.

### DISPUTED (0)

None. Every finding survived verification.

### Net effect on the strategy

`BLOCKER` is confirmed: **the Stage-2 draft may not proceed as written.** Two structural defects
(pilot arithmetic + Article I violation) and one methodological correction (SSRF/CSP guards stay)
must land before anything is actionable. The *direction* — MengTo as an external expert taste
corpus, learning separated from canonical import, media adapted provider-agnostically — survives
intact and is strengthened by F3, F9, F19, F20, F21.
