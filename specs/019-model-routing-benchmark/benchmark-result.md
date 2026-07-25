# Spec 019 — Model-routing benchmark evidence

**Status:** evidence staged; **owner blind verdict recorded 2026-07-24**; routing/knowledge promotion still pending the librarian human-merge step  
**Run:** `wf_7126bcee-f58` (`focused-grid-cheap-model`)  
**Scope:** two landing-page briefs, seven routing arms, two runs per arm (28 corrected builds), plus the six-build pilot and the A6 follow-up.  
**Authority boundary:** the grid/pilot rankings are proxy judgments. The owner has now completed the blind ranking (recorded under **Owner blind verdict** below); that verdict is owner-authoritative taste evidence, but it still does not auto-graduate into a routing default or durable preference without the librarian veto chain + human merge.

## Question

Which parts of a multi-model DESIGN:OS generation flow improve implementation reliability or visual quality, and which apparent wins are artifacts of the judge, brief, or model family?

## Controlled evidence

- The pilot compared an all-cheap self-directed/self-judged arm with frozen Fable direction implemented by Sonnet or Opus.
- The corrected grid compared A0–A6 across Cadence and Haven, with two builds per arm and independent rendered review.
- Deterministic floor checks and subjective rendered judgments were retained separately.
- Cross-family judges reviewed blinded candidates independently; their verdicts were not treated as owner taste.

Source artifacts from the original run were preserved under the Claude workflow scratchpad for run `wf_7126bcee-f58`: `probe-cheap-model/pilot/PILOT-RESULT.md`, `probe-cheap-model/pilot/A6-RESULT.md`, and `grid/GRID-RESULT.md`. The critical read-only Fable review is run `wf_22e91c7c-dac`.

## Demonstrated findings

1. **A deterministic floor is not a quality verdict.** A floor-clean pilot artifact shipped a render-only duplicate-diagram defect that an independent critic caught.
2. **Cross-family critics add defect-finding value.** Independent review caught rendered defects that machine gates and same-path self-review missed. This demonstrates defect-catching value, not objective taste authority.
3. **Taste proxies can diverge materially.** In the corrected grid, Codex ranked the bare A0 arm first on both briefs while Gemini favored DESIGN:OS pipeline arms. Whether DESIGN:OS adds net taste value over bare generation is therefore an unresolved owner question, not noise to average away.
4. **Absolute proxy scores can create false confidence.** The invalid shallow probe produced a confident `8.71` verdict despite omitting the real generation and critique-repair flow. Axis scores remain useful diagnostics, but they are not cross-candidate taste verdicts.
5. **Same-family coder tier showed no separable gain under a frozen direction.** In this sample, Opus-code and Sonnet-code were approximately tied when implementing the same Fable direction. This is narrow evidence about coder tier on these briefs, not a general cheap-first routing doctrine.
6. **Winner labels are judge- and case-dependent.** No model or routing arm earned authority as a durable winner from this run.

## Hypotheses — NOT promoted rules

- Fable direction → Codex implementation (A6) was comparatively consistent, but its mid-pack results on two briefs do not justify even an experimental default.
- Multi-candidate delivery may improve owner choice, but candidate count was not varied in this benchmark.
- Owner-calibrated preference attributes may become useful after repeated blind owner decisions; there is currently no owner-labeled calibration corpus.
- Expensive direction and judge routing remain open questions. In the pilot, all three proxy families ranked all-cheap A1 above Fable-directed A3/A4 on both briefs; this small, imagery-confounded signal points against assuming Fable direction helps. Only the same-family coder-tier comparison produced a replicated narrow signal.

## Safe flow implications pending owner verdict

- Preserve the existing single-candidate generation doctrine.
- Keep deterministic conformance findings separate from subjective critique.
- In benchmark, learning, or contested delivery, surface each independent critic verdict separately.
- Mark material critic disagreement as unresolved by proxy; never manufacture consensus by averaging.
- Use blind owner pairwise adjudication for critic divergence and for proposed knowledge graduation, not as a synchronous gate on every generation.
- Store neither a model winner nor an owner preference until the required authority exists.

## Blocking gate

**STATUS 2026-07-25 — owner half SATISFIED, librarian half OUTSTANDING.** Approve/Reject was
completed by Panel 1 (2026-07-24); the ordinal ranking by Panel 2 (2026-07-25, § Owner blind ordinal
ranking). Panel 2 does **not** discharge the librarian veto chain + human merge, which remains the
live gate on any knowledge or routing change.

