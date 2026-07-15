# Spec 001 — Skill-suite P2: skills-only dogfood

**Status**: ready · **Stage**: implement · **Tracking**: GitHub issue (see tasks.md)
**Constitution**: Article III (real data), Article V (three-tier pipeline)

## What

Prove that the three journey skills (`design-os-onboard`, `design-os-daily`,
`design-os-deliver`, shipped in `fc4adee`) can carry an agent through the FULL
design:os journey **without reading the README or any plans/** — the skills are
the only guidance.

## Why

The journey skills exist so a mass user's agent self-navigates. Until an agent
actually onboards a fresh project AND re-onboards a real brownfield project
(VSF-PCP) skills-only, the suite is a claim, not a capability. This is the P2
phase of the skill-suite initiative (P1 shipped: templates + rename + linters).

## Acceptance criteria

1. **Fresh-project run**: in a clean scratch project, an agent given only the
   installed skills completes: entry-route decision (E1 greenfield) → ds init →
   soul scaffold → agents init → heartbeat config → first DESIGN_OK beat —
   with zero human course-correction on sequencing.
2. **Brownfield run (VSF-PCP)**: an agent given only the skills re-derives the
   correct onboarding: E4/E2 route, git prerequisite flag (VSF has no git —
   skill must surface it), manifest-name hygiene, soul layer selection, agents
   verify, heartbeat beat — and runs the daily loop (audit disambiguation:
   picks the right of the four "audit" surfaces for two scripted asks).
3. **Delivery run**: on VSF, the agent executes the deliver playbook order
   (static → rendered gates) and produces the handoff summary, never claiming
   "accessible/conformant".
4. Every friction point (wrong turn, missing fact, ambiguous instruction) is
   logged as a finding with the template line that caused it.
5. Findings feed one fix round (template edits only, re-gated), then verdict:
   PASS (≥ criteria 1-3 clean) unlocks P3 distribution; FAIL loops.

## Non-goals

- P3 distribution (`npx skills add` channel, catalog) — separate spec.
- New kernel/conductor features — template edits only in the fix round.

## References (repo-committed)

- Journey templates: `templates/journeys/{onboard,daily,deliver}.md`
- Linters: `tests/journey-command-consistency.test.ts`, journey drift in `ui doctor`
- Prior art (gitignored archive, single-machine): `plans/260715-designos-skill-suite/`
