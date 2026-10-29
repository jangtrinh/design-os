---
id: landing-conversion-craft
description: "The conversion layer of a landing page: intake, the mandatory section skeleton, conversion copy, the tagline section, proof honesty, SEO and the ship list."
when: [landing-page, conversion, cta, intake, objections, faq, risk-reversal, social-proof, seo, aeo, noindex, tagline, ship-checklist]
---

# Landing conversion craft

<!-- ease:source ref="knowledge/sources/elayadesign-skills--202610.md" captured="202610" url="https://github.com/elayadesign/ai-design-skills" -->

## Purpose

A landing page wins one intent: **one offer → one audience → one primary action.** This file is
the layer that decides what such a page says and in what order, before any visual choice.

## Mental model

A landing page is not a homepage. A homepage routes many readers to many places; a landing page
argues one case to one reader and asks for one thing. So the *jobs* of its sections are fixed
here, and the *shape and dress* of those sections still come from `page-structures.md` (the
macrostructure), the persona and the project design system. The skeleton answers "what must this
page do"; the macrostructure answers "what does it look like doing it".

## When to use / when NOT

- **Use** for every page `/ui:generate` builds whose job is to convert one offer: a product
  launch, a trial or demo page, a waitlist, a download, a campaign page. The skeleton below is
  mandatory on all of them (owner ruling, 2026-10-29).
- **Use** in `/ui:refine` when an existing landing page is upgraded: check it against §2–§8.
- **Do NOT** apply the skeleton to a homepage, a docs site, a multi-product marketing site, a
  dashboard or a component. Those keep `page-structures.md` alone, because forcing a single
  offer onto a page that serves many intents removes the routes its readers came for.

## §1 Intake — ask before you draft

Gather these before the brief. Ask **only** for what is missing and changes the design, and ask
all of it in **one** message; a drip of single questions stalls the build.

| Group | What to know | Where it lands in `design-brief.json` |
| --- | --- | --- |
| Purpose | the one primary action; the exact offer; what counts as a conversion | `primaryAction`, `primaryOutcome`, `requiredContent` |
| Audience | who the reader is; the problem they are solving; their top three objections | `audience`, `context` |
| Arrival | traffic source (ads, search, social, email); what the reader already knows | `context` |
| Proof | the logos, quotes, numbers, case studies, guarantees and refund terms that **actually exist** | `requiredContent`, `prohibitedClaims` |
| Constraints | voice; design direction; mobile priority | persona, `constraints`, `--mode` |

When the user cannot answer, assume, record the assumption with provenance and confidence in
`assumptions`, and continue. **NOT ALLOWED:** filling a proof gap with an assumption — a missing
logo wall is recorded as missing, because an assumed customer is an invented customer (§6).

## §2 The skeleton — mandatory on every landing page

Every landing page carries every job below, in this order:

| Zone | Job | Rule |
| --- | --- | --- |
| Above the fold | 1. Headline | outcome plus audience |
| | 2. Subheadline | one or two sentences: what it is, who it is for |
| | 3. Primary CTA | verb plus what they get (§4) |
| | 4. One proof signal | a sourced logo strip, number or short quote beside the CTA |
| | 5. Hero visual | a real product screenshot, video or illustration; never fake chrome (`page-structures.md` §5) |
| The argument | 6. Problem → solution | one section |
| | 7. Benefits | three to five, each an outcome |
| | 8. How it works | three steps |
| | 9. Tagline section | §5; after the hero or after the benefits, never directly under the hero |
| | 10. Social proof | quotes or a case study, placed beside the claims they support |
| Objection handling | 11. FAQ | six to twelve real questions |
| | 12. Risk reversal | the offer's real terms: trial, free plan, no card, cancel anytime, guarantee |
| | 13. Final CTA | the same action and label as the top CTA |

**ALLOWED:** any macrostructure dressing these jobs, two or more layout models across sections
(`generation-craft-defaults.md` § Section architecture), merging two adjacent jobs into one
section when the content is short (a Minimal conversion page). **NOT ALLOWED:** dropping a job, or
re-ordering the zones, because each zone answers the question the reader holds at that scroll
depth — *what is it*, *why believe it*, *what if it goes wrong* — and a skipped answer is where
the reader leaves.

