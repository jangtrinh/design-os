# MengTo/Skills → DESIGN:OS — Cross-Model Strategy (consolidated)

**Status:** decision document for the owner. Research only — **no repo file was created, edited,
committed, or pushed; no generation credits were spent.**
**Date:** 2026-07-26 · **Corpus:** `github.com/MengTo/Skills` @ `21b278c62f49f3ce3d8c8ecbcc84cbcd534f3e49`
**Target:** `/Users/jangtrinh/Products/ease-design` (DESIGN:OS)

Evidence marks: **[F]** verified against a file/command this session · **[I]** inference · **[R]** recommendation.
Where a number is given, the command that produced it is stated or reproducible from §9.

---

## 1. Review provenance — who said what, and who was overruled

| Stage | Model | Artifact | Verdict |
|---|---|---|---|
| 0 | Opus 5 (prior session) | `/private/tmp/mengto-skills-opus5-report.md` (729 ln) | "Adapt 3 mechanisms, reject the bulk" |
| 1 | **Fable 5** | `/private/tmp/mengto-fable-initial.md` (113 ln) | Independent rebuttal — no verdict literal (Stage 1) |
| 2 | **Opus 5** (main loop) | `/private/tmp/mengto-opus-draft.md` (218 ln) | Reconciliation draft |
| 5 | **Codex GPT-5** (`gpt-5.6-sol`) | `/private/tmp/mengto-codex-crosscheck.md` (256 ln) | **`VERDICT: BLOCKER`** — 22 findings + Opus reconciliation |
| 6 | **Fable 5** | `/private/tmp/mengto-fable-final.md` (304 ln) | **`VERDICT: APPROVE`** — conditional on M1–M8 |

Owner steering entered twice: (1) the "reject conflated canonical-import with learning" correction;
(2) the media-skills directive. Both are incorporated and both changed outcomes.

**Independence was real, not ceremonial.** Every stage overturned the one before it:

- Stage 1 overturned Stage 0's taste verdict and its "flat cards" taxonomy.
- Stage 5 (a different model family) overturned **both** Claude stages — including three of my own
  measurements and one of Fable's — and blocked the draft.
- Stage 6 overturned **four of its own Stage-1 positions** (R4 media, R2's grep claim, the Brief-#2
  security cut, and "reject-from-study" on Neuform).
- Stage 6 also **rejected two Codex over-reaches** rather than capitulating.

Three findings were re-run by all three models independently and agree: MengTo's own gate is red
(`109 issue(s)`, exit 1), there is no `.github/`, and `DEMOS.md`'s "every tracked skill has a
portable demo" is false at HEAD. [F ×3]

---

## 2. Claims confirmed and overturned

### 2.1 Confirmed (survive all three models)

| Claim | Evidence |
|---|---|
| The prior report's **negative greps on DESIGN:OS all reproduce** — its gap-finding half is sound | originality = 2 hits (both axis labels); prompt-triad = 0; from-url hardening = 0; devices = 9; `personas.json` = 26 [F] |
| MengTo's gate is real, excellent, **and has never run in CI** | `node scripts/validate-skill-demos.mjs` → `109 issue(s)`, exit 1; `ls .github` → no such directory [F ×3 models] |
| Constitution Art I (no network/model/deps in `ui`) and Art II (emitter AND linter) as characterised | `.specify/memory/constitution.md:6-14, 16-22` [F] |
| **Lenis appears nowhere** in `knowledge/` | `rg -i '\blenis\b' knowledge/` → 0 [F ×2] |
| `generate-reference-inspired-brand-worlds` carries a 30/50/70/85 similarity dial, a reusable-grammar vs protected-signature-elements split, and a ≥4-changed-elements floor | `SKILL.md:20-29, 31-58, 127-138` [F ×2] |
| DESIGN:OS `persona-index.md` **count rot** | "26 personas" at `:3,:11,:21`; "Total 23 personas" at `:54`; "full set of 23" at `:79`; JSON = 26 [F ×2] |

### 2.2 Overturned — prior report was wrong

