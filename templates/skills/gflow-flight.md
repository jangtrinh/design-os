---
description: "Generate a multi-leg camera flight or a conditioned still through the gflow hand (Google Flow / Veo / Imagen on a subscription), using the verify-then-spend adapter so a stranded render never costs a second credit. Use when a brief needs authored video legs whose seams must be frame-identical; do not use for one-off text-to-video where the official API path is simpler, and never inside CI or an unattended build."
---

# Skill: gflow Flight

Use this skill when a brief needs **authored video legs** — a scroll-cinema flight, an i2v
sequence, a conditioned hero plate — generated through a Google Flow subscription.

Do NOT use it for a one-off text-to-video clip where the official API path is simpler, and
NEVER run it inside CI or an unattended build: its auth step is interactive by design, and
it drives a real browser session against a personal account.

## Read

1. Read `knowledge/gflow-hand.md` — the tool contract: the golden path, why `chain` is
   excluded, how to recover a stranded render, and the model-choice reasoning.
2. Read `knowledge/scroll-cinema-direction.md` when the legs form a continuous flight. That
   file owns *what makes the flight good* (camera architecture, seams, the scrub-encode
   floor); this one only gets the frames made.

## Do

1. **Preflight before spending.** Confirm `gflow` and `ffmpeg` are on PATH and an auth
   session exists. A missing dependency surfaces as `DEPENDENCY_MISSING` — fix it before
   the first credit, not after.
2. **Generate each leg through the binary**, never the raw chain:
   ```
   ui gflow i2v "<prompt>" --initial-frame <seed> --out-dir <dir> --json
   ```
   The adapter verifies a new MP4 landed and extracts that video's real last frame as the
   next leg's seed. Feed that emitted seed forward — do not substitute a still you assume
   matches the ending.
3. **Read the envelope after every leg.** Continue only on `ok: true`. On
   `DOWNLOAD_MISSING`, STOP: the render probably succeeded upstream and the credit is
   already spent. Recover by media id per the hand file. Re-running the leg buys the same
   clip twice.
4. **Default to the fast model for the flight.** Reach for sharpness in the encode or an
   upscale pass, not by switching to a longer render that strands more often.

## Report

State the legs generated, the model used, and the seed chain — and name any leg that was
recovered rather than generated, so the credit ledger reflects what actually happened.
Never report a flight as complete while a leg is stranded.
