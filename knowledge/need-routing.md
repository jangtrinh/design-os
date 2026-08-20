---
id: need-routing
description: "The need→verb decision procedure — how an agent turns a stated need into the right design:os application, with the three mandatory asks and the selection-route law."
when: [routing, which-verb, need, what-command, intent, "which workflow", ask-or-generate]
---

# Need routing — from a stated need to the right design:os application

## Purpose

A user states a NEED ("landing page cho spa", "dashboard giống trang X", "bộ slide pitch").
This file is the ONE authored home of the decision procedure that turns that sentence into
a verb (or a sequence, or a single question). Agents and host sessions read it at task
time; per-verb trigger language stays canonical in each workflow's frontmatter
`description:` — never duplicated here. Invocation details are never memorized: form
commands from `ui schema --json`, verify what is checkable here with `ui gate coverage`.

## Mental model

Routing is a chain of ordered gates — first match wins. Meta needs route before artifact
classes; artifact classes before input sources; input sources before the new-vs-existing
fork. Two laws govern every leaf:

1. **Verb ambiguity costs one question; taste ambiguity costs zero questions — it costs
   variants.** Unsure WHICH verb: ask exactly one question (the three sanctioned asks
   below). Unsure what it should LOOK like: never interrogate — take the selection route
   (3–5 directions, the user picks). Choosing between rendered options is the cheapest
   judgment a human makes.
2. **Never guess an invocation.** `ui schema --json` is the source of flags and
   subcommands; a remembered flag is a guessed flag.

## The gates

Walk them top-down, first match wins — but SPLIT composites before walking: a
need that names BOTH a reference source (URL, image, repo) AND an artifact to
produce or change routes to a sequence (Composition rule below), never a single
leaf. The reference decides the capture leg (G3 verbs); the artifact decides the
production leg (G1 verbs for chart/diagram/slides, G4 for surfaces). A gate that
fires on the reference alone ("a live URL → `from-url`") must never swallow the
artifact half of the sentence.

**G0 — meta and ops (no new artifact).** "Why is X this way / what was decided" →
`why`. "Log this interview / finding / transcript" → `evidence`. New project / setup →
`init`. "Teach the tool my existing design system": whole repo with a UI → `learn`;
a single HTML file → `extract`; a live site to capture as a portable spec → `from-url`.

**G1 — deliverable class.** A structural/sequential/hierarchical picture → `diagram`.
A comparison of quantities → `chart`. A deck → `slides`. A chart INSIDE a page belongs
to `generate`; inside a deck, to `slides` (composition, not a chart artifact).

**G2 — Figma-canvas needs, and the bare "audit" that names no target.** Design
something new on canvas → `design`. Push existing output or intent onto canvas →
`to-figma`. Normalize an existing Figma file against the DS → `audit`. Review or
close Figma comments → `figma-comments`. A bare "audit" with NO target named —
this gate still owns it, even though no canvas was mentioned → **ask #1** (the
four-surface question in `templates/journeys/daily.md` §1 — link, don't restate).

**G3 — an input is in hand (HTML surface).** Two checks BEFORE any leaf fires:
(1) if the reference is aimed at an EXISTING artifact ("make this dashboard look
like stripe.com", "làm giống vầy" + image, about a current screen), the reference
is a capture STEP, not the destination — capture it, then continue at G4 for the
existing artifact's verb; never terminate at the capture verb. (2) if the
reference arrived without a sentence saying replicate-vs-inspired → **ask #3**
below, first. Then the leaves: a figma.com URL to turn into code → `figma`. A
screenshot or image file → `from-ref`. A live URL → `from-url`. Words only → G4.

**G4 — does a generated artifact already exist here?** No → `generate`. Yes: same
direction plus a vibe-word nudge → `iterate`; same direction but a craft/quality problem
("polish", failing axes) → `refine`; direction rejected outright → `redesign`; cannot
tell which → **ask #2** ("keep this direction, or throw it away?").

**Ask #3 — the ambiguous reference.** A reference handed over without a sentence saying
replicate-vs-inspired: ask once. It decides faithful capture (`from-url`/`from-ref`,
Replicate mode) versus capture-then-generate (composition below).

**Composition rule.** A need that combines an artifact with a reference source
("dashboard giống trang X", "chart giống trang X") routes to a SEQUENCE, never one
leaf: capture first (`from-url` / `from-ref` / `extract` / `learn`), then the
artifact's own production verb against the captured spec — `generate` for a
surface, `chart` / `diagram` / `slides` for those classes, or the G4 verb
(`redesign` / `refine` / `iterate`) when the artifact already exists. The route
table lists the common composites; other chains follow the same capture-then-
produce shape.

**Defaults — never ask about these.** Prompt mode → Replicate (`prompt-modes.md`).
Output surface → HTML unless Figma is explicitly named. Persona → the pick-persona
skill. Anything taste-shaped → the selection route, zero questions.

## Route table

The anchored, machine-checked map (the `routing-verb-uncovered` /
`routing-unknown-verb` pair in `ui knowledge check` keeps this table exactly in step
with the live verb registry — a new capability cannot ship until this table teaches it).

| Need class (first match wins) | Route |
|---|---|
| Why does X look/behave this way; what was decided | `why` |
| Record an interview, finding, or transcript as evidence | `evidence` |
| New project, first-time setup | `init` |
| Teach the tool an existing DS from a whole repo | `learn` |
| Teach the tool an existing DS from one HTML file | `extract` |
| Capture a live site as a portable design spec | `from-url` |
| A structural / flow / hierarchy picture | `diagram` |
| A quantitative comparison graphic | `chart` |
| A presentation deck | `slides` |
| Design something new on the Figma canvas | `design` |
| Push existing output or intent onto the Figma canvas | `to-figma` |
| Normalize / clean an existing Figma file against the DS | `audit` |
| Triage or close Figma comments | `figma-comments` |
| Convert a figma.com URL into code | `figma` |
| Reproduce or draw from a screenshot / image | `from-ref` |
| A new surface from words alone | `generate` |
| Nudge an existing artifact, same direction | `iterate` |
| Fix craft/quality on an existing artifact, same direction | `refine` |
| Replace the direction of an existing artifact | `redesign` |
| New artifact modeled on a live site (composite) | `from-url` then `generate` |
| New artifact modeled on a screenshot (composite) | `from-ref` then `generate` |
| Re-aim an EXISTING artifact at a reference (composite) | `from-url`/`from-ref` then the G4 verb (`redesign`/`refine`/`iterate`) |

## Cross-references

- Per-verb trigger language: each `templates/workflows/<verb>.md` frontmatter (canonical).
- Fidelity modes (Replicate/Enhance/Adapt): `prompt-modes.md` — fidelity, not routing.
- The four-surface audit question: `templates/journeys/daily.md` §1.
- What is verifiable in this project right now: `ui gate coverage`.
