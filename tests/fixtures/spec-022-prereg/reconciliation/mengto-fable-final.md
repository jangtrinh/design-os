VERDICT: APPROVE

# Fable 5 — Stage 6 Final Review: MengTo/Skills → DESIGN:OS consolidated strategy

**Scope of verdict:** the consolidated strategy (Opus Stage-2 draft as corrected by the Codex
Stage-5 review and Opus's reconciliation) MAY go to the owner **only with the MUST-MODIFY items
below applied**. This is an APPROVE of the direction and the corrected body of work, not of the
Stage-2 draft as written — that draft, standing alone, was correctly BLOCKED.

Why APPROVE rather than REJECT-to-Stage-2: every defect Codex found has a fully specified,
already-reconciled fix, accepted in writing by the stage that made the error. Sending the work
back to Stage 2 would reproduce, verbatim, what the reconciliation already contains. The
protocol's re-entry loop exists to force rework that has not happened; here it has. The
remaining work is editorial assembly under the constraints below, which Stage 2 performs as the
final-document write-up, not as a re-opened design question.

---

## 1. Judgment on the two BLOCKERs — correctly blocking, both

**B1 — pilot arithmetic (Codex F1): correctly called.** 4 tranches × 6 pairs = 48 renders, not
12 [F, arithmetic]; and a tranche bundling 3–4 candidates cannot claim "exactly one variable" —
the confound is structural, not cosmetic. This was not a typo; it was the cost basis and the
attribution claim of the primary recommendation, both false. A strategy document whose headline
experiment is internally impossible may not reach the owner. Blocking was right. The fix is the
redesigned pilot in §3 below.

**B2 — media adapters under `src/adapters/` (Codex F2): correctly called.** Network-facing
`search()`/`resolve()` provider code inside the published zero-network kernel violates
constitution Art I [F, `.specify/memory/constitution.md:6-14`] and contradicts the house's own
doctrine that "the deterministic `ui` binary records and validates asset declarations. It never
fetches or generates assets" [F, `knowledge/generation-craft-defaults.md:51-52`]. The irony that
the draft's §A claimed all invariants held makes this worse, not better. Blocking was right.
Fix: provider adapters live in **generated host-side workflow templates/plugins**, outside
`src/` and outside the npm artifact; `ui` validates a provider-neutral manifest only.

Neither BLOCKER was over-called. Both are settled: **accepted, with the reconciliation's fixes
made mandatory.**

---

## 2. The media settlement (three-way disagreement, owner-steered)

I re-read both media files and both house files myself before ruling [F, full reads:
`media/aura-asset-images/SKILL.md`, `media/unsplash-asset-images/SKILL.md`,
`knowledge/generation-craft-defaults.md`, `knowledge/delivery-assets.md`].

**(a) My Stage-1 R4 is overturned — by me.** "Loss is trivial: two sentences of crop craft" was
an under-read. The files carry a coherent, if thin, art-direction layer: a role→ratio cheatsheet
(avatar 1:1 · headshot 4:5/3:4 · hero 16:9 · story 9:16) with per-role export-size ladders
[F, unsplash `:44-57,102-106`; aura `:36-44,57-59,100-102,116-118`]; a narrative-register split
("professional but human" headshots vs "human story, not corporate headshot" portraits
[F, unsplash `:48,61`]); a composition contract (eyes ⅓ from top, never cut chin/forehead,
preserve horizon, **30–50% negative space reserved for text** [F, aura `:42-44`]); resolution-
variant fallback (`_800w`→`_1600w`, keep `_800w` on 404 [F, aura `:27-34`]); and a licence gate
at selection time ("avoid Unsplash+" [F, unsplash `:17-19`]). The house has none of this
vocabulary: `generation-craft-defaults.md` governs *origin* and *recording*, and its responsive
contract's only composition guidance for imagery is "protect image focal points" [F, `:63`].

**(b) Opus's §F is directionally right but inflated.** "~75% method" counts export-size lists
and section boilerplate as method; the true transferable core is roughly one authored page of
doctrine, not a system. A4 ("per-role selection criteria") is three bullets ("clean negative
space, avoid busy backgrounds, `crop=faces`" [F, unsplash `:108-112`]) — thin, as Codex said.
And Opus's own counter-finding stands and must survive into the final document: **on provenance
the corpus is weaker than the house** — a page URL and "good practice" attribution vs our
`ASSET-MAP.json` + `provenance-loss` failure mode [F, `delivery-assets.md:71-99`]. Keep ours.

**(c) Codex F9 is sustained on the two owner-named items.** Say it plainly, as the owner asked:
- **Lighting: does not exist in the corpus.** The only "lighting" content is incidental
  adjectives inside curated pick titles ("at dusk", "studio portrait", "neon light wave") —
  descriptions of specific photos, not a framework [F, both files]. If DESIGN:OS wants lighting
  doctrine (key/fill contrast, time-of-day mood mapping, lighting-to-persona register), it must
  be **authored in-house or sourced from a photography/art-direction reference**, and the owner
  should treat it as an open gap, not an extractable.
- **Generated-vs-sourced: does not exist in the corpus.** Neither file ever weighs generating
  against sourcing. The house is actually *ahead* here and should build on itself: the asset
  ladder `project asset → approved source → generated asset → intentional no-image`
  [F, `generation-craft-defaults.md:35`] is the precedence order; the spec-008 candidate's role
  split (generate hero/empty-state/texture/avatar/og/mockup; NEVER icon/photo/screenshot/logo
  [I, house memory]) and `build-awwwards-quality-sites`' people-authenticity rules (photos-only
  avatars; no generated people presented as real customers [F, Stage-1 read]) are the seeds of
  the *method*. Author it in-house; do not pretend MengTo supplies it.
- **The hard `hero-background 1:1 fails` linter rule is rejected.** Art-directed square heroes
  and `srcset` crops are legitimate; a file-ratio error would fight responsive art direction.

**(d) The settlement — provider-agnostic, three corrected layers:**
1. **`knowledge/media-art-direction.md`** (new, authored to `authoring-standard.md`): asset-role
   taxonomy with narrative register; role→ratio→export table; composition contract with the
   30–50% text reserve — all marked **candidate heuristics with provenance**, pilot-gated
   before any normative status. Zero provider names, zero URLs. Explicitly note the two gaps it
   does NOT fill (lighting; generated-vs-sourced method) and where those come from instead.
2. **Binary (Art I-safe, validation only):** extend the `ASSET-MAP.json` schema with optional
   provider-neutral fields (`role`, `ratio`, `textReserve`); `ui` validates declaration
   presence/consistency. Any role↔ratio check is **warning-tier at most** (matching the house's
   own `avoidable-screenshot-crop` warning tier), with the primary validation being **rendered
   focal/text safety at 390/768/1440** — Codex's substitution, accepted. No fetching, ever.
3. **Provider adapters as generated host-side workflow templates** (Codex ImageGen 2, Unsplash,
   approved stock, provided assets) — outside `src/`, outside the published kernel, one file
   per provider so a dead provider costs one template. This satisfies the owner's "propose a
   provider-agnostic media sourcing adapter/workflow if warranted" — it is warranted — without
   breaching Art I.

**Disposition: reject-as-canonical-import (frozen URL lists rot; MIT notice applies if any
substantial portion is vendored) / ADAPT the art-direction core / emphatically NOT
reject-from-study.** My Stage-1 R4 verdict is superseded by this ruling.

---

## 3. MUST-MODIFY before the document reaches the owner

**M1 — Pilot redesign (replaces §G; must be arithmetically real and attributable).** [R]
- **Phase A — family-level preference screening** (label it exactly that, per Codex F13):
  4 tranches (T1 aesthetics · T2 motion · T3 devices · T4 media heuristics), each **3 briefs ×
  paired A/B = 6 renders**, plus **1 paired contradiction probe per tranche** = 8 more →
  **32 renders**. Preregistered claim: a tranche win means "this family earns candidate-level
  confirmation" — per-candidate attribution explicitly disclaimed in the preregistration.
- **Phase B — candidate-level confirmation**, only for surviving tranches: **one candidate
  patch per arm-pair**, ≥3 briefs per candidate. Worked example: 2 surviving tranches ×
  3 candidates × 3 briefs × 2 arms = **36 renders**. Program ceiling ≈ **68 renders, 3–5 days**
  — state this cost honestly; the "1–2 days, 12 renders" figure is dead.
- **Judgment honesty (F13, adopted with a boundary — see §5):** owner pairwise + blind curator
  axis pass; at least one duplicated pair to estimate owner self-consistency; results labelled
  *preference screening*. Phase-B pass bar: 3/3 briefs for that candidate (12.5% under a 50/50
  null) AND no contradiction leak AND no floor regression; 2/3 = record, do not adopt, do not
  retry with tweaked values.
- **Repair discipline (F12):** preserve pre-repair outputs; fixed repair budget per arm; report
  pre- and post-repair; lint parity is *eligibility, not control*.
- **Selection manifests (F21):** candidate inclusion/exclusion reasons and failed-capture
  records in the preregistration — prevents cherry-picking activation-friendly references.
- **Own contract:** the pilot *borrows principles from* spec 018 (single-variable arms,
  contradiction/isolation, preserve attempts, "0→0 never counts") and gets its **own
  preregistration contract and result schema** (F14). Do not claim direct harness reuse.

**M2 — Media architecture per §2(d).** No provider code under `src/`. `ui` validates a
provider-neutral manifest only. Ratio/text-reserve = candidate heuristics, warning-tier at
most; rendered-safety validation is primary.

**M3 — Sequencing (settled 2-and-Codex vs 1):** (1) brand-worlds originality boundary into
`prompt-modes.md` — similarity dial as *communication vocabulary*, protected-signature-elements
split, ≥4-changed-elements as a *human heuristic* (never lint, never legal assurance, per F16);
(2) preregister; (3) run the redesigned pilot; (4) Brief #1 (`ui knowledge proof`,
devices-first) seeded by surviving candidates' specimens. Persona-index count-rot fix proceeds
independently and is never cited as evidence about MengTo taste (F15).

