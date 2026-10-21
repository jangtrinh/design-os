# Rules and their homes

Every numbered rule names the place that enforces it. Mechanical rules are enforced by
[validate.mjs](validate.mjs) (`<check>: <what to fix>` lines) or by the machine items of
[look.md](look.md) (`L1`-`L5`, printed by [look.mjs](look.mjs)). Rules that only eyes can judge are
the eye items `L6`-`L10`. Nothing here is a taste score: the validator rejects facts, a person or a
fresh-context critic judges the rest.

## 1. Bind the command contract
Statement: call `ui` only with the commands and flags in [contract.md](contract.md).
Keep it (API): build and validate read the contract header; the copy is generated, never hand-edited.
Rejected when: `contract` finds the file missing, without its sha256 header, or with a body that
does not match the header.

## 2. Check what you built
Statement: every check runs on an evidence folder made by [build.mjs](build.mjs), not on a working copy.
Keep it (API): `node build.mjs --target <page.html|folder>` prints the folder; a new run gets a new folder.
Rejected when: `manifest` finds no manifest, a wrong schema, a missing entry, or a manifest built
against a different contract.

## 3. Check the bytes that ship
Statement: the evidence folder holds exactly the files the manifest lists, unchanged since build.
Keep it (API): edit the source, then rebuild; never edit inside `site/`.
Rejected when: `artifact-hashes` finds a missing, changed or unlisted file.

## 4. Keep the input bounded
Statement: one page per run, at most 200 files and an entry HTML of at most 512 KiB.
Keep it (API): split a large site into pages; each page is its own build. Large inputs hide the
finding the agent should read and slow every later check.
Rejected when: `size` finds more files or a larger entry than the limits.

## 5. Bundle every asset
Statement: stylesheets, scripts, fonts and images are files in the folder, never remote URLs.
Keep it (API): copy the asset next to the page; link it relatively. Plain navigation links may be remote.
Rejected when: `external-request` finds a remote stylesheet, script, font, image or media load in
markup, or a remote `url()` / `@import` in CSS. The look run blocks the network, so such a page would
render differently there than for the reader.

## 6. Pass the composed floor
Statement: layout, accessibility, taste, tell, content and autofix floors all pass; with project
tokens the page also meets the token-coverage floor.
Keep it (API): `ui gate` through validate; pass `--tokens` and `--family` when the project has them.
Rejected when: `gate` reports an error-severity finding in any family, a linked stylesheet it cannot
read, or token coverage below its floor. Warnings and advisories stay visible but do not reject.

## 7. Fit every width
Statement: no sideways page scroll at 375, 768 and 1440 px; wide tables scroll inside their own region.
Keep it (API): [look.mjs](look.mjs) measures `scrollWidth` against `clientWidth` per width.
Rejected when: `L1` finds the page wider than the viewport.

## 8. Make targets reachable
Statement: every visible interactive element is at least 24 px in both directions; aim for 44 px on touch.
Keep it (API): enlarge the padding, not the font; inline text links are exempt.
Rejected when: `L2` finds a target under 24 px.

## 9. Load clean
Statement: the page loads with no console error, script error, blocked request, broken image or blank body.
Keep it (API): fix the cause; never hide an error handler to make the count zero.
Rejected when: `L3`, `L4` or `L5` reports a problem.

## 10. Name the shape before dressing it
Statement: state the macrostructure and the primary action in one sentence before writing markup.
Keep it (API): [concepts.md](concepts.md) holds the one-sentence concept form and the weak-concept list.
Rejected when: `L6` shows the shape or the primary action unreadable at 375 px.

## 11. Keep copy honest
Statement: no invented metrics, testimonials, logo walls or placeholder people; a missing number is
marked as missing or the layout does not lead with it.
Keep it (API): sample data lives in one place and is labelled as sample data.
Rejected when: `L7` finds evidence the brief did not supply, or filler copy.

## 12. Ship the states
Statement: a surface that shows data has designed empty, loading, error and long-content states, or
the hand-over states that it does not.
Keep it (API): build each state to its final size; a disabled control carries its reason.
Rejected when: `L8` finds a state implied but not built or declared out of scope.

## 13. Hold density and rhythm
Statement: spacing comes from one scale; an operations screen is tighter than a marketing page.
Keep it (API): at 25 % zoom the page must still read as deliberate groups, not equal blocks.
Rejected when: `L9` shows loose or monotonous rhythm, or two surfaces that look like one template.

## 14. Let someone else score
Statement: the author never grades its own page; the critic cites an element or a measured value
for every score, and every applicable axis reaches 7 of 10.
Keep it (API): use a fresh context or an explicit attempt to refute each axis; the rubric is
[taste-rubric.md](../../knowledge/taste-rubric.md).
Rejected when: `L10` finds a score without cited evidence or an axis below 7.

When NOT to use these rules: native-platform surfaces, canvas or Figma-first work, and slides have
their own craft skills; pure logic or data changes that alter no rendered output need no look run.
A clean validate and look is never a claim of WCAG conformance or of design quality.
