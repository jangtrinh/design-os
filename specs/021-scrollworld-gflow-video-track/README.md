# 021 — scroll-world → scroll-cinema (SoDeal fly-through)

Scroll-scrubbed "fly-through the world" landing page, generated with gflow (Veo) + Codex image_gen,
wired to the scroll-world engine, styled with design:os. The pilot that proved the technique and
seeded the `scroll-cinema` workflow family.

## 👉 The final deliverable
- **Web: [`site/`](site/)** — THE final page. Run: `cd site && python3 -m http.server 8022` → open http://localhost:8022
- **Video: [`renders/SoDeal-scrollworld-FINAL.mp4`](renders/SoDeal-scrollworld-FINAL.mp4)** — 30s screen-record of the full experience (boom pacing + Ignition & Rise ending).

## What's proven (read [`MASTERY.md`](MASTERY.md) first)
Smooth continuous fly-through via **Architecture A** (forward seed-chain, no end-frame) + **DIVE–BREATHE–BUILD–IGNITE**
scroll pacing + an **Ignition & Rise** ending. design:os UI = Haptic Claymorphism persona over the clay diorama.

## Structure
```
README.md · SPEC.md · MASTERY.md · GOALS.md      root: what / method / north-star
site/            THE final web (index.html + scrub-engine.js + assets/)
renders/         final video(s): SoDeal-scrollworld-FINAL.mp4, flythrough.mp4 (raw concat)
source/          regenerable inputs (gitignored heavy):
  stills/          approved one-world stills (s0-master + st1..st5, ·-169 = 16:9 crops)
  legs/            Arch-A leg clips (leg0..leg3 = the flight) + seed frames
  prompts-archA.jsonl
pipeline/        the scripts: gen-stills-a/b.sh · encode-wire-archA.sh · gen-ignite.py · gen-legs-archA.sh
                 (the reusable drivers live in the es-gflow skill: archA_driver.py, flythrough_hand.py)
lint/            scroll-cinema-lint (qa_lint: loop-closure · fps≥24 · weight) + tests + fixtures  [P-1]
docs/            direction + research:
  RETRO.md · DIRECTOR-BRIEF.md · BOOMING-ENDING-DIRECTION.md
  PHASE3-SYNTHESIS.md · PHASE3-DIRECTION.md (Fable: scroll-cinema family) · P-1-SPEC.md
  research/  (product-scroll · character-white-bg · veo-best-practices)
```

## Regenerate
Stills → GATE → legs: `pipeline/gen-stills-*.sh` then the `archA_driver.py` seed-chain (es-gflow skill);
encode + wire: `pipeline/encode-wire-archA.sh`; ending: `pipeline/gen-ignite.py`. Needs gflow auth (profile `ultra`).

## Status
P1 (scroll-world mastery) DONE. P3: Fable ruled the `scroll-cinema` family (world + product; character shelved);
P-1 code-half (renderer interface + image-sequence backend + lint) built + Codex-reviewed in `site/scrub-engine.js` + `lint/`.
Open (owner-gated): the crane artifact re-roll on the ending; the real product-orbit slice (needs a product + GATE).