**M4 — Security section rewritten (overturns my Stage-1 Brief-#2 cut).** I withdraw my "drop
the DNS/allowlist apparatus; CSP wrapper only-if-inventory" position. The inventory condition
is already met: `from-url.md:293-304` **always** emits `DESIGN.preview.html` and deliberately
re-absolutises remote subresources; `:67-95` has the host `curl` arbitrary user URLs plus every
linked stylesheet [F, Codex-verified, Opus-confirmed]. Final document must require: scheme
validation, DNS/private-range rejection, redirect revalidation, size/type caps, credential
stripping at the host-fetch layer; a **tested** sandbox/CSP/sanitisation contract for the
preview path (event handlers, iframe/object/embed, navigation, forms, remote subresources,
script stripping — tested, not assumed); hash manifest + `ui intake verify` retained, framed as
**integrity, not safety**. The global domain allowlist alone stays omitted (unsuitable for
arbitrary from-url work — the one surviving piece of my original narrowing).

**M5 — All corrected numbers, no stale ones.** 61/79 (77%) negative-constraint union with
per-heading counts and overlap disclosure; median 72 / p75 153 (nearest-rank, definition
published) / 52–55 cluster 23; `gsap-motion-direction.md` gap stated as "limited GSAP
calibration, no Lenis doctrine, no persona-scoped timing DNA" — never "no concrete values"
(this corrects **my own R2**); media gap stated as "zero role→aspect media contracts" — never
"zero grep hits". The false-zero cwd incident is worth one line in the document as a methods
scar; it is the house's own recorded failure class.

**M6 — Art II split (F10).** Every ADOPT/ADAPT item is tagged either **non-normative guidance**
(knowledge prose; no emitter/linter owed) or **enforceable standard** (owes emitter AND linter,
per Art II, with the check being deterministic-structural only). Tuning knobs, boundary
sentences, the invariant/variant sentence, similarity dial = non-normative. `ASSET-MAP.json`
schema fields + their validation = enforceable. Nothing subjective is pretended checkable.

**M7 — Librarian door (F11 + F20).** Add an **`external-candidate` evidence class** to the
librarian loop: advances to `candidate`/`contextual-recipe` on pilot success; studio-wide
`promoted/act` still requires later real-project evidence. The evidence-packet schema is
adapted from `codex/article-prompts-to-skills` (source hash/licence → extracted claim → context
boundary → counterexample → adapted wording → proposed emitter/linter if normative → pilot
result). Do not substitute "4/6 owner wins" for recurrence. This supersedes the draft's route
(i) and my Stage-1 silence on the door's mechanics.

**M8 — Fourth transferable class (F19).** Add `optimize-web-animations`' lifecycle-evidence
method (offscreen pausing, cleanup verification, route cycles, idle measurement) as an
"animation runtime qualification" workflow candidate — more Art-X-relevant than any timing
constant. Both Claude reviews missed it; the final document must not.

---

## 4. MUST-KEEP (survives all three reviews)

1. **The direction:** MengTo/Skills = external expert taste corpus; learn and adapt through a
   governed door; never bulk-import; taste questions settled by blinded comparison, not
   artifact rulers. The prior report's gap-finding half stands (all negative greps reproduce).
2. **Reject-as-default vs reject-from-study distinction**, with reject-from-study now
   containing **only the personal tweet corpus** (see §6 for Neuform).
3. **Brand-worlds adaptation first** — the highest value-per-line find, preventive, and it
   operationalizes the owner's own `reference-must-capture-the-signature` scar.
4. **Card grammar** (tuning knobs + neighbor-boundary sentence + per-card Avoid) into persona
   authoring, tagged non-normative.
5. **Genre-scoped motion bands + T5/Lenis base tokens** as pilot-gated candidates for the
   verified hole (no persona timing DNA; Lenis = 0 hits [F, stands]).
6. **Micro-device corpus** (~30 candidates vs 9 house devices) via the librarian chain.
7. **Stitched-capture discipline** into from-url's screenshot step; **Remix invariant/variant
   sentence** into `prompt-modes.md`.
8. **Maintenance warning:** 109 issues at HEAD, no `.github/`, false `DEMOS.md` claim [F,
   re-run three times across three models] — any adopted gate ships with CI + a demonstrated
   red, or not at all.
9. **Media settlement** per §2 — including the plain statement that lighting and
   generated-vs-sourced are NOT in this corpus.
10. **Opus's provenance counter-finding:** house `ASSET-MAP.json` provenance beats the corpus's;
    keep ours. Honest negative results like this belong in the owner document.
11. **Brief #3 audit half deferred** until cloning/duel volume demands it; **Brief #1 second**,
    seeded by pilot specimens.
12. **Constitutional invariant guard** (no network/model calls/deps in `ui`; provenance-marked
    knowledge entries; full linter set on all pilot outputs; a11y never traded) — now true
    after M2, where the draft's §A claim was false before it.

---

## 5. REJECTED RECOMMENDATIONS (not carried forward)

**From my own Stage-1:**
- R4 "media loss is trivial" — overturned (§2a).
- R2's "no concrete values at all, grep-verified" — false; I mis-verified. Corrected per M5.
- Brief-#2 narrowing to "hash manifest + conditional CSP" — overturned (M4).
- "Reject-from-study, total" on Neuform — narrowed (§6).

**From the Opus draft:**
- `src/adapters/` media layer — Art I violation (B2).
- `asset-role-ratio-mismatch` as a hard error incl. "hero-background 1:1 fails" — rejected;
  warning-tier heuristic + rendered-safety validation instead.
- The 12-render pilot and its "exactly one variable" claim — replaced by M1.
- "Spec 018 is directly reusable" — replaced by "borrows principles, own contract".
- 55/79, median 71, p75 145, cluster 24, "0 aspect-ratio hits", "2 numeric lines" — all
  replaced by corrected values (M5).
- "Templated fill" as an assertion — remains only as an explicitly untested hypothesis; T1 is
  not prejudged from line clustering (F22).

**From Codex (over-reach, not adopted as stated):**
- F13's "use multiple independent blind judges" as a requirement — **rejected as a gate**. This
  is a solo-owner studio; the owner's taste is the product's taste authority, and no pool of
  independent qualified judges exists. Adopted instead: the honest *preference screening* label,
  duplicate-pair consistency checks, the blind curator as second reader, and the stricter 3/3
  Phase-B bar. Statistical humility yes; an unusable evidentiary standard no.
- Any reading of F10 under which knowledge prose must wait on emitters — Art II binds
  *standards/conventions*, not non-normative guidance; the M6 split is the whole fix.
- F9's implied "no ratio checking at all" — softened: warning-tier declaration-consistency
  checking on an opt-in manifest field is legitimate house practice; only *error*-tier
  file-ratio enforcement is rejected.

---

## 6. Legal ruling — Codex's narrowing is ACCEPTED, with two conditions

I accept Codex F17 and overturn my Stage-1 R7 "do not even derive": the defensible boundary for
the 38 Neuform demo HTML files is **quarantine from reuse, redistribution, vendoring, and
treatment/training fixtures** — not a prohibition on looking. Visual study and independently
recreated abstractions are not automatically forbidden. Conditions: (1) any MengTo text vendored
in substantial portion under `references/` carries the **MIT notice**, not merely an
`ease:source` marker — provenance is not licence compliance; (2) Codex's judgment is a model's
legal reasoning, not counsel — **if any Neuform-derived abstraction ever approaches canon, the
owner gets a human legal read first.** The personal tweet corpus remains fully
reject-from-study (identity/provenance, unchanged by any review).

---

## 7. REMAINING UNCERTAINTY (no model can settle these)

**Owner visual judgment required:** the pilot's pairwise winners; whether adapted MengTo
aesthetics read as *authored* beside house personas; whether cinematic T5 tokens feel premium or
sluggish on a real scroll story; whether the 30–50% text-reserve heuristic survives contact with
real house heroes.

**Known unknowns the owner should accept before spending:**
- Honest pilot cost: **up to ~68 renders / 3–5 days** if both phases run — roughly 3× the
  original pitch. The screening phase alone (32 renders, 1–2 days) is a legitimate stopping
  point if T-families lose broadly.
- Whether T1's filled content carries information beyond its schema (the templating question) —
  answerable only by the pilot itself, plus phrasing/provenance analysis if it matters.
- **Lighting doctrine and a generated-vs-sourced decision method do not exist in this corpus**
  and will not arrive by adopting it; both must be authored in-house (seeds: the asset ladder,
  the spec-008 role split, build-awwwards' people-authenticity rules) or sourced from a
  photography/art-direction reference in a future intake.
- Whether a CSP/sanitisation contract for the preview path is *achievable* to the tested
  standard M4 demands — this is an engineering result, not a doctrine; budget for the
  possibility that the preview must be degraded (no remote subresources) to pass.
- Owner-preference screening is exactly that: a win predicts what the owner likes, not
  transferable superiority across future clients or contexts. Studio-wide promotion still
  requires later real-project evidence through the `external-candidate` class.

---

## 8. Bottom line

Three models disagreed productively: the prior Opus report found the right engineering payload
with a wrong taste verdict; my Stage-1 restored the taste question but under-read media,
mis-verified one grep, and over-narrowed security; the Opus draft integrated well but shipped an
impossible experiment and an unconstitutional adapter; Codex caught both, plus real value all
Claude passes missed — and over-reached only on judgment standards. The corrected whole is
sound. **APPROVE with M1–M8 mandatory.** The owner receives: a real, honestly-costed two-phase
pilot; a provider-agnostic media layer that respects Art I; the originality boundary landing
before any reference-led generation; security guards restored where the code actually fetches;
and a governed `external-candidate` door so this corpus — and every future one — enters through
evidence, not enthusiasm.

— Fable 5, Stage 6. Evidence marks: [F] verified against files/commands this session or
re-verified by ≥2 models; [I] inference from verified facts; [R] recommendation/design.
