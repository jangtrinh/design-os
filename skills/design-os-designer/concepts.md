# From request to one buildable concept

A brief is not a concept. Before any markup, write the concept as one sentence per line below. If a
line cannot be filled from the brief, the project's design context or a stated assumption, say so
there; do not invent it.

```text
Surface:        <Persuade | Operate | Explain | Reference>  and the one reader it is for
Primary action: <the single verb the reader should reach first>
Shape:          <one macrostructure from page-structures.md, named, with the reason>
Mode:           <variety (no design system yet) | conformance (a design system exists)>
Data:           <where the sample data lives; what it is; labelled as sample>
States:         <empty, loading, error, long content: built, or declared out of scope>
Widths:         375, 768, 1440 unless the brief names others
```

Surface decides density. Persuade pages breathe and lead with one claim. Operate screens are tighter and
lead with the data. Explain pages hold a reading measure. Reference pages are navigable first.

## The six verbs

Pick the verb that matches what the user handed you. Read only its file, end to end.

| Verb | Use when | Read | Done when |
| --- | --- | --- | --- |
| shape | The brief is fuzzy and structure comes first | [page-structures.md](../../knowledge/page-structures.md) | The concept above is complete and the shape is named |
| implement | A design (Figma frame, mock, reference render) is supplied | [build-loop.md](../../knowledge/build-loop.md) | Build, validate and look run on the render, deviations carry numbers |
| critique | A page needs a review or a score | [taste-rubric.md](../../knowledge/taste-rubric.md) | Each axis scored with cited evidence by someone who did not build it |
| polish | The final pass before shipping | [design-tells.md](../../knowledge/design-tells.md) | Gate clean, tells reviewed, look run again after the last edit |
| harden | Empty, error, loading and long data are unbuilt | [content-design.md](../../knowledge/content-design.md) | Every state exists at final size, copy follows the error standard |
| audit | Accessibility, layout or responsive checks are the task | `ui a11y-lint`, `ui validate-layout` | Findings listed with line numbers and the fix, no conformance claim |

[generation-craft-defaults.md](../../knowledge/generation-craft-defaults.md) holds the machine floors to emit
from the first keystroke (hover inside `@media (hover: hover)`, tabular numbers, balanced headings,
real labels, reduced-motion path, typeset copy). Read it before writing markup for shape and
implement work.

## Project context first

When the project already has a design system (`design/ds.manifest.json`), conformance mode applies:
run `ui ds context --strict --with-theme`, read `ui registry list --json`, look up every named
component with `ui registry lookup '<name>' --json`, then pass the token file to validate with
`--tokens`. The project's tokens, brief and soul outrank this skill's defaults. Without one, variety
mode applies: the page earns its own structure, and two different briefs must not share one shape.

## Weak concepts

| Weak | Why it fails | Better |
| --- | --- | --- |
| "A modern, clean landing page" | No reader, no action, no shape | Name the reader, one verb and one macrostructure |
| Centered hero, three cards, four-column footer | The default attractor; any brief gets it | Pick a shape from the catalog that the brief's centre of gravity chooses |
| "Show impressive numbers" | Invented evidence | Lead with the real result or mark the number as to confirm |
| "Make it responsive" | Shrinks instead of transforming | Say how one region changes at each width |
| "Add all the states later" | States decide the layout | List which states are built now and which are out of scope |
| Reskin of the last page | Same fingerprint, new colour | Change the macrostructure and focal placement |

When NOT to use this skill: native macOS, iOS or iPadOS surfaces, Figma canvas work, charts and diagrams
each have their own craft skills; use those, then bring the rendered result back here for the check.
