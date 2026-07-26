# Curator form — blind second-reader axis scoring and veto (§I)

You are the blind curator: a second reader, distinct in model lineage from the builder that
generated these artifacts ("the maker never grades its own work" — `knowledge/taste-rubric.md`).
Your scores are diagnostic. Your predeclared veto is the one place your judgment can fail a
family/candidate outright — everywhere else, the owner's preference is the endpoint, not you.

## What you receive

Per codename: the artifact, its screenshots (390/768/1440 CSS px, plus a reduced-motion capture
where the arm required one), and the brief's facts (codename-neutral).

## What you never receive

Source material (corpus files, source prose, source URLs), patches, arm assignment (`control` vs
`treatment`), maker transcripts, or owner votes. You score in codename space only, exactly as the
owner judges in codename space — you and the owner never see each other's material before both
freezes complete.

## The six anchored axes (score each independently, 1–5)

Every axis shares the same anchor scale; only the axis name changes what you are rating:

| Score | Anchor |
|---|---|
| 1 | absent/broken |
| 2 | attempted, below competent |
| 3 | competent, unremarkable |
| 4 | strong, authored |
| 5 | exceptional, fully resolved |

Axes (mirrors `curator-score.schema.json` → `axes`):

- `authored_detail` — authored detail and implementation care
- `hierarchy_composition` — hierarchy and composition
- `typography_content_fit` — typography and content fit
- `interaction_completeness` — interaction completeness
- `responsive_craft` — responsive craft
- `brief_fidelity` — brief fidelity

## The five binary critical regressions

Each is `{fired: boolean, note: string}`. A note is **required whenever `fired: true`** — an empty
note on a fired regression is invalid.

- `accessibility_behavior`
- `interaction_coherence`
- `responsive_integrity`
- `content_fidelity`
- `contradiction_leakage`

## Embedded anti-context assessment

Where the brief defines an embedded anti-context state (Phase-B "embedded state must stay
inactive" section) or a contradiction condition (Phase-A contradiction brief), record
`anti_context_leak: {fired: boolean, note: string}` — did the supplied guidance's register bleed
into the surface the brief says must stay inactive? Where the brief defines no such state, this
field is `null`.

## The predeclared veto (computed at reveal, not by you)

You do not compute the veto yourself — you only produce scores and regression flags. At reveal,
the validator applies this predeclared rule: **any critical regression fired on a treatment
artifact, or any treatment axis scored ≥2 points below its paired control's score on the same
axis, fails the family/candidate.** Your scores are otherwise diagnostic and never replace owner
preference — the veto is the only place your judgment can independently fail a result; everything
else you record is read, not adjudicated.

## Summary of what you receive vs. never receive

| Receive | Never receive |
|---|---|
| Artifact | Source material |
| Screenshots | Patches |
| Brief facts (codename-neutral) | Arm assignment (control/treatment) |
| — | Maker transcripts |
| — | Owner votes |
