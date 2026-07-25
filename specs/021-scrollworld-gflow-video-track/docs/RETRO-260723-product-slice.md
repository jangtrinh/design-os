# RETRO — AURA product-slice (scroll-cinema · product profile) 260723

Second slice of spec 021: the product-orbit → exploded-view film + a Liquid-Glass scrub page.
Honest retro, owner-concision.

## Outcome (shipped)
- **Fixed the broken explode→seal transition**: root cause = **leg7 (reassembly) never rendered** (profile-lock),
  so leg8 seeded from seed6 (EXPLODED) and jumped straight to SEALED. Rendered leg7 + re-chained leg8/leg9 from it. 10/10.
- **2K film**: `renders/AURA-ink-chamber-film.mp4` (2560×1440, Real-ESRGAN local, 0 credits).
- **Scrub page**: design:os persona **Liquid Glass ★** (3 signature moves declared+verified on canvas), animated
  **stars** background (vanilla canvas, screen-blend so stars only surface in the film's dark voids), route-node
  **titles** (Overview/Anatomy/Finish), **Star-this-repo** button, English UI, text-only wordmark.
- **Deployed**: https://jangtrinh.github.io/aura-scrollcinema-demo/
- **Kit**: leg-naming built (`archA_driver_named.py` → Flow projects titled `AURA-legN`, trackable) + gap
  `g-260723-1640-gflow-project-label` recorded to graduate it into the shared driver.

## The big miss — re-architected instead of finding the mechanical failure
The film's explode looked wrong. I concluded the **approach** was fundamentally flawed ("seed-chain drifts on
content-transformation beats") and built an entire **alternative** — a dark stills-morph hybrid (anchored veo orbit +
Codex-stills explode + K065 densifier + a whole new dark page) — before the owner stopped me: *"the softbox version is
the one we want to continue with."* The real defect was **one missing leg** (leg7 failed on a profile-lock race).

**The tell was on screen the whole time: `9/10 legs`.** I read it as "leg9 issue" and never checked WHICH leg was
missing until pushed. Checking the gap (leg7) would have found the true 3-leg fix in minutes — instead I spent a veo
orbit re-render + Codex stills + an upscale + a page rewrite on a direction the owner hadn't chosen.

This is a **repeat** of this spec's own prior lesson ("invented instead of following the documented method"). Same
shape, new costume: a mechanical failure misread as a reason to change the architecture.

## Root causes
- **Fundamental-vs-mechanical not triaged.** "Output looks wrong" has two families of cause — the approach is wrong,
  or a step mechanically failed. I jumped to the expensive one (re-architect) without ruling out the cheap one
  (a missing artifact). Count-before-you-target existed as a rule; I didn't apply it to my own pipeline's outputs.
- **A seed-chain that continues past a failed link fails silently.** leg8 seeding from the pre-failure seed produced a
  content JUMP, not an error — green exit, wrong film. The chain had no "halt on missing seed" guard.

## What went well
- Once redirected, the fix was **measured**: found leg7 missing via `ls`, mapped prompts→legs, verified the
  seed6→seed7→seed8 seam with montages (not eyeballing), re-chained, confirmed 10/10.
- **Liquid Glass applied by the book**: read the persona DNA, declared the 3 signature moves at G1, verified each on
  canvas at G3 (2-tier blur / specular top-edge / ember-glow CTA). No template auto-flags.
- **Stars reproduced from signature, not lib**: animate-ui's React component is CSP-blocked, so hand-built the
  multi-layer parallax starfield in canvas; screen-blend confines it to the dark voids (tasteful, not a space scene).
- **Kit evolution stayed governed**: named-driver as a LOCAL variant + a gap, never a mid-task edit of the shared skill.

## Durable lesson (one)
**When generated output looks wrong, rule out a MECHANICAL failure (a missing/failed artifact) BEFORE concluding the
APPROACH is wrong.** A `9/10` is a missing-part hypothesis, not a mandate to re-architect. Cheapest triage in the
pipeline; it would have saved a whole hybrid. → saved to memory.

## Unresolved / next
- **archA seed-chain has no halt-on-missing-seed guard** — a failed leg silently seeds the next from the stale frame.
  Fold into es-gflow when the project-label gap graduates (same driver).
- **Record a LinkedIn interaction video** of the live Pages (owner did this for SoDeal).
- **Graduate scroll-cinema to an es-* skill** — 2nd profile (product) now proven; recurrence gate likely met.
- Pages served from `master` root; propagation ~1 min after each push.
