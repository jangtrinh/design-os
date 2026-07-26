# Spec 022 — External Expert Taste-Transfer Preregistration

**Slug:** `022-taste-transfer-prereg` · **Kind:** Art-VII spec header — thin, points at the frozen
protocol and the artifact set rather than restating them.

## Intent

Preregister, before any generation, a two-phase blind pilot testing whether independently
adapted, provenance-recorded MengTo/Skills taste guidance improves DESIGN:OS output on matched
briefs under blind owner preference — without contradiction leakage, without deterministic-floor
regression, and without any legal-originality claim. The frozen protocol
(`PREREGISTRATION.md`, byte-identical to `/private/tmp/PREREGISTRATION-final.md`,
SHA-256 `a6ff529542575f8bd96beca74ebb3f352093d914ee385bc6f160a3fb98ea6cd1`) wins every conflict with
this file or any other artifact in this directory.

## Task list (this stage's scope)

This spec header, `PREREGISTRATION.md`, `roles.md`, `arm-prompt-template.md`, `repair-prompt.md`,
`owner-form.md`, `curator-form.md`, `reconciliation.md`, and the five verbatim
`reconciliation/*.md` copies. Selection/candidate manifests, briefs, patches, schemas, scripts,
and the media-asset manifest are built by sibling builders in this same stage and are pointed to
below, not authored here.

## Pointers to the rest of the artifact set

- `roles.md` — pinned builder/curator/owner identities and the machine-readable roster PR-009 reads.
- `arm-prompt-template.md` — the frozen per-arm prompt assembly template (D5).
- `repair-prompt.md`, `owner-form.md`, `curator-form.md` — the frozen forms and repair frame (§I).
- `reconciliation.md` + `reconciliation/*.md` — the five-document cross-model review chain, hashed
  and preserved verbatim.
- `selection-manifest.json`, `selection-failures.json`, `candidate-manifest.json`,
  `phase-a-briefs.json`, `phase-b-briefs.json`, `patches/`, `schemas/`, `scripts/`,
  `assets/brief-media-manifest.json` — built by sibling builders per the Stage-1 architecture
  (`/private/tmp/fable-prereg-architecture.md`) §B–§L.

## No legal assurance

This artifact set records licence disposition and provenance. It certifies nothing legally: no
assertion of non-infringement, originality, or licence sufficiency is made or implied, and no
model's legal reasoning is counsel. Any Neuform-adjacent abstraction approaching canon requires a
human legal read first.

## How `licence_disposition` was assigned, and why `observe-only` is unused

`selection-manifest.json` has no free-text field for this (its schema is `additionalProperties:
false`), so the derivation is recorded here.

A record is `mit-root-third-party-refs` when its `SKILL.md` contains an `http(s)://` URL **or** its
sibling `demo/source.json` names Neuform. That was measured, not estimated: exactly **38** skills
carry a Neuform-derived demo — the same 38 demo files the cross-model strategy identifies in its
legal-boundary section. `agent-skills/codex/write-like-meng-on-x/SKILL.md` is `reject-identity`.
Everything else is `mit-root`. Resulting distribution: **`mit-root` 77 · `mit-root-third-party-refs`
43 · `reject-identity` 1 · `observe-only` 0** (sum 121).

**`observe-only` is legitimately unused, and the zero is recorded rather than left silent.** The
quarantined Neuform-derived material is the `demo/` tree, which contains no `SKILL.md` and is
therefore outside the 121 selection records entirely; the MIT-licensed authored prose in those 38
`SKILL.md` files is `mit-root-third-party-refs`. This matters because **six of the eleven selected
candidate source files fall inside that 38** (`editorial-tech`, `light-mode-paper-technical`,
`number-details`, `container-lines`, `progressive-blur`, `aura-asset-images`). Marking them
`observe-only` would have made six selected candidates self-contradictory, since `observe-only`
forbids exactly the treatment-fixture use those candidates depend on. The quarantine still holds
where it belongs: no `demo/` HTML, image, font, or page copy is copied, vendored, redistributed, or
used as a treatment or training fixture anywhere in this pilot.