**Diversification still applies.** Two landing pages share section *order* by design, so their
structural distance (`page-structures.md` §2) is measured on the remaining axes: macrostructure,
focal placement, reveal behaviour, nav and footer archetype, and per-section layout models.

### Picking the shape

State the pick as text before code, as `page-structures.md` §1 requires. The landing types map to
the catalog:

| Landing type | Use when | Macrostructures |
| --- | --- | --- |
| Classic hero plus sections | the product reads from one screenshot | Marquee Hero, Feature Stack, Bento Grid |
| Long-form story | the reader must be educated past scepticism | Long Document, Narrative Workflow, Letter |
| Minimal conversion | high-intent traffic or a short offer (download, waitlist) | Marquee Hero, with adjacent jobs merged |
| Comparison | the search intent is "X vs Y" or "best for" | Comparison |

## §3 Conversion rules

- **Match the message to the source.** Traffic from an ad lands on a hero that repeats the ad's
  promise and visual tone; a mismatch reads as a bait-and-switch and the reader bounces.
- **One primary action.** One primary-styled CTA above the fold. **NOT ALLOWED:** a second
  primary-styled action in the first viewport, because two equal buttons make the reader choose
  before they are convinced. Secondary links are text-styled.
- **Benefit first.** A feature says what it does; a benefit says what that means for the reader.
  Lead with the benefit, follow with the feature as its proof.
- **Be specific.** "Cut your weekly reporting from 4 hours to 15 minutes", not "save time" — and
  only with a number the brief supplied (§6). The vague-verb list is machine-checked (§9).
- **Reduce risk.** Show at least one risk reversal the offer really has. When it has none, say
  so in the hand-over; never invent a guarantee.
- **Objections are a section, not a footnote.** For a high-friction offer, move the FAQ up. Put
  each proof element beside the claim it supports, not in a band at the bottom.

## §4 Copy

- **Headline.** Patterns that work as starting points: "{outcome} without {pain}", "the
  {category} for {audience}", "ship {result} in {time}". **NOT ALLOWED:** shipping a pattern
  unfilled or the same pattern on consecutive pages, because a recognisable formula is a template
  tell in copy form.
- **Subheadline.** One or two sentences that say what it is and who it is for.
- **CTA.** A verb plus what they get: "Start free trial", "Book a demo", "Get the checklist".
  **NOT ALLOWED:** "Learn more", "Submit", "Click here" — they name an action, not an outcome.
- **Benefit bullets.** Bold benefit, then the detail: **Faster iteration** — three layout
  variants in one click.
