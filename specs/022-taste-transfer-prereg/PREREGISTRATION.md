# Spec 022 — External Expert Taste-Transfer Preregistration

**Status:** frozen protocol; this file and every referenced experiment input MUST be committed before any render
**Program:** MengTo/Skills external-expert-corpus evaluation
**Pinned upstream:** `MengTo/Skills@21b278c62f49f3ce3d8c8ecbcc84cbcd534f3e49`

## Question and evidentiary boundary

Does independently adapted, provenance-recorded taste guidance improve DESIGN:OS output on matched briefs under blind owner preference without contradiction leakage or deterministic-floor regression?

Phase A is family-level screening. A win means only that the family earns candidate-level confirmation; it cannot attribute benefit to an individual candidate. Phase B is candidate-level confirmation under frozen briefs; it does not establish universal superiority, legal originality, or model-routing policy. Deterministic checks establish eligibility and safety floors, not visual excellence. Model judgments never replace owner taste.

A passing candidate may advance only to `candidate/contextual-recipe`. It cannot become a global default or canonical `act` evidence from this pilot. Studio-wide graduation requires independent real-project recurrence through the governed `external-candidate` librarian door.

## Mandatory committed evidence

The experiment directory contains, before rendering:

- this `PREREGISTRATION.md`;
- `selection-manifest.json` covering every considered upstream `SKILL.md`;
- `selection-failures.json`;
- `candidate-manifest.json`;
- `phase-a-briefs.json` and `phase-b-briefs.json`;
- `patches/phase-a/*.md` and `patches/phase-b/*.md`;
- schemas for run manifests, results, selection failures, owner votes, curator scores, and randomization commitments;
- `repair-prompt.md`, `owner-form.md`, `curator-form.md`, and `reconciliation.md`;
- `scripts/validate-prereg.mjs`.

Generation is forbidden until validation passes, the Git tree is clean, and the preregistration commit is recorded. Every run manifest records the preregistration commit, control commit, exact provider/model identity, source hashes, brief hash, and adapted-patch hash. A dirty-tree run is invalid.

## Selection and source boundaries

`selection-manifest.json` contains one record for every upstream skill at the pinned commit: path, SHA-256, licence disposition, classification, selected candidate IDs, disposition, and reason. Missing or unreadable sources are recorded in `selection-failures.json`; they cannot be silently replaced.

The 12 frozen candidates in `candidate-manifest.json` are the complete pilot set:

- A1 editorial-tech DNA
- A2 paper-technical DNA
- A3 documentary-brutalist genre playbook
- M1 brutalist contextual motion band
- M2 product-proof state/stagger band
- M3 cinematic scrub calibration
- D1 number details
- D2 container lines and corner markers
- D3 progressive blur
- D4 scroll-progress timeline
- P1 role-to-ratio and text-reserve media contract
- P2 portrait narrative register

Treatment text is independently expressed. Source prose, tables, exact Tailwind/shadow strings, model metadata, provider/account coupling, fixed URLs, and source assets cannot enter an arm. Neuform is observe-only: no copying, vendoring, redistribution, or treatment/training fixtures. The personal tweet corpus is rejected. Lighting doctrine and generated-versus-sourced policy are absent from this corpus and cannot be credited to it.

Every candidate in a Phase-A-surviving family proceeds to Phase B. There is no post-output capacity selection.

## Frozen Phase A

Each family has three ordinary matched briefs and one contradiction brief:

- **Aesthetics:** privacy-first map SDK; climate research archive; creative-technology case study; contradiction: calm pediatric appointment flow.
- **Motion:** industrial-design launch; B2B product-proof page; museum exhibition story; contradiction: dense financial-operations form.
- **Devices:** annual-report data story; architecture portfolio; long research article; contradiction: urgent account-recovery flow.
- **Media:** climate campaign hero; executive profile; material-product launch; contradiction: authenticated admin console with no approved imagery.

The machine-readable brief file freezes facts, assets, acceptance checks, context boundaries, anti-context conditions, and gate sets. Across each pair, product facts, assets, model/provider, environment, orchestration, time limit, repair protocol, viewport set, and acceptance criteria are identical.

- **Control:** exact committed foundations knowledge core.
- **Treatment:** control plus exactly one hashed Phase-A family patch.
- Source names, skill files, provider names, candidate labels, and sibling output remain hidden.
- Family patches contain only portable contracts and explicit context/anti-context boundaries.

A family survives only if treatment wins all three ordinary owner votes, every arm remains eligible, no contradiction leakage occurs, the curator veto does not fire, and its duplicate response is self-consistent. Otherwise the family stops. Values are not tuned and pairs are not rerun.

## Frozen Phase B

Phase-B control is the exact committed foundations core without Phase-A family patches. Treatment is that control plus exactly one committed and hashed candidate patch. Family patches never enter Phase B.

Every candidate has three frozen cross-domain briefs:

- A1: developer SDK; research evidence archive; technical procurement report
- A2: policy memo; materials catalogue; standards documentation
- A3: agency case study; cultural-institution report; public-interest investigation
- M1: industrial launch; live-event identity; experimental-studio case study
- M2: B2B workflow proof; analytics launch; infrastructure product tour
- M3: museum narrative; destination story; film/archive exhibition
- D1: annual report; scientific metrics story; logistics-performance report
- D2: architecture portfolio; engineering consultancy; exhibition catalogue
- D3: long-form research; editorial feature; premium-material story
- D4: standards guide; policy explainer; multi-chapter case study
- P1: climate campaign; travel editorial; premium-product launch
- P2: executive profile; researcher biography; artist interview

