# Final Desktop Delivery

Status: `PASS`

## Delivered

- Eleven local 1920×1080 production WebP layers, rebuilt deterministically by `production/build-assets.mjs`.
- One locally vendored GSAP + ScrollTrigger master timeline with eight normalized narrative labels.
- Reverse-safe behind-roof to front-of-eave spirit handoff; the shrine remains nested in the terrain focus group.
- Seven deterministic 1920×1080 browser checkpoints plus a static reduced-motion capture.
- Desktop-only presentation for viewports at least 1024px wide; mobile art direction deferred.

## Verification

- `node production/build-assets.mjs` — pass.
- `node site/validate.mjs` — pass: 11 assets, 8 labels, local GSAP.
- Browser — pass: no console/page errors; one ScrollTrigger normally; zero under reduced motion.
- Accessibility — pass: zero axe violations for WCAG 2 A/AA and WCAG 2.1 AA tags.
- Repository typecheck, lint, and build — pass.

## Review Gates

- Owner storyboard gate — approved.
- Codex implementation and visual review — pass after correcting absence ghosting, early shrine exposure, and depth-crossing visibility.
- Fable final audit — pass with no blockers; production faithfully delivers “Follow What Disappears.”

## Unrelated Repository Test State

The full repository test command still has three pre-existing failures outside this spec: one CLI version drift assertion and two built-binary template-discovery assertions. Focused forest validation and all browser checks pass; no production file touches those failing contracts.