One classification convention, flagged for Stage-6 confirmation: `classification` is a single enum
value per file even where a source feeds two families.
`agent-skills/web-design/documentary-brutalist-agency/SKILL.md` is classified `genre-playbook` (the
file's own governing character) while `selected_candidate_ids: ["A3","M1"]` carries the dual
attribution.

## `brief_hash` rule (pinned, P1)

`brief_hash = SHA-256( UTF-8 bytes of JSON.stringify(briefObject) )`, where `briefObject` is the
parsed brief entry with key order exactly as committed (`JSON.parse` preserves insertion order, so
serializing the parsed object round-trips the committed key order). No pretty-printing, no key
sorting, no whitespace normalization beyond what `JSON.stringify` itself produces. This rule
applies identically to Phase-A and Phase-B briefs, and is implemented identically in
`scripts/validate-prereg.mjs` and in every run manifest producer — there is exactly one
`brief_hash` rule in this pilot, stated once, here.

## `control_commit` rule (pinned, P2)

`control_commit := prereg_commit` — the owner has pinned `control_commit` to the same commit as
`prereg_commit`, the preregistration commitment commit created by the freeze choreography's step 2
below. Both are unknowable inside the first freeze commit (a commit cannot name its own
descendant's SHA — self-reference), so **no literal SHA and no placeholder hash for either value is
written anywhere in this stage.** This file and `roles.md` record only the *rule*; the literal SHA
values enter run manifests at render time, once `prereg_commit` exists as a real commit. The
validator enforces this rule starting at `--mode pre-render` and every mode after — it is never
checked at `--mode pre-freeze`, because no such commit can exist yet at that mode.

## Two-commit freeze choreography (D3)

1. **Freeze commit** — every frozen artifact in this spec dir *except* `randomization-commitment.json`
   and `runs/`; `scripts/validate-prereg.mjs --mode pre-freeze --corpus <pinned-corpus-path>` must
   be green; conventional-commit message, no AI references (Art VI).
2. **Commitment commit** — run `scripts/make-randomization-map.mjs` (writes the secret map OUTSIDE
   the repository, prints its commitment hash), then commit `randomization-commitment.json`.
   **`prereg_commit` = this commit's SHA.** `--mode pre-render` must pass at this exact commit,
   with a clean tree, before any generation begins.

This ordering guarantees the randomization commitment provably precedes every rendered artifact —
its commit is an ancestor of every later render commit, so the commitment cannot have been chosen
knowing any output.

## Secret-map record shape

The randomization secret map (custody: `~/.design-os/prereg-022/randomization-map.secret.json`,
outside the repository working tree) is not a committed schema — only its SHA-256 and structural
counts are committed, in `randomization-commitment.json`. Its record shape, documented here for
anyone auditing the reveal step, is one record per presentation:

```
presentation_id, pair_id, phase, brief_id, left_code, right_code,
left_arm ∈ {control,treatment}, presentation_order (1..56 global),
is_duplicate, endpoint_primary
```

## Two protocol under-specifications this build closes (frozen once committed)

The frozen protocol needs two definitions it does not itself give. The Stage-1 architecture
supplies both; this build treats both as frozen the moment this spec dir is committed — neither is
open for re-decision at render, judging, or reveal time.

**1. Duplicate-self-consistency definition.** The two presentations of a Phase-A duplicated brief
(ordinal 2 of every family) are consistent iff the *resolved winner arm* is identical **and**
`both_fail` is identical across both votes. `confidence` and `reason` may differ between the two
presentations without breaking consistency. The endpoint vote for that brief is whichever
presentation is flagged `endpoint_primary: true` in the secret map — assigned at map-generation
time, before any output exists, by its own independent CSPRNG coin.

**2. Owner-voting scope definition.** The owner votes on all 16 Phase-A pairs plus the 4 duplicate
presentations (20 owner forms total for Phase A), and on all rendered Phase-B pairs.
Contradiction-pair votes (the ordinal-4 brief in every family) are diagnostic only and never count
toward the three-ordinary-wins endpoint that decides whether a family survives to Phase B.

## Arm-visible brief projection (P7) — Stage-3 resolution, flagged for Stage-6 confirmation

**This is a Stage-3 resolution of a genuine protocol/architecture under-specification, not
settled architecture. A later reviewer (Stage 6 or any subsequent audit) should re-open this
section if the resolution below turns out to be wrong.**

Protocol L68 requires that "source names, skill files, provider names, candidate labels, and
sibling output remain hidden" from arms. Architecture D5 assembles the per-arm prompt as
template + brief JSON + [treatment only] one patch. Taken literally, the brief JSON hands every
arm its `candidate_id`, its `brief_id` (which itself encodes the candidate), and — on
contradiction briefs — the leak definition being probed, which would defeat the contradiction
probe outright. **The protocol wins.**

Resolution: the per-arm prompt concatenates (1) `arm-prompt-template.md`, (2) the **arm-visible
projection** of the brief, (3) treatment arms only: exactly one patch file. `prompt_hash` is
SHA-256 over the fully assembled prompt bytes, exactly as before — only the second ingredient
changes, from "the raw brief object" to "the projected brief object".

The projection is the committed brief object with a fixed key list removed, applied identically
to both arms of a pair so it can never itself create an arm differential:

- **Phase A** — remove `brief_id`, `candidate_id`, `family`, `ordinal`, `role`,
  `is_duplicate_source`, `anti_context_condition`.
- **Phase B** — remove `brief_id`, `candidate_id`, `family`, `ordinal`,
  `anti_context.leak_definition`, `anti_context.deterministic_leak_checks`.
  `anti_context.embedded_state` and `anti_context.inactive_requirement` are **retained** in
  Phase B — the arm must actually build that embedded section and know it stays plain; both arms
  receive it identically.

Every other key is retained verbatim, in committed key order, serialized with `JSON.stringify`
(no pretty-printing, no key sorting). The full removal-list rule and rationale are transcribed in
`arm-prompt-template.md`; that file and this one must be kept in sync if this resolution is ever
revised. The committed brief files (`phase-a-briefs.json`, `phase-b-briefs.json`) still contain
every field named above — the schemas are unchanged; projection happens only at prompt-assembly
time.

### Supplied assets are renamed, not merely un-keyed (Stage-6 finding B4)

Removing the identity **keys** was not sufficient, and the first implementation of this resolution
leaked. `supplied_assets[].asset_id` and `.manifest_ref` survive the removal list carrying values
that restate the brief id verbatim — `PA-MED-1-wide-1` hands back both `PA-MED-1` and its family,
and the Phase-B media ids hand back the candidate label as well — so an arm reconstructs its own
identity from a field the removal list never touched. That is exactly what P7 exists to prevent,
and exactly what `arm-prompt-template.md`'s own stated goal forbids. All nine media-asset briefs
leaked this way.

The projection therefore **replaces** each supplied asset with a neutral, role-indexed alias
`{ "asset_ref": "asset-<role>-<n>", "role": "<role>" }` — it does not drop it, because the arm
still has to reference the asset it was given:

- `<role>` is read from the **frozen `assets/brief-media-manifest.json` record** for that asset
  id — never inferred from substrings of the id itself, which is an identity signal in its own
  right (`assetRoleMap()` in `scripts/lib/prompt-assembler.mjs` builds the lookup once from the
  frozen manifest);
- `<n>` is the 1-based index of the entry **within its role group, in the brief's own committed
  `supplied_assets` order**;
- `manifest_ref` is dropped entirely — no other key from the committed entry survives.

The alias is a pure function of the brief plus the frozen manifest and is applied identically to
both arms, so like the removal list it can never create an arm differential. Because numbering
restarts per brief, two briefs with the same asset-role shape now project byte-identical
supplied-asset blocks. Projecting a `supplied_assets` entry whose `asset_id` is absent from the
frozen manifest is a fail-closed error, not a silent pass-through.

The same neutral aliases govern **judging bundles**: at bundle time every embedded asset reference
is rewritten to its neutral alias and the asset is copied under that name, so no committed asset id
reaches the blind owner (`PREREGISTRATION.md` L131). One naming rule, in
`scripts/lib/prompt-assembler.mjs` (`assetIdToNeutral`), is consumed by both the prompt assembler
and the packager — a second implementation would reintroduce the leak in the bundle. `PR-020`
rejects any assembled prompt containing a committed asset id, a committed media path, or the raw
`manifest_ref` prefix, and `PR-023` rejects any judging bundle that does; the standard has both an
emitter and a linter.

## Article VIII scope (architecture §F.2)

Article VIII (anti-fabrication) applies to *artifacts inventing beyond the brief* — a generated
arm stating a metric, testimonial, client, or award not present in its brief's `product.facts[]`
is a content-gate failure. It does **not** apply to the brief fixtures themselves: expanding each
Phase-B brief's `product.facts[]` with 4–8 fixed, invented, internally consistent facts (names,
figures, labels), following the Phase-A pattern, is mechanical fixture-writing performed once at
freeze time, not a live generation inventing content mid-pilot. Once frozen at the freeze commit,
those facts become the only permissible content for that brief's arms.

## What each phase licenses, and what neither licenses (architecture §M)

- **Phase A** licenses exactly: "under these frozen briefs, this blind owner preferred the arm
  carrying this family's combined patch 3/3, with no contradiction leak, eligibility on both arms,
  curator non-veto, and duplicate self-consistency." This is family-level screening **only** — it
  cannot attribute benefit to any individual candidate (the family patch is a bundle of several
  candidates' contracts), and it gates *who enters Phase B*: all candidates of a surviving family,
  never a subset chosen after the fact.
- **Phase B** licenses exactly: "this single candidate patch, as sole treatment variable over the
  bare knowledge core, won 3/3 under frozen briefs with zero anti-context leakage and no veto." It
  attributes at candidate level, for these briefs and this owner's taste only.
- **Neither phase** establishes universal superiority, transferable client taste, legal
  originality, or model-routing policy. Deterministic gates are eligibility/safety floors —
  passing them adds no taste credit.
- A passing candidate advances **only** to `candidate/contextual-recipe` status through the
  governed external-candidate librarian door. It never becomes a global default, and it is never
  treated as canonical `act` evidence from this pilot alone. Studio-wide graduation to `act`
  requires **independent real-project recurrence** — a preregistered owner win here does not
  substitute for that recurrence, because recurrence exists specifically to stop one context's
  taste from becoming studio law, and one person judging repeated briefs is not automatically
  stronger evidence than that.

## Media pack (P4) — blocker RESOLVED, pack complete

**History, kept because the resolution only means something against it.** A repo-wide search at
an earlier stage found no licence-cleared photographic asset and no provenance/licence record for
any image in this repository, so `assets/brief-media-manifest.json` was committed in an explicitly
incomplete state carrying `"assets": []`, and `PR-014` failed RED at `--mode pre-freeze` by design.
No image was ever downloaded, generated, or invented to close that gap (D9, Art VIII, and house
doctrine forbidding generated people).

**The blocker is resolved.** The owner amended the original local-assets-only media pin to permit
**Wikimedia Commons sourcing under an allowlisted licence set** (CC0 / Public Domain / CC BY /
CC BY-SA), with per-asset provenance recorded at freeze. That amendment is recorded here and in
`assets/brief-media-manifest.json`'s `source_policy`, because an authorization that lives only in
a chat log is not part of the frozen record.

The pack is now complete and the gate turned green on its own, without any relaxation of `PR-014`
— which was instead **tightened**: it now validates the entire manifest, not only brief-referenced
records. Frozen state:

- exactly **30** assets, `asset_count` agreeing, unique `asset_id` / `path` / local `sha256`;
- role census **wide 9 · macro 6 · headshot 4 · portrait 4 · directory-headshot 6 ·
  presskit-headshot 1**, matching `required_roles` asset-id sets exactly;
- every record referenced by a brief; no orphan, no unresolved reference, no substitution;
- declared `width`/`height` equal to the dimensions parsed from the actual bytes, and the role
  ratio contract satisfied;
- full provenance per record: creator, allowlisted licence label and URL, Commons `File:` page,
  original and downloaded-derivative `upload.wikimedia.org` URLs, 40-hex `source_sha1`, ISO-8601
  UTC `source_revision_timestamp`, crop method;
- a non-empty non-identity / non-endorsement `identity_disclaimer` on every person-bearing role,
  and `null` on landscapes and macros.

**What this does NOT establish.** Validation is offline by design (D12), so the *live truthfulness*
of each Commons licence and creator field is not machine-verified here. The recorded `source_sha1`
and revision timestamps exist precisely so that claim stays auditable after the fact. That is the
honest posture, not a gap to be closed by adding a network call to the freeze gate.
