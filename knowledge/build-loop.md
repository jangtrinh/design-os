---
id: build-loop
description: "The measure-then-decide build loop every UI builder runs, whatever the model — instruments proven first, one data model, probe + screenshot every round, deviations with numbers."
when: [build-loop, reference-render, screenshot-loop, probe, measure, deviations, builder-protocol, model-agnostic, evidence-round]
---

# Build Loop — how a UI gets built so the render, not the spec, is what gets judged

## Purpose

Fix the working method that separated the one approved reference render from three rejected ones
built from the same direction, so any model asked to build UI follows the same loop.

## Mental Model

A direction says what to draw. A gate says whether the markup is legal. Neither says whether the
page **renders** as intended. The only thing that does is a measurement taken from the rendered page,
read by the builder before the next decision. The loop below is therefore a measurement loop with
drawing inside it, not a drawing session with a check at the end. On 2026-09-27 three frontier
models and one fast model built the same screen from one pixel-level direction; the approver took the
one whose builder logged element positions every round and changed copy when a number said the row
overflowed. The others changed structure by taste, or never looked at a render at all. The model was
not the difference. The loop was.

## When to Use / When NOT

**Use** for every task that produces a rendered surface from a brief, a direction, a Figma frame or a
reference render: a new screen, a state (empty, loading, error), a viewport, a persona re-skin, a
reference for a cheaper model to reproduce.

**Do NOT** use for pure logic, data, build-config or test changes that alter no rendered output, and
do not run it against a runtime that cannot screenshot — that runtime is not a builder for this
work (see step 2).

## The loop

Steps 1–3 run once before the first line of markup. Steps 4–8 repeat per round. Bounded passes:
build fully → inspect once at every width → fix everything in one batch → confirm with at most one
more round. An open-ended self-QA spiral is a failure, not diligence.

### 1. Read the whole rulebook, then the inputs, in this order

ALLOWED: `cat` the governing files end to end — the design skill's floor and checklist, the
direction or frame, the brief, the soul, the token file, the pattern card. NOT ALLOWED: grepping a
rulebook for the part that seems relevant, because the rule that bites is the one the grep did not
match (a `grep`-sized read manufactures false confidence the same way it manufactures false findings).
Write down which inputs bind (the direction), which inform (the pattern card) and which are the
builder's call, before anything is drawn.

### 2. Prove the instruments and the runtime before trusting either

- Run `--help` on every gate you will cite and note what each one **reads**. If a gate reads only
  the HTML file, every green it prints about a page with linked CSS is a green about markup only;
  gate an inlined copy as well (step 7).
- Give every gate one input that MUST turn it red before its green counts (a raw hex, an undersized
  target, an emoji). A gate that has never gone red has not been shown to work.
- Verify every asset assumption on the machine, not in your head: is the font installed
  (`fc-list`)? If not, bundle it with its licence — an unbundled font renders as a silent fallback
  and every type measurement below is then a measurement of the wrong face.
- Launch the headless browser once. If it cannot launch, STOP and report BLOCKED-visual. NOT
  ALLOWED: building "blind" and describing what the page should look like — the one render built
  that way shipped a repeated delta on five cards and an empty half-row that any screenshot would have
  caught in one round.

### 3. One data model, one generator, reconciled by script

Sample data lives in one file. A generator turns it into the markup. A check script proves the
numbers reconcile — bars sum to the headline card, table totals equal the cards, shares sum to
100 — and runs BEFORE the first screenshot. NOT ALLOWED: numbers typed into the HTML by hand,
because the second edit silently breaks the first reconciliation and the page now lies with
confidence.

### 4. Screenshot and probe together, every round, at every width

Pair the screenshot script with a probe script from the first round. Per width (375 / 768 / 1440
plus every width the brief names, plus ±1 px around every media query you wrote), record:
`scrollWidth` vs `innerWidth`; x / width / height of the elements the direction sized (header row,
cards, controls); the smallest interactive target; the font the browser actually resolved
(`document.fonts.check`); console errors; the emoji probe; the reconciliation totals. Save the JSON
next to the PNG. NOT ALLOWED: a screenshot without its probe — the eye misses a 22 px overflow and
a fallback font every time; the probe never does.

### 5. Look at the picture, then zoom

Open the PNG. Then crop the details the eye skims at full size — the date controls, a share bar, the
375 header — and open the crops. Compute contrast with code, not by judgement. Read the render as
the approver will: element by element.

### 6. Fix from the number; keep the structure; log the deviation with the number

When a measurement says a row overflows, the first move is the one that keeps the direction's
structure: shorter copy, tighter spacing on the scale, a control that folds — measured again.
Changing structure (a second row, a hidden column) is the last move and is written up as a deviation.
Every deviation carries the number that forced it (the 1,251 px header against 1,136 available; the
2.34:1 edge against the 3:1 floor). NOT ALLOWED: a deviation justified by taste alone, because the
approver cannot tell it from a mistake, and neither can the next builder who inherits the file.

### 7. Gate what the browser sees

Run every gate on the file as linked AND on a copy with all linked CSS inlined; the inlined result is
the one that counts. Run the anti-pattern scanner and the emoji probe. Re-run everything after the
last edit; a gate run before the final edit is a gate run on a different page.

### 8. Ship the states and the affordances that make a static page honest

Real, keyboard-operable controls with their disabled logic (a clear-filters button is disabled when
nothing is filtered); a visually hidden data table under every chart; focus-visible and hover
captured once; the empty and loading states built to the final sizes, or reported as out of scope by
contract — never implied.

### 9. Report so the next reader can re-run you

Not-verified first. Commands with exit codes. Screenshots and probes by path. Deviations with
numbers. The commit hash. Claims labelled FACT / INFERENCE / ASSUMPTION. NOT ALLOWED: "should work",
"looks right", or a pass claimed for a check whose output is not in the report.

## Who runs which part

The loop is model-agnostic. What changes with the model is the **input**, never the loop: a
frontier tier writes the direction and the first reference render; a fast tier reproduces states and
viewports from that reference with the same probe script. A fast model that skips step 2 or step 4
has not run the loop, whatever its report says — the controller re-runs the gates and opens the
screenshots itself.

## Failure Modes

- **Structure changed on taste.** A second header row appears with no measurement behind it. Visible
  in `deviations.md` as an entry without a number.
- **Blind build.** A report with gate exits and no PNG paths, or PNGs the builder never opened
  (no crop, no probe JSON beside them).
- **Instrument trusted unproven.** Six green gates and no red probe in the log; later found to have
  read markup only.
- **Fallback face measured.** `document.fonts.check` false in the probe while type sizes are reported
  as verified.
- **Gate run before the last edit.** Exit codes in the report older than the final commit.
- **Open QA spiral.** More than two fix rounds after the first full inspection, each finding one more
  thing; the bounded-pass rule was dropped.
