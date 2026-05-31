---
name: "PMFlow"
description: "Project management SaaS — pricing surface"
version: "alpha"

colors:
  brand:
    primary:       "#6366F1"
    primaryHover:   "#4946C9"
  neutral:
    surface:       "#F2F5FC"
    surfaceRaised:  "#E4E8F0"
    textBody:      "#0B0D13"
    textMuted:     "#6B7280"
    border:        "#C5CBD6"
  status:
    success:       "#007B54"

typography:
  display:
    lg:
      fontFamily:    "Inter, sans-serif"
      fontSize:      "56px"
      fontWeight:    600
      lineHeight:    "1.1"
      letterSpacing: "-0.01em"
  body:
    md:
      fontFamily:    "Inter, sans-serif"
      fontSize:      "16px"
      fontWeight:    400
      lineHeight:    "1.6"

rounded:
  md:   "8px"
  lg:   "12px"
  full: "9999px"

spacing:
  "2":  "8px"
  "4":  "16px"
  "6":  "24px"
  "8":  "32px"

components:
  button-primary:
    backgroundColor: "{colors.brand.primary}"
    textColor:       "{colors.neutral.surface}"
    typography:      "{typography.body.md}"
    rounded:         "{rounded.lg}"
    padding:         "{spacing.2} {spacing.4}"
  pricing-card:
    backgroundColor: "{colors.neutral.surface}"
    textColor:       "{colors.neutral.textBody}"
    rounded:         "{rounded.lg}"
    padding:         "{spacing.8}"
---

## Overview

PMFlow's pricing surface — a light, airy SaaS aesthetic (saas-aurora-minimal). Extracted
from the generated `source.html`; the front-matter tokens above are the design system and
the prose below documents each axis. Pairs with `tokens.json` (frequency-ranked source
tokens with line provenance) and `DESIGN.preview.html` (self-contained render).

## Colors

Indigo brand primary `{colors.brand.primary}` (#6366F1) with a darker hover
`{colors.brand.primaryHover}`. Neutrals run from a near-white surface
`{colors.neutral.surface}` to near-black body text `{colors.neutral.textBody}`, with a muted
secondary `{colors.neutral.textMuted}` and a 1px border `{colors.neutral.border}`. Success
state uses `{colors.status.success}`. Every UI color resolves to one of these tokens.

## Typography

Inter throughout. Display headings at `{typography.display.lg}` (56px / 600, tight tracking)
for the hero; body copy at `{typography.body.md}` (16px / 400, 1.6 line-height) — never below
the 16px legibility floor. Hierarchy is carried by size and weight, not color.

## Layout

Single-column, centered, max-width container. Hero → monthly/annual toggle → three-column
pricing grid → FAQ → footer. Generous section rhythm; content breathes (airy density).

## Elevation & Depth

Subtle, restrained. Cards sit on a 1px border with a soft, surface-tinted shadow; the
featured (Pro) tier is lifted by a 2px primary border rather than heavier elevation. Ambient
aurora gradient orbs sit behind the content at low opacity — depth without heavy shadow.

## Shapes

Medium-to-large radii: `{rounded.md}` (8px) for inputs, `{rounded.lg}` (12px) for cards and
buttons, `{rounded.full}` for the pill toggle and badges. No sharp corners.

## Components

- **button-primary** — indigo fill, surface-color text, `{rounded.lg}`, `{spacing.2} {spacing.4}`
  padding. The primary call to action on each tier.
- **pricing-card** — surface background, body text, `{rounded.lg}`, generous `{spacing.8}`
  padding. Three instances (Starter / Pro / Enterprise); Pro is visually featured.

## Do's and Don'ts

- **Do** style every element from the tokens above — colors, type, radius, spacing all resolve.
- **Do** keep body text at 16px or larger for legibility.
- **Don't** introduce raw hex or off-scale spacing; add a token instead.
- **Don't** stack heavy shadows — this system uses borders + subtle elevation, not depth noise.