| # | Prior claim | Corrected |
|---|---|---|
| O1 | "79 flat style cards … **no anti-pattern lists per style**" | **61/79 (77%)** carry an explicit negative-constraint section. Unique-file counts: `Avoid` 37 · `Common pitfalls` 12 · `Taste Rules` 8 · `Guardrails` 6 · `Anti-patterns` 0 (overlapping sets; union = 61) [F] |
| O2 | "thinner, sometimes 20 lines" | 20 is the **min**. n=79, **median 72**, **p75 153**, max 617 (nearest-rank). And 20 lines is the *correct* size for a micro-device card under our own `authoring-standard.md` |
| O3 | Style cards are unstructured content | They share a repeated authoring schema: `Use When` 43 · `Workflow` 38 · `Avoid` 37 · `Tuning knobs` 30 · `Visual target` 28 · `Recommended patterns` 21 [F] |
| O4 | "style cards stack freely" | `build-awwwards-quality-sites:15` forbids "combining unrelated aesthetic systems"; `skeuomorphic-ui:121` forbids mixing glass/neu/skeuo [F] |
| O5 | Bucket A = "~60 style cards … exactly what personas own" | Four distinct kinds: **~30 micro-device cards** (device-grade — they *feed* our 9-device menu, they don't compete), ~20–25 aesthetic-system cards, **~7 page-genre playbooks**, ~8 library recipes [F] |
| O6 | Motion bands "duplicative **and** conflicting" | Bands substantially **overlap**; "section entrance 400–800" *equals* our hero band; "hero sequence 800–1600" measures a multi-beat sequence (different unit). Only stagger genuinely diverges (40–90 vs 20–60) |
| O7 | "All 17 game-development skills" | **19** (its own §2.2 table says 19) [F] |
| O8 | R4 media = "couples a deterministic binary to third-party accounts" | **Category error.** These are host-side knowledge; `generation-craft-defaults.md` already sanctions host-side external hands (Codex ImageGen 2, SVGL, Phosphor). Nothing touches the binary |
| O9 | Corpus has no generation-side originality thinking | `generate-reference-inspired-brand-worlds` was **never analyzed** and is absent from the prior report's read list [F] |

### 2.3 Overturned — *this* review's own errors (self-correction)

Recorded because a strategy document that hides its own error rate cannot be trusted on its
remaining numbers.

| # | My (Opus) claim | Reality | Cause |
|---|---|---|---|
| S1 | "0 aspect-ratio hits across the entire `knowledge/` tree" | **4 hits**, all incidental (contrast ratio `1:1`, Figma node id `'123:45'`, a CSS `gap` 1:1 mapping) | **False zero.** The grep ran with the shell inside the MengTo clone — which has no `knowledge/` dir — and `2>/dev/null` swallowed the error. Reproduced and root-caused. This is the house's own recorded silent-no-op / false-zero failure class, committed by the reviewer who cites it |
| S2 | "55/79 negative-constraint cards" | **61/79** | My union regex omitted `Taste Rules` while my own parenthetical listed it; `Common pitfalls` ×10 counted heading *lines*, unique *files* = 12 |
| S3 | median 71 / p75 145 / cluster 24 | **72 / 153 / 23** | `int(NR/2)` and `int(NR*0.75)` off-by-one vs nearest-rank |
| S4 | `gsap-motion-direction.md` "has 2 numeric lines" | **15 lines contain digits**; `:71-83` carries `duration: 0.7`, `y: 28`, `scale: 0.96`, `"establish+=0.12"`, `min-width: 768px`, `ease: "power3.out"` | Over-narrow regex. **Also corrects Fable's R2**, which asserted "no concrete values at all — grep-verified" |
| S5 | Pilot: "12 renders, 1–2 days" | 4 tranches × 6 pairs = **48 renders**; honest ceiling **~68 renders / 3–5 days** | Conflated candidate count with render count |
| S6 | Media adapters under `src/adapters/` | **Art I violation** — network-facing provider code inside the zero-network published kernel | Asserted in §A that all invariants held while breaching one |
| S7 | "Cut the SSRF guards; CSP wrapper only if a preview path exists" | Guards stay; **the preview path already exists** | Confused *who triggers the fetch* with *where the fetch can reach* |

**Corrected phrasings that must be used going forward:** "**zero role→aspect-ratio media
contracts**" (never "zero hits"); "**limited GSAP calibration, no Lenis doctrine, no persona-scoped
timing DNA**" (never "no concrete values").

### 2.4 The methodological finding that reopened the question

`knowledge/world-class-learning-loop.md`: world-class "is a comparative judgment: the artifact …
**wins under blinded evaluation against controlled alternatives**"; "Randomize labels before
judgment." `knowledge/taste-rubric.md:391`: "**the maker never grades its own work**."

The prior report decided a **taste** question with an **artifact ruler** — line counts, axis counts,
structure counts — and no blinded run, with the maker grading its own work. **The owner's correction
is doctrinally grounded, not a preference.** [F]

---

## 3. Comprehensive value map

Five classes. The prior report saw two.

### 3.1 Design taste
- **Micro-device corpus** — ~30 device-grade cards vs our 9 in `signature-devices.md`. Feeds the menu; does not compete with personas.
- **Card grammar** — **Tuning knobs** (named parametric axes per aesthetic: "editorial intensity / technical density / accent restraint / media prominence / contrast"), a **neighbor-style boundary sentence** ("not generic corporate SaaS, not pure magazine minimalism — sit in the middle"), and per-card `Avoid`. Our persona DNA tables have anti-patterns but **no knobs and no disambiguation sentence**. [F]
- **Page-genre playbooks** (~7) — vertically integrate what we spread across four files (persona DNA + `page-structures.md` + `content-design.md` + motion timing) into one per-genre contract, with genre-scoped motion bands and Art-VIII-grade anti-fabrication rules ("do not invent compliance or performance evidence").
- **Genre-scoped motion constants + T5 base tokens** — scrub 0.8–1.4, `start: "top 82%"`, lerp 0.08, word-stagger 35–70 ms. Candidates for a verified hole.
- **Media art direction** — see §5.

### 3.2 Engineering
- **`validate-skill-demos.mjs`** — zero-dependency Node validator; structural HTML, self-containment, `node:vm` syntax-check of inline scripts, JPEG SOF parsing, a 2 %-dimension-drift rule, index-coherence.
- **Hardened intake** (`sync-neuform-skill-demos.mjs`) — SSRF guards, host allowlists, token stripping, magic-byte checks, 5 MB caps, a 4-stage hash chain, CSP `default-src 'none'` + sandboxed `srcdoc`, content-hashed runtime vendoring.
- **`optimize-web-animations` — animation lifecycle evidence** *(found only by Codex; both Claude passes missed it)*. Profile at top/mid/footer + mobile; count CSS animations by computed `animationName`/`animationPlayState` including `::before`/`::after`; record which run **offscreen**; idle sample 10–30 s; route-cycle sample; `IntersectionObserver` pausing; RAF gating; cleanup of observers/timers/listeners; Three/WebGL disposal; and an honesty rule — if heap APIs return `null`, "say so and rely on stable observable counts". More Art-X-relevant than any timing constant. [F]

### 3.3 Workflow
- **Reference→artifact pipelines** — `video-to-superprompt` (beat-based frame extraction over uniform thumbnails), `html-to-interaction-prompts` (source HTML is truth over screenshots; contiguous crops; coordinates in `manifest.json`, not prose).
- **`stitched-full-page-capture`** — warm-scroll → return top → step-capture → **2 s settle** → stitch → crop *from the stitched image*. A concrete fix for a real failure class (one-shot `fullPage` returning blank on lazy/animated pages) that our from-url and figma capture paths are exposed to.
- **`generate-reference-inspired-brand-worlds`** — the generation-side of originality: similarity dial with the honest caveat "the numbers communicate intent; **they are not measurable similarity scores**", reusable-grammar vs protected-signature-elements, ≥4 changed elements.

### 3.4 QA / verification
- **Unit-level runnable proof** — demo + fixed-viewport render + gallery row + a validator that fails without them.
- **Non-visual proof** via `input.md` / `expected-output.md` for report-producing workflows.
- **Evidence-graded audit rubric** (`audit-reference-originality`) — 6-level evidence hierarchy, two-reproducible-locations rule, false-positive control list, git-history search, and the verdict literal **`Blocked by missing evidence`** ("never turn missing evidence into a pass").
- **Selection manifests + anti-cherry-picking** (`daily-ui-inspiration-capture`) — `manifest.json` with crop coordinates and `videoFallbackReason`; "reject candidates that repeat a normalized title, source URL, or image URL from previous captures"; a deterministic `check-ui-inspiration-duplicates.mjs`. **Emitter AND linter natively — Article II shape.** [F]
- **Mutation gating** (`handle-saas-billing-cases`) — read-only until explicit approval naming the exact action; approval for one mutation never approves another; post-action read-back before claiming completion. Same shape as our `reconcile --apply` discipline.

### 3.5 Communication / knowledge packaging
- **The Extraction Ledger** (`article-prompts-to-skills`) — *the single best structural find of this review.* A table `Source prompt | Reusable capability | Keep | Remove | Skill name | Demo proof`; "trace each proposed skill to source evidence"; **keep the portable contract** (behavior/state transitions, data model + parameter defaults, timing/easing/spacing/responsive, a11y + reduced-motion + keyboard, performance constraints + failure modes, acceptance checks) and **remove source-specific packaging** (brand names, marketing copy, proprietary content, unrelated layout, hard-coded palettes/assets/selectors), ending with:
  > "The result must transfer to a different subject, layout, and visual system without rewriting the core instructions."

  That is an operational definition of *learning without canonical import* — and it doubles as the legal boundary, since stripping brand names and proprietary content is what makes an adaptation independently expressed. **It becomes our `external-candidate` evidence-packet schema (M7).**
- **Need→skill router table + explicit ownership boundaries** — the anti-sprawl device.
- **Prompt triad** (Minimal / Recreate / Remix) and the **Remix invariant/variant sentence**: "change brand/subject/palette; **preserve mechanism, a11y, responsive and performance contract**" — the cleanest one-line statement of what `prompt-modes.md`'s Adapt mode means.

---

## 4. Revised Adopt / Adapt / Experiment / Reject

Per **M6**, every item is tagged **[NG]** non-normative guidance (knowledge prose; owes no
emitter/linter) or **[ES]** enforceable standard (owes emitter AND linter per Art II, with the check
deterministic-structural only). Nothing subjective is pretended checkable.

### ADOPT — cheap, no pilot required
| Item | Tag |
|---|---|
| Card grammar: tuning knobs + neighbor-boundary sentence into persona authoring | **[NG]** |
| Need→artifact router table + ownership boundaries | **[NG]** |
| Remix invariant/variant sentence into `prompt-modes.md` | **[NG]** |
| Stitched-capture discipline (warm-scroll → settle 2 s → stitch → crop from stitched) into from-url | **[NG]** |
| Selection manifests + duplicate rejection for reference intake | **[ES]** — manifest schema + duplicate checker |
| Fix `persona-index.md` count rot | **[ES]** — repair the persona-drift check |

### ADAPT — mechanism taken, rewritten for house invariants
| # | Item | Gate |
|---|---|---|
| **1** | **`generate-reference-inspired-brand-worlds` → `prompt-modes.md`**: similarity dial as *communication vocabulary*, protected-signature-elements split, ≥4-changed-elements as a **human heuristic** — never lint, never legal assurance | **[NG]**; lands **first** |
| 2 | **Media art direction**, provider-agnostic (§5) | **[NG]** doctrine + **[ES]** manifest fields |
| 3 | Genre-scoped motion bands + T5/Lenis base tokens → persona motion DNA + `gsap-motion-direction.md`, provenance-marked, labelled below `SOURCE` tier | **[NG]**, pilot-gated |
| 4 | Shadow ramps → **candidate DTCG primitives** (not utility strings) | **[NG]**, pilot-gated |
| 5 | Micro-devices (~30) → `signature-devices.md` candidates | via librarian chain |
| 6 | **Animation runtime qualification** from `optimize-web-animations` (M8) | **[NG]** + **[ES]** where observable |
| 7 | Brief #1 `ui knowledge proof`, devices-first, **second** in sequence, seeded by pilot specimens | **[ES]** |
| 8 | **Brief #2 security — restored, not cut (M4)**: scheme validation, DNS/private-range rejection, redirect revalidation, size/type caps, credential stripping **at the host-fetch layer**; a **tested** sandbox/CSP/sanitisation contract for the always-emitted preview; hash manifest + `ui intake verify` framed as **integrity, not safety** | **[ES]** |
| 9 | Brief #3 audit half — **deferred** until cloning/duel volume demands it | — |

### EXPERIMENT — time-boxed, kill by default
- **The taste-transfer pilot (§6)** — the primary experiment, but **third** in sequence (after the originality boundary and preregistration).
- E1 motion-reference intake (`ffprobe` beats → structured motion DNA); kill unless machine-readable, reproducible, and honestly labelled below `SOURCE`.
- E3 plain-language explanation layer for channel-A host summaries; kill unless the owner prefers it.

### REJECT-AS-DEFAULT — never canonical, **still study-able**
Bulk import of the 79 cards as skills · any MengTo constant as a **global** default · `$slug`
(runtime neutrality is constitutional) · `agents/openai.yaml` as a file format (generated adapters
own this) · **the frozen curated media URL lists** (they rot) · their maintenance posture (109
issues, no CI) · game-development and customer-support content.

### REJECT-FROM-STUDY — do not even learn from it
**Only the personal tweet corpus** (`write-like-meng-on-x/references/tweet-corpus.jsonl`) — one
named individual's authored voice; an identity and provenance error to ingest.

**The 38 Neuform demo HTML files moved out of this category.** See §8.

---

## 5. Media — the owner-steered settlement

Your directive: don't reject these for naming Aura/Unsplash; extract the problem-solving method;
separate provider coupling from transferable art direction; propose a provider-agnostic adapter if
warranted. **It is warranted.** Three models converged after disagreeing.

**What is genuinely there** [F, all three re-read the files]: a role→ratio→export ladder (avatar 1:1
· headshot 4:5/3:4 · hero 16:9 · story 9:16, each with export sizes); a **narrative-register split**
("professional but human" headshots vs "human story, not corporate headshot" portraits); a
composition contract (eyes ⅓ from top, never cut chin/forehead, preserve horizon, **30–50 % negative
space reserved for text**); resolution-variant fallback; and a licence gate **at selection time**.
Our `generation-craft-defaults.md` governs *origin* and *recording*; its only imagery-composition
guidance is one bullet, "protect image focal points". **Zero role→aspect-ratio media contracts exist
in `knowledge/`.**

**Three honest negatives — I will not validate the hypothesis where evidence does not support it:**
1. **Provenance: the corpus is *weaker* than ours.** It records a page URL and calls attribution "good practice" — no manifest, licence field, role, or output path. We have `ASSET-MAP.json`, record prompt/role/dimensions/focal-safe-area/output-path, and enforce `avoidable-screenshot-crop`. **Keep ours; import nothing here.**
2. **Lighting: does not exist in the corpus.** The only "lighting" content is incidental adjectives inside curated pick titles ("at dusk", "studio portrait", "neon light wave") — descriptions of specific photos, not a framework. If you want lighting doctrine, it must be **authored in-house or sourced from a photography/art-direction reference.** Treat it as an open gap, not an extractable.
3. **Generated-vs-sourced: does not exist in the corpus.** Neither file ever weighs generating against sourcing. **We are ahead here** — build on our own asset ladder (`project asset → approved source → generated asset → intentional no-image`), the spec-008 role split (generate hero/empty-state/texture/avatar/og/mockup; **never** icon/photo/screenshot/logo), and `build-awwwards-quality-sites`' people-authenticity rules (photos-only avatars; no generated people presented as real customers).

**Architecture — three layers, Art I-safe (this is the corrected version; my first draft violated Art I):**
1. **`knowledge/media-art-direction.md`** — asset-role taxonomy with narrative register; role→ratio→export table; composition contract with the 30–50 % text reserve. All marked **candidate heuristics with provenance**, pilot-gated before any normative status. **Zero provider names, zero URLs.** States explicitly which two gaps it does *not* fill and where those come from instead.
2. **Binary — validation only.** Extend `ASSET-MAP.json` with optional provider-neutral fields (`role`, `ratio`, `textReserve`); `ui` validates declaration presence and consistency. Any role↔ratio check is **warning-tier at most** (matching our own `avoidable-screenshot-crop` tier). **Primary validation is rendered focal/text safety at 390/768/1440**, not file ratio. **A hard `hero-background 1:1 fails` rule is rejected** — art-directed square heroes and `srcset` crops are legitimate. No fetching, ever.
3. **Provider adapters as generated host-side workflow templates** — Codex ImageGen 2, Unsplash, approved stock, provided/project assets. **Outside `src/`, outside the published npm kernel**, one template per provider, so a dead provider costs one file rather than a doctrine rewrite.

**Disposition: reject-as-canonical-import** (the frozen URL lists rot; MIT notice applies to any
substantial vendored portion) **/ ADAPT the art-direction core / emphatically NOT
reject-from-study.** Fable's Stage-1 "trivial two sentences" is overturned by Fable itself; my
"~75 % method" was inflated — the true transferable core is about one authored page of doctrine.

---

## 6. The 12-candidate taste-transfer pilot (M1 — arithmetically real)

**Question:** does MengTo-derived taste knowledge, adapted to house form, improve DESIGN:OS output
on matched briefs under blind owner judgment?

**The 12 candidates**, each selected because it fills a *verified* gap — not because it is popular:

| # | Family | Candidate | Verified gap it fills |
|---|---|---|---|
| 1 | T1 aesthetics | `editorial-tech` → candidate persona DNA | persona breadth; light/tech register |
| 2 | T1 | `light-mode-paper-technical` | light-mode technical register |
| 3 | T1 | `documentary-brutalist-agency` (genre playbook) | per-genre vertical integration shape |
| 4 | T2 motion | brutalist band: 160–220 ms controls / 500–760 ms masks | personas carry **zero numeric timing DNA** |
| 5 | T2 | product-proof band: 420–700 ms state / 45–70 ms stagger | same |
| 6 | T2 | cinematic T5 tokens (scrub 0.8–1.4, `top 82%`, lerp 0.08, word-stagger 35–70 ms) | **Lenis = 0 hits**; limited GSAP calibration |
| 7 | T3 devices | `number-details` | 9 house devices vs ~30 candidates |
| 8 | T3 | `container-lines` / corner-brackets | device menu breadth |
| 9 | T3 | `progressive-blur` | device menu breadth |
| 10 | T3 | `scroll-progress-timeline` | device menu breadth |
| 11 | T4 media | role→ratio ladder + 30–50 % text reserve | **zero role→aspect media contracts** |
| 12 | T4 | narrative-register split (headshot vs portrait-editorial) | personas cannot demand a photo register |

**Two phases — the honest arithmetic:**

| Phase | Design | Renders |
|---|---|---|
| **A — family-level preference screening** | 4 families × 3 briefs paired A/B (24) + 1 paired contradiction probe per family (8) | **32** |
| **B — candidate-level confirmation** (surviving families only) | **one candidate per arm-pair**, ≥3 briefs each. Worked example: 2 families × 3 candidates × 3 briefs × 2 arms | **36** |
| | **Program ceiling** | **~68 renders, 3–5 days** |

The earlier "12 renders / 1–2 days" figure is **dead** — it conflated candidates with renders. Phase A
alone (32 renders, 1–2 days) is a legitimate stopping point if the families lose broadly.

**Controls and honesty:**
- Control = current knowledge core; treatment = control + one patch. Phase A screens **families** and
  **explicitly disclaims per-candidate attribution in the preregistration**; only Phase B attributes.
- **Contradiction probe per family** (e.g. a data-dense dashboard where cinematic timing is wrong) —
  a leak fails the family regardless of wins.
- **Lint parity is eligibility, not control.** All outputs pass the full linter set to enter judging;
  pre-repair outputs preserved; fixed repair budget per arm; pre- and post-repair both reported.
- **Selection manifest** records candidate inclusion *and exclusion* reasons — prevents
  cherry-picking activation-friendly references.
- **Blinding:** renders anonymized, A/B randomized with preregistered coin flips.
- **Judging:** owner pairwise (winner + 1–5 confidence) + a blind curator axis pass as second reader
  + **at least one duplicated pair** to estimate owner self-consistency.
- Borrows **principles** from spec 018 (single-variable arms, contradiction/isolation, preserve all
  attempts, "0→0 never counts as improvement") but gets its **own preregistration contract and result
  schema**. Spec 018 is itself a *preregistration draft* and is not a drop-in harness.

**Labelled honestly: this is preference screening, not validation.** Under a 50/50 null, ≥4 of 6 wins
occurs **34.4 %** of the time — a 4–2 result means little. Hence the stricter Phase-B bar below.

---

## 7. Graduation criteria

**Phase A (family):** ≥2 of 3 paired briefs won **AND** no contradiction leak **AND** no floor
regression → that family earns Phase B. Otherwise recorded and dropped.

**Phase B (candidate — the real bar):** **3/3 briefs won** (12.5 % under a 50/50 null) **AND** no
contradiction leak **AND** no floor regression **AND** the blind curator records no ceiling
regression. **2/3 = record, do not adopt, and do not retry with tweaked values** — retuning to the
judge is overfitting.

**Then the governed door (M7).** A Phase-B winner does **not** enter canon. `knowledge/librarian-loop.md`
today has **zero** external/third-party/corpus language, and its recurrence gate (`recurrent: false`
caps at `surface`, never `act`) structurally blocks corpus candidates. Add an **`external-candidate`
evidence class**:

- pilot success advances a candidate to **`candidate` / `contextual-recipe`** — never straight to `act`;
- **studio-wide `promoted`/`act` still requires later real-project evidence**;
- the evidence packet follows the **Extraction Ledger** schema (§3.5): source hash + licence → extracted claim → context boundary → counterexample → adapted wording → proposed emitter/linter if normative → pilot result;
- human merge at the end is preserved, unchanged.

A preregistered owner win **does not substitute for recurrence** — recurrence exists to stop one
context's taste becoming studio law, and one person judging repeated briefs is not automatically
stronger evidence.

---

## 8. Legal boundary

- **MengTo-authored prose is MIT.** Studying methods and writing independently expressed house guidance is low-risk. **But**: close paraphrase, copied tables, distinctive taxonomy, or vendored source text must retain the **MIT notice** — an `ease:source` marker is *provenance*, not licence compliance.
- **The 38 Neuform demo HTML files are the different case.** `source.json` names neuform.ai and third-party page URLs; no per-demo licence grant exists; the root MIT cannot be assumed to cover third-party HTML, images, fonts, brands, or page copy. **Boundary: quarantine from reuse, redistribution, vendoring, and treatment/training fixtures — not a prohibition on looking.** Both Claude reviews' "reject-from-study, total" was **legally overbroad**; Codex's narrowing is accepted.
- **Two conditions.** (1) MIT notice retained for any substantial vendored portion. (2) A model's legal reasoning is not counsel — **if any Neuform-derived abstraction ever approaches canon, get a human legal read first.**
- The **personal tweet corpus** remains fully reject-from-study.

---

## 9. What still requires owner visual judgment

**No model can settle these — they are yours:**
- The pilot's pairwise winners.
- Whether adapted MengTo aesthetics read as **authored** beside house personas, or as borrowed.
- Whether the cinematic T5 tokens feel **premium or sluggish** on a real scroll story.
- Whether the 30–50 % text-reserve heuristic survives contact with real house heroes.

**Known unknowns to accept before spending:**
- Honest cost is **~3× the original pitch** (up to ~68 renders / 3–5 days). Phase A alone is a valid stop.
- Whether T1's filled content carries information **beyond its schema**. The 52–55-line clustering of 23 cards is *suggestive* of templating but **proves nothing** — line length is not authorship evidence, and T1 must not be prejudged from it.
- **Lighting doctrine and a generated-vs-sourced method will not arrive by adopting this corpus.** Author in-house or source elsewhere.
- Whether a **tested** CSP/sanitisation contract for the preview path is achievable — budget for the possibility that the preview must be degraded (no remote subresources) to pass.
- Owner-preference wins predict **your** taste, not transferable superiority across future clients.

---

## 10. Concrete next specs, in order

Each is its own `specs/NNN-slug` with its own gates. **Do not run them as one pipeline.**

| Order | Spec | Why here | Size |
|---|---|---|---|
| **1** | **`originality-boundary`** — brand-worlds similarity dial + protected-signature-elements split + ≥4-changed-elements heuristic into `prompt-modes.md` | Nearly free, preventive, and **must precede any reference-led generation** — otherwise the pilot produces reference-derived artifacts *before* adopting the boundary meant to keep them original. Settled Fable+Codex vs Opus | XS **[NG]** |
| **1b** | **`persona-index-count-fix`** — repair 26-vs-23 rot + the drift check | Independent, embarrassing, cheap. Never cited as evidence about MengTo | XS **[ES]** |
| **2** | **`taste-transfer-preregistration`** — briefs, randomization, thresholds, selection manifest, result schema; **committed before any render** | Preregistration after seeing results is not preregistration | S |
| **3** | **`taste-transfer-pilot`** — Phase A (32 renders) → Phase B (~36) per §6–§7 | The experiment that answers the actual question | M–L |
| **4** | **`external-candidate-door`** — librarian evidence class + Extraction-Ledger packet schema | Needed before *any* winner can graduate; blocks the whole adoption path if absent | S–M **[ES]** |
| **5** | **`from-url-intake-hardening`** — SSRF guards at the host-fetch layer + tested sandbox/CSP/sanitisation for the always-emitted `DESIGN.preview.html` + hash manifest & `ui intake verify` | Highest severity per line of code; the fetch path is live today and the preview always renders | M **[ES]** |
| **6** | **`media-art-direction`** — §5's three layers | Owner-directed; unblocked by the pilot's T4 result | M |
| **7** | **`knowledge-proof`** (Brief #1, devices-first) — emitter + linter + CI + demonstrated red gate | Discharges Art II on our largest prose surface; **seeded by pilot specimens**, so it goes after | L **[ES]** |
| **8** | **`animation-runtime-qualification`** (M8) | Fourth transferable class; Art-X-relevant | M |
| — | *Deferred:* Brief #3 audit half (`ui originality inventory`) | Until cloning/duel volume demonstrates demand | — |

**One condition binds specs 4, 5, 7, 8:** the gate ships **with CI and a demonstrated red**, or it
does not ship. MengTo is the cautionary proof — a beautiful validator, 109 unaddressed issues, a
false claim in its own index, and no CI. Copying the mechanism without the wiring reproduces their
drift at our larger scale.

---

## 11. Bottom line

The prior report found the right **engineering** payload and reached the wrong **taste** verdict,
because it measured a taste question with an artifact ruler — the one method our own doctrine
forbids. Reopening it was correct.

MengTo/Skills is an **external expert taste corpus** with a real, testable claim on four specific
gaps: device-menu breadth, persona-scoped motion numbers, generation-side originality control, and
media art direction. It is **not** a better design brain than DESIGN:OS, and its maintenance posture
is a warning. The honest disposition is neither "reject" nor "adopt" — it is **learn through a
governed door, prove with a blinded pilot, and import almost nothing verbatim.**

Three models disagreed productively and each overturned the last, including four of Fable's own
Stage-1 positions and seven of my own claims. **What survived that is worth acting on. What did not
is recorded above rather than quietly dropped** — including a false zero produced by the exact
failure class this repo already has a scar for.

**Recommended first move: spec 1 (`originality-boundary`) — extra-small, preventive, and it must
land before anything else generates from a reference.**