Each brief contains one compatible primary surface and one embedded anti-context state where the candidate must remain inactive. The owner judges the compatible surface. Curator and deterministic checks assess both. Contradiction evidence adds no generated artifacts.

A candidate passes only with treatment wins on all three owner votes, every arm eligible, zero anti-context leakage, and no curator veto. A 2/3 result is recorded and rejected; no retuning, replacement, or rerun is permitted.

## Builder, roles, and artifacts

Builder, owner, and curator are separate roles. The builder never votes. The curator receives no source, patch, assignment, maker transcript, or owner vote. The owner receives no curator scores before votes are frozen.

Every arm uses a fresh context and the same exact pinned provider/model identity. One artifact is generated per arm. Preserve source, output, console log, gate envelope, run manifest, initial artifact, optional repaired artifact, and screenshots at 390, 768, and 1440 CSS px; motion arms additionally receive reduced-motion capture.

## Frozen repair protocol and endpoint

The primary artifact is the post-protocol artifact:

1. Generate once from the frozen arm prompt.
2. Run frozen deterministic eligibility gates.
3. Only if a listed machine gate fails, permit exactly one repair using `repair-prompt.md` with the artifact, original brief, and machine findings only.
4. The repair receives no sibling arm, source material, owner/curator feedback, or treatment guidance beyond its own frozen arm.
5. If all gates pass initially, repair is prohibited.
6. Run gates once more. The unrepaired initial output or sole repaired output becomes the primary artifact.
7. Preserve both versions. Initial-state and repair-rate analyses are diagnostic only.
8. A still-ineligible artifact is not regenerated.

Undefined correction reduction, including 0→0, is `null`, never improvement.

## Eligibility and fail-closed truth table

Applicable floors include build, console, layout, accessibility behavior, DS usage, content/flow, required-state completeness, responsive behavior, and reduced motion. Passing adds no taste credit.

- Either arm ineligible after the protocol: pair non-confirmatory and family/candidate fails.
- Missing artifact, evidence, vote, curator score, map commitment, or hash: pair non-confirmatory and family/candidate fails.
- `both_fail=true`: no treatment win regardless of forced preference.
- Duplicate inconsistency: affected Phase-A family fails.
- Contradiction leak or critical deterministic/curator regression: family/candidate fails.
- Failed or ineligible runs cannot be regenerated or replaced.

## Randomization, blinding, and duplicate

Before any output exists, generate the complete Phase-A and Phase-B run-ID, codename, left/right, and presentation-order map with cryptographically secure randomness. Store the secret map outside the judging tree. Commit its SHA-256 and schema-valid public commitment before rendering. The map cannot be regenerated.

Judging bundles expose only opaque codenames. Paths, URLs, HTML metadata, titles, filenames, comments, source maps, logs, and interaction links must not reveal arms or candidates.

Phase-A ordinary brief 2 in every family is presented twice under fresh codenames with independently randomized left/right order. There is no fallback duplicate. Presentation duplication does not create another artifact.

## Owner endpoint

Every primary pair records:

- forced preference: `left | right`;
- `both_fail: boolean`;
- confidence: integer 1–5;
- non-empty reason.

A treatment win is exactly: both arms eligible, `both_fail=false`, and the frozen preference resolves to treatment after reveal. Confidence is diagnostic and never weights or filters the endpoint.

## Curator veto

The blind curator scores anchored 1–5 axes:

- authored detail and implementation care;
- hierarchy and composition;
- typography and content fit;
- interaction completeness;
- responsive craft;
- brief fidelity.

It separately records critical regressions in accessibility behavior, interaction coherence, responsive integrity, content fidelity, and contradiction leakage. The veto fires on any critical regression or a treatment score at least two points below control on any axis. Curator scores are diagnostic and this predeclared veto cannot substitute for owner preference.

## Arithmetic

- Phase A: 4 families × 4 pairs × 2 arms = **32 generated artifacts**.
- Phase B for `s` surviving candidates: `s × 3 × 2`, where `s ∈ [0,12]`.
- Maximum Phase B: **72** artifacts.
- Program maximum: **104** generated artifacts.
- Viewport and reduced-motion captures are evidence, not additional generated artifacts.

## Reveal and records

Freeze and hash owner and curator forms before revealing assignments. Every result records brief hash, artifact hashes, builder identity, opaque codes, eligibility, pre/post-repair outcomes, owner vote, curator axes, contradiction result, randomization commitment, and revealed assignment. Missing or failed attempts remain preserved.

No candidate advances until the result validates against the committed schema.

## Cross-model reconciliation

`reconciliation.md` identifies and hashes the full Opus report, Fable initial review, Codex cross-check, Fable final review, and corrected consolidated strategy. It preserves the intermediate Codex `BLOCKER`, later Fable `APPROVE`, disputed measurements, reruns, and final dispositions. Critic disagreement is surfaced, never averaged into false consensus.
