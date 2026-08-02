# Follow What Disappears — desktop production

Status: production complete; owner-approved storyboard, Codex implementation review passed, Fable final audit passed.

The deliverable is a desktop-only, scroll-scrubbed forest encounter. Eleven local 1920×1080 WebP planes form one continuous camera move. The shrine stays rooted inside the terrain focus group while the spirit crosses behind the roof, disappears, re-emerges in front, and settles beside it.

## Open

Open `site/index.html` directly, or serve `site/` from the repository's registered `127.0.0.1:4312` port when it is available. GSAP and ScrollTrigger are vendored under `site/vendor/`; the runtime has no CDN dependency.

## Rebuild and validate

```sh
node production/build-assets.mjs
node site/validate.mjs
node --check site/hero.js
```

The deterministic browser checkpoints are `?progress=0|0.1|0.23|0.38|0.48|0.58|0.68|0.86|0.94|1`. Add `&debug=1` for labels and ScrollTrigger markers.

Reduced motion renders the settled 1920×1080 composition and creates no ScrollTrigger. Viewports below 1024px receive a desktop-only notice; mobile art direction is intentionally deferred.

## Evidence

- Final seven-beat contact sheet: `qa/final-desktop/contact-sheet.jpg`
- Production direction: `DIRECTOR-BRIEF.md`
- Asset builder: `production/build-assets.mjs`
- Delivery record: `production/reports/final-delivery.md`
