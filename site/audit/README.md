# Deck design audit

The deterministic quality floor for this deck. Every rule the design system
depends on is encoded here as a gate, because a standard without a linter drifts.

```sh
npm run audit          # all 15 gates (launches a headless browser)
npm run audit:static   # source gates only, no browser
```

Exits non-zero on any failure, so it can sit in CI or a pre-commit hook.

## Gates

### Source (`gates-static.mjs`)

| Gate | Rule | The bug it prevents |
|---|---|---|
| `type/tokenised` | every `font-size` resolves through `var(--fs-*)` | 19 unrelated hand-picked sizes with no ratio |
| `type/one-ratio` | the 7 steps hold ratio 1.333 ±3% | a step nudged in isolation, breaking the scale |
| `space/on-scale` | every gap/pad/margin is on the 4px base | 117 off-grid values (`6px`, `13px`, `70px`) |
| `grid/no-percent-columns` | no `N% M%` column pairs | `50% 50%` + a gap always exceeds the track |
| `css/no-orphan-elements` | no element whose every class is unstyled | two slides rendering as raw text dumps |
| `stage/resolution-independent` | no `font-size` inside `@media` | body copy landing at ~7px on phones |
| `content/images-earn-their-place` | plates are allowlisted with a reason; no orphan files | ambient texture on all 28 slides, which reads as decoration |

### Rendered (`gates-rendered.mjs`)

| Gate | Rule | The bug it prevents |
|---|---|---|
| `stage/exact-1920x1080` | every slide is exactly the board size | silent clipping |
| `fit/no-container-spill` | nothing overflows its own padding box | copy running out of its card |
| `chrome/rail-clearance` | content clears the header/footer rails | the page number sitting under the nav pill |
| `rhythm/voids-agree` | large voids in one container must match | `144 / 120 / 152` drift from `space-between` |
| `contrast/wcag-aa` | 4.5:1 body, 3:1 large, against the real surface | near-black headlines on a near-black stage |
| `stage/viewport-parity` | type is identical at 390 / 1024 / 1920 | viewport rules firing inside a scaled board |
| `interactive/hover-contrast` | hover states clear 3:1 in both themes | a white glyph on a near-white hover pill |

`contrast/over-imagery` reports text sitting on an image plate. Those are not
statically resolvable — they are covered by the scrim contract in `deck.css` and
need a visual check.

## On imagery

An image belongs on a slide only when it **is** the evidence for that slide's
claim, or the subject itself — never as atmosphere. Seven plates qualify across
four slides, each with its reason recorded in the gate.

A previous revision put an ambient plate on all 28 slides, reasoning that
imagery on some slides and not others was a consistency failure. That was wrong.
Consistency means one legible system, not one uniform treatment — a magazine
does not put a photo on every page. Applied evenly, texture reads as decoration
rather than design, and on the card-dense slides those plates were barely
visible: 27MB of file weight for nothing. The allowlist exists so that argument
does not have to be re-litigated.

## Notes on the checks

The contrast gate composites semi-transparent backgrounds over what is beneath
them and takes the **worst** stop of a gradient. Treating a 7%-alpha fill as
opaque produced six false failures before that was fixed — a gate that cries
wolf gets ignored, which is worse than no gate.

The rhythm gate compares large voids **against each other**, not against a
threshold. Two equal voids are a deliberate three-zone composition; three
unequal ones are `space-between` left to its own devices.

The interactive gate opens overlays before testing them. Measuring the resting
style of a control inside a closed modal reports a state no user ever sees.

Every gate has been verified to go red when fed a violation and green when it is
removed. A gate that has never failed has not been shown to work.