- **Sentence case** for headings and buttons; calm, specific system messages ("Invoice sent to
  Dana"; "Upload failed. The file is over 20 MB."), no exclamation marks
  (`content-design.md`).

## §5 The tagline section — mandatory

Every landing page carries one large-type section that states the core benefit, separate from
the hero, as its own moment further down the page.

- **Copy:** at least two lines; a benefit statement in the page's voice, not a section heading.
- **Type:** `text-4xl` to `text-6xl` on the project's scale, measure capped like the hero, lines
  broken where the thought breaks.
- **Reveal:** words move from a muted colour to the full text colour one at a time, in reading
  order, as they cross a trigger line, on the base easing curve.

The floor-corrected reveal (constitution Article X — accessibility wins over the effect):

| Rule | ALLOWED | NOT ALLOWED, and why |
| --- | --- | --- |
| Muted start colour | a colour that still meets 3:1 against its background (large text) | 25–35 % opacity of the text colour, which fails contrast before the reveal runs |
| Resting state | the full colour in CSS; script adds the muted class only after `IntersectionObserver` exists and motion is allowed | muted text as the CSS default, which leaves the section unreadable when JavaScript fails (`content-hidden-at-rest`) |
| Reduced motion | the whole sentence at full colour, no per-word change | any per-word animation under `prefers-reduced-motion: reduce` |
| Driver | one `IntersectionObserver`, or one scroll listener throttled through `requestAnimationFrame` | an unthrottled `scroll` listener (`scroll-listener-unthrottled`, §9) |

## §6 Proof and sample data — honest by construction

Constitution Article VIII holds: no invented metrics, testimonials or placeholder names in a
shipped claim. Inside that floor:

- **Real proof only on a delivered page.** Logos, quotes and numbers come from the brief; a
  missing one is marked "to confirm" or its job uses a shape that does not lead with it
  (`page-structures.md` §3).
- **Realistic sample data, labelled.** In a prototype, sample content reads like a real product:
  full specific names that fit the audience and region, a different face per person, company
  names that belong to the product's industry, prices that look like real pricing, metrics with
  an odd final digit, dates that vary. It lives in one labelled place
  (`skills/design-os-designer/rules.md` rule 11) and never reaches a qualified delivery unsourced.
- **NOT ALLOWED:** realistic sample data presented as fact, because realism is exactly what makes
  an invented quote believable to the visitor it misleads.
- No placeholder copy: `lorem-ipsum`, `placeholder-copy` and `placeholder-name` stay errors.

## §7 States

Every interactive element ships hover, active (`scale(0.98)` or `translateY(1px)`), visible focus,
skeleton loading shaped like the content, a composed empty state, and an inline, specific error
(`generation-craft-defaults.md`, `content-design.md`). **NOT ALLOWED:** `window.alert()` for
feedback, because it blocks the page and loses the field the error belongs to; a link or button
that points at `#` without being disabled, because it promises an action and does nothing. The
current page is marked in the navigation with `aria-current="page"`.

## §8 SEO, AEO and the ship list

- **Index or not.** Ad-only and time-bound campaign pages carry
  `<meta name="robots" content="noindex">`. Evergreen offers are indexed and carry a real
  `<title>`, a meta description, `og:title` and `og:image`, internal links from the home and
  feature pages, and the FAQ in plain question-and-answer markup (FAQ structured data when it
  fits).
- **Ship list.** A branded favicon; a skip-to-content link before the navigation; privacy and
  terms links in the footer; client-side validation for email format and required fields;
  alt text on every meaningful image; semantic landmarks. Cookie consent where the jurisdiction
  requires it is the host's decision — record it under NOT_VERIFIED when unknown. A custom 404
  and a way back from every page apply to multi-page sites, not to a single landing page.

## §9 Output order and the machine floor

Before markup, write into the generation contract, in order: the page outline (the §2 jobs and
the shape), hero copy (headline, subheadline, CTA, proof line), the benefits, the three steps,
the FAQ, the index decision with title and meta, and the landing type with its reason. Then build
section by section — hero, benefits, how it works, proof, FAQ, final CTA — and repair one section
at a time; never regenerate the whole page to fix one part, because a full rerun re-rolls every
section that was already right.

Machine-checked (advisory warnings in `ui gate`; they never reject a page by themselves):

| Check | Family | What it flags |
| --- | --- | --- |
| `dead-link-href` | `a11y-lint` | a link whose `href` is `#` or `javascript:` on an element that is not disabled |
| `window-alert` | `content-lint` | `alert(` used in a page script |
| `seo-meta-missing` | `content-lint` | a full document, not marked `noindex`, without a meta description, `og:title` or `og:image` |
| `favicon-missing` | `content-lint` | a full document without `<link rel="icon">` |
| `skip-link-missing` | `a11y-lint` | a document with `<nav>` and `<main>` and no in-page link before the navigation |
| `scroll-listener-unthrottled` | `taste-lint` | a `scroll` listener in a script that never calls `requestAnimationFrame` |
| `marketing-buzzword`, `click-here-link` | `content-lint` | the vague-verb list (§3) and "learn more"/"click here" links (§4) — existing |

Everything else in this file is the host's judgment, checked by the look items and the critic.

## Failure modes

- **skeleton-skipped** — a landing page with no FAQ, no risk reversal or no final CTA. Cure: map
  every §2 job to a contract section before markup.
- **two-primary-fold** — two primary-styled buttons in the first viewport. Cure: one primary,
  the rest text links.
- **proof-in-the-basement** — every quote and logo in one band above the footer. Cure: move each
  proof next to its claim.
- **invented-guarantee** — a risk reversal the offer does not have. Cure: cut it and say so.
- **sample-as-fact** — labelled sample people or numbers shipped in a qualified delivery. Cure:
  replace with sourced proof or "to confirm".
- **tagline-dark-at-rest** — the tagline section unreadable with JavaScript off or under reduced
  motion. Cure: full colour in CSS, muted only once the observer runs.
- **formula-headline** — the same headline pattern on consecutive pages. Cure: write the claim,
  then check it against the patterns, not the other way round.
