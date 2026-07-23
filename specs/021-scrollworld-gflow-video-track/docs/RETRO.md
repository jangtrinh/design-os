# RETRO — pilot 021 (SoDeal fly-through)

**Verdict:** pipeline works end-to-end; NOT ready for design:os integration yet. Fix below, run 2-3 more, then integrate.

## What went well
- i2v + ffmpeg-seed manual chain = reliable (4/4, zero download fail after switching off `gflow chain`).
- scroll-world scrub-engine drops in clean; `connectors:[null]` fine because i2v seeding already continuous.
- `--dry-run` credit preview before spend = good guardrail.

## What to improve (ranked)

### P0 — quality
1. **Softness.** veo-fast is low-detail. → default **veo-quality** for the render (fast = previz only). Root fix > upscale.
2. **Re-encode may add blur.** build-assets uses crf20. → try **crf16-18, keep native res**; A/B against the raw clip before blaming Veo.
3. **Upscale is polish, not fix.** If still soft after veo-quality: `higgsfield upscale_video` (2K/4K, already wired) — NOT a new repo. Algorithmic upscale can't invent detail.

### P1 — cost & robustness
4. **gflow wasted ~2 credits** on link0 (Pillow crash + chain download race before switching approach). → hand adapter MUST: preflight deps (pillow/ffmpeg/cwebp), skip `chain`, verify each download.
5. **Auth friction** — 3 tries (600s timeout, profile-lock collision). → doc: timeout 1200s, single attempt, never relaunch while one holds the lock.
6. **Credit accounting** — bug-retries were hidden cost. → hand should log credits/run + reconcile with catalog.

### P2 — craft & coverage
7. **Art-direction variance** — prompts generic, no brand hex, Veo interprets loosely. → lock style with a reference still / `gflow character`; feed real SoDeal palette.
8. **Seam QA** — assumed continuous, not verified frame-identical. → extract adjacent boundary frames, diff.
9. **No mobile (9:16)** variant. scroll-world supports `clipMobile`/`connectorsMobile`. → deferred, add before ship.
10. **Headline/CTA** are placeholder copy + `href:'#'`. → real copy + links per brand.

## Before integrating into design:os (plan)
1. Run **A: veo-quality** same manifest → compare nét. (credit spend, needs OK)
2. Run **B: 1 other brand/art-direction** (e.g. EaseUI, non-VN, different persona) → test generality.
3. Run **C: crf16 re-encode** of best run → confirm encode isn't the blur.
4. Re-retro → then build gflow "hand" + scroll-world track.

## Unresolved questions
- Approve credits for run A (veo-quality, ~4 credit)?
- Long-term home for heavy rendered assets (export/CDN vs keep local)?
- Which 2nd brand for generality test (run B)?

---

# Full-session retro (260722, after actually running it)

**Honest verdict:** pipeline works, but this session had MANY problems and the result is INCONSISTENT — no clean 4-scene deliverable at target quality. Final page mixes veo-fast + veo-quality scenes (veo-quality link3 @8s never downloaded). Quality: veo-fast judged "quá kém", veo-quality only 3/4, omni-flash unusable via CLI (but looked best in the Flow UI). We burned time + credits on trial-and-error.

## Problems (what actually went wrong)
1. **Auth friction** — 3 attempts (600s timeout too short, profile-lock collision on relaunch). ~15 min lost.
2. **gflow missing deps** — Pillow, PyAV crashes mid-run.
3. **Download flakiness = THE core blocker** — render succeeds server-side, the local download throws `UnexpectedError`, clip stranded (credit spent, no download-by-id to recover) → forced regen. Intermittent; worse on t2v / 8s / omni / veo-quality. veo-fast i2v most reliable.
4. **Model↔quality tradeoff unresolved** — veo-fast = reliable but soft/low-res; veo-quality = sharp but flaky download; omni-flash = looks best in UI but CLI can't download it AND Flow blocks it for i2v (drops seed).
5. **Art-direction drift + inconsistency** across scenes (last-frame seeding + generic prompts, no style anchor).
6. **Process: too many gens = slow + spammy** (Jang flagged). Each Playwright render ~1 min, serial; retries multiplied it.

## Root causes
- gflow is Playwright automation of a web app not built for headless batch → download races, missing deps, fragility. Unofficial.
- We optimized per-link reliability but never locked ONE consistent art-direction + ONE reliable model/duration recipe before scaling.
- Chased quality by trial-gen (slow, expensive) instead of finding the right knobs first → hence the best-practices research now running.

## What went well
- `es-gflow` skill captured hard-won operational knowledge (install/auth/gen/build + gotchas + troubleshooting).
- gflow "hand" adapter + `doctor` built and passing (envelope contract).
- Driver-level retry recovers TRANSIENT download fails (link1 recovered on attempt 2).
- Ledger gap filed (governed); spec 021 persisted.

## What to change (next session, informed by research)
1. **Stop trial-and-error gen.** Use the best-practices research → pick the RIGHT model + resolution + duration + prompt-anchoring recipe, then gen ONCE cleanly.
2. **Reliability defaults:** cap duration ≤6s, retry ≤3, never hammer.
3. **The omni signal:** if omni looks best in the UI, find a reliable way to PULL omni output (alt download route / Flow UI export) — need a real omni clip to judge, not an impression.
4. **Consistency:** anchor art-direction with a reference still / Flow "ingredients" / character, not just last-frame seeding.
5. **Resolution:** veo-fast is low-res — investigate Flow's own 1080p/2K/upscale options (research).

## Open (research + Jang)
- Is omni-flash actually higher quality, and can its output be pulled reliably (bypass the failing CLI download)?
- Does Flow expose higher-res output or in-app upscale?
- Best method for a consistent seamless multi-scene camera flight (Frames-to-Video / scene "extend")?
- Report pending: `plans/reports/researcher-260722-2010-google-flow-best-practices.md`
