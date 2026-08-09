# Owner form — blind forced-preference vote (§I)

You are the sole taste endpoint for this pilot. Every judgment below is yours alone; no model
judgment ever replaces it.

## What you see

For each presentation, you see two artifacts — LEFT `<code>` and RIGHT `<code>` (opaque 8-hex
codenames, never arm labels) — plus the brief's facts (`brief-facts.md` from the judging bundle,
codename-neutral). Judge the primary surface named in the brief facts. For Phase-B presentations
with an embedded anti-context state, judge only the named compatible primary surface — the
embedded state is not what you are scoring.

## What you never see or are told

You will never be told which codename is `control` and which is `treatment`. Do not attempt to
infer this from styling, structure, file size, or anything else — the blinding exists so your
preference is not contaminated by knowing which arm is "supposed" to win. Do not discuss any
presentation with the curator, before or after voting. Votes freeze (are hashed and committed)
before any reveal of arm assignment — you will not see revealed assignments until after your
entire vote set for the relevant freeze batch is frozen.

## The record you produce, per presentation

Mirrors the `owner-vote.schema.json` shape:

| Field | Value |
|---|---|
| `presentation_id` | `PR-<8hex>` — supplied to you, do not alter |
| `left_code` | 8-hex codename shown on the left — supplied to you |
| `right_code` | 8-hex codename shown on the right — supplied to you |
| `forced_preference` | `left` or `right` — **no ties are permitted.** You must choose one. |
| `both_fail` | boolean — set `true` if neither artifact is acceptable work, in addition to (not instead of) making the forced choice above |
| `confidence` | integer 1–5 — how confident you are in your preference. **Diagnostic only** — it never weights or filters the endpoint decision. |
| `reason` | non-empty free text — why you preferred the one you chose |
| `voted_at` | ISO timestamp, recorded automatically at submission |

## Instructions

1. You see two artifacts plus brief facts. Judge the named primary surface.
2. Make a forced choice — `left` or `right`. There is no "tie" or "equal" option; if both are
   equally strong or equally weak, you must still pick one, and record `both_fail: true` if
   neither is acceptable work.
3. Do not attempt to infer which side is control or treatment.
4. Do not discuss any presentation with the curator.
5. Votes freeze before any reveal — once your batch is submitted, it is hashed into
   `runs/votes/FREEZE.json` and committed; it cannot be revised afterward.

## What a vote decides

A treatment win is exactly: both arms eligible (passed the deterministic gates, with or without
one legal repair), `both_fail = false`, and your frozen preference resolves to the treatment arm
after reveal. Your `confidence` value never weights or filters this — it is recorded for
diagnostic reading only.