The owner must complete the blind top-two / bottom-two ranking for each brief before a librarian PR changes generation knowledge. After that verdict, assess the recorded gaps through the librarian veto chain. The first eligible topic is **critic disagreement handling and verdict confidence**; it must remain one topic, pass `ui knowledge check`, receive a fresh-context judge verdict, and be human-merged.

A single benchmark creates a hypothesis, not a universal rule. Nothing in this record lowers a deterministic gate threshold.

## Owner blind verdict (2026-07-24)

The owner completed the blind ranking. Both briefs × all seven arms were rendered **live and anonymized** (Cadence = C1–C7, Haven = H1–H7) in a local full-fidelity HTML viewer, voted Approve/Reject per candidate, then de-anonymized against the held secret map. Run-1 builds were used for the panel.

| Arm | Direction | Judge | Coder | Cadence | Haven |
|---|---|---|---|---|---|
| A0 bare (no DESIGN:OS) | — | — | Sonnet | ✅ Approve | ✅ Approve |
| A1 all-cheap | Sonnet | self | Sonnet | ✅ Approve | ✅ Approve |
| A5 | Sonnet | cross | Sonnet | ✅ Approve | ✅ Approve |
| A2 | **Fable** | self | Sonnet | ❌ Reject | ❌ Reject |
| A3 | **Fable** | cross | Sonnet | ❌ Reject | ❌ Reject |
| A4 | **Fable** | cross | Opus | ❌ Reject | ❌ Reject |
| A6 | **Fable** | cross | Codex | ❌ Reject | ❌ Reject |

**Single-variable separation.** Approve/Reject is perfectly predicted by one factor: whether **Fable set the creative direction**. Every non-Fable-directed arm (bare, A1, A5) was approved on both briefs; every Fable-directed arm (A2/A3/A4/A6) was rejected on both briefs. Unanimous within each arm across both briefs (14/14 individual votes consistent with the arm-level pattern).

**What it does and does not establish.**
- It supplies the blind-owner provenance the e15 guardrail required, so "Fable direction did not help owner taste on these briefs" is now owner-grounded, not proxy. It corroborates and strengthens the pilot's anti-Fable-direction signal (Hypotheses bullet 4).
- **DESIGN:OS itself is not implicated:** 2 of the 3 approved arms (A1, A5) run the full pipeline with Sonnet direction. The negative signal localizes to Fable-set direction, not the pipeline.
- **Coder tier/family did not rescue Fable direction:** Sonnet, Opus, and Codex Fable-directed builds were all rejected.
- **Scope limits:** n = 2 briefs, 1 judged run per arm, single owner session, Approve/Reject (not full ordinal rank). This is a strong directional owner-taste signal — **not** a universal rule and **not** an automatic routing change.

**Promotion status.** Recorded as owner-authoritative evidence (ledger `insight`, provenance `e11`–`e15`). Any change to generation knowledge or model routing (e.g., de-prioritizing Fable direction, or promoting Sonnet-direction) still passes through the librarian veto chain + human merge; it is not applied by this record. No deterministic gate threshold is changed here.

## Owner blind ordinal ranking — Panel 2 (2026-07-25)

Panel 1's Approve/Reject could not order the three arms it approved. Panel 2 supplied the ordinal
half of the § Blocking gate: a **new run** (`panel-2-RUN-PLAN.md`, preregistered before any candidate
existed), 3 arms × 2 briefs, rendered live at desktop width and anonymized C1–C3 / H1–H3, ranked
best→worst, de-anonymized against a held secret map afterwards.

**It does not pool with panel 1.** Different builds, reconstructed briefs (the originals were lost
with run `wf_7126bcee-f58`'s scratchpad), a different instrument, and a different candidate set.

| Arm | Direction | Judge | Coder | Cadence | Haven |
|---|---|---|---|---|---|
| **A5** | Sonnet | **cross-family (Codex)** | Sonnet | **1st** | **1st** |
| A1 all-cheap | Sonnet | self | Sonnet | 2nd | 3rd |
| A0 bare (no DESIGN:OS) | — | — | Sonnet | 3rd | 2nd |

### Verdict against the preregistered reading

The plan committed in advance to three cases. A0 came **last on Cadence but second on Haven**,
beating a full pipeline arm — the third case.

- **Primary question (does DESIGN:OS beat bare): UNRESOLVED.** "The pipeline" as a category did not
  beat bare, because A1 lost to A0 on Haven. Per the preregistration this records as *no
  owner-grounded separation*; the question stays open. It is **not** a win for DESIGN:OS-vs-bare and
  must not be reported as one.
- **Observed: A5 first on both briefs (2/2).** The plan pre-committed to dismissing a *one-brief*
  A1/A5 difference as noise; two of two falls outside that caveat, so it is recorded rather than
  discarded. **But the plan did not pre-define any criterion for a two-brief lead**, so this is a
  post-hoc observation, not a preregistered finding — it is deliberately *not* called "replication",
  which would grant a favourable secondary result weight the preregistration never authorised.
  Directional only, still not a rule. (Codex Stage-5 finding 2.)

### The load-bearing finding

**A1 held a perfect machine floor on both briefs — `taste-lint` 0, every gate clean — and was ranked
2nd and 3rd. A5 shipped 8 `taste-lint` warnings on Cadence (plus 1 `validate-layout`
`absolute-without-relative` warning; 9 advisory total, 0 errors) and won it.**

This is the first **owner-grounded** support for Demonstrated finding 1 (*a deterministic floor is
not a quality verdict*), which until now rested on proxy judgments. It matches a behavioural split
measured across both build sets: the self-judge spends its repair budget zeroing the machine floor
(0 / 0 warnings), while the cross-judge leaves advisory warnings standing (13 / 20 in the control
set, 8 / 0 here) and instead fixes what another model family flags — dead CTAs, sub-AA contrast,
390px overlaps, unmanaged focus. The owner preferred the latter on both briefs.

### Secondary observations

- **Imagery is not a proxy for craft.** The Cadence winner (A5) generated **zero** images —
  `intentional no-image` on the asset ladder, reasoned in its qualification record — and beat two
  arms that each shipped one. The Haven winner (A5) did use one. A5 won with and without imagery.
- **Asset restraint held.** Given the generated-asset rung, five arms produced exactly one image and
  one deliberately produced none. No arm padded.

### Limits

n = 2 briefs, 1 build per arm, single owner session, reconstructed briefs, judged on craft/detail per
the 2026-07-24 basis. Directional owner-taste evidence only.

**Preregistration is attested, not auditable (Codex Stage-5 BLOCKER, confirmed).** The run plan was
authored before any builder was spawned, but the plan, the candidates, Amendment A1, the result and
the secret map all entered git in a **single commit** (`11c6d5f`), so the repository cannot prove the
ordering — and the plan's mtime postdates the first build set (innocently: A1 was appended per the
plan's own no-edit rule, but an innocent cause is not an audit trail). Read the preregistration as
**author-attested**. On an evidence record this matters, because "trust the author" is exactly what
preregistration exists to remove.
**Rule for every future panel: commit the preregistration in its own commit before generating the
first candidate.** A plan not committed first is not preregistered in any auditable sense.

**Blinding was procedural, not enforced.** The label→arm map was protected by the owner not opening
it. Verified narrowing: the static server was rooted at `panel-2/viewer/` and `secret-map.json` sits
in its parent, so it was never reachable over the panel URL — but no access control, sealed custody,
or access log existed. Claim procedural blinding only. (Codex Stage-5 finding 3.) **No routing default, no durable model
winner, and no knowledge change is authorized by this record.** Promotion still passes the librarian
veto chain + human merge. No deterministic gate threshold is changed here.

### Control set

An imagery-suppressed build set is retained at `panel-2/builds-noimage/` (see Amendment A1 in the run
plan). It was never shown to the owner, so it invalidates nothing, and the two sets together are the
only evidence on record about how much imagery carries for the `e17` "too simple" feedback.

## Owner feedback on evaluation basis (2026-07-24)

Verbatim (owner): *"I blindly check the design, but im voting based on the carefully implement and keen on detail, not just the layout alone. I think some of them still to simple. But it show huge potential that design os work on almost every model."*

- **Judgment basis — craft, not layout.** The blind Approve/Reject above was judged on **careful implementation and keen fine detail**, not layout alone. Read the verdict as a craft/detail judgment — **not** a layout verdict, and **not** a pro/anti-direction routing verdict.
- **Gap noted.** Several outputs still read as **too simple**.
- **Positive cross-model signal.** The cross-model baseline shows **strong potential that DESIGN:OS works across almost every tested model** — a robustness signal, distinct from picking any model as a winner.
- **Boundaries (explicit).** No top-two/bottom-two ranking is implied by this feedback; no additional arm is de-anonymized by it; and **no routing winner is graduated** from it.
