# 021 — Scroll-world × gflow video track (DESIGN:OS)

**Status:** pilot proven, pre-integration · **Date:** 260722 · **Owner:** Jang

## What
A new DESIGN:OS **deliverable track**: immersive scroll-scrubbed "fly-through" landing pages (Apple-style), where scroll drives a continuous camera flight through generated scenes. Assets come from **gflow** (Google Flow Veo/Imagen, Ultra sub) instead of Higgsfield.

Two upstream repos:
- `oso95/scroll-world` (MIT) — the scrub-engine + page skeleton (installed skill `~/.claude/skills/scroll-world/`).
- `ffroliva/gflow-cli` (MIT) — Veo/Imagen asset engine (installed `~/.local/bin/gflow`, profile `ultra`).

## Pipeline (proven end-to-end this pilot)
1. `manifest.jsonl` — N beats (link 0 = t2v hero, links 1..N-1 = i2v seeded by prev last-frame).
2. **Gen** — NOT `gflow video chain` (2 dep bugs + download race). Use `manual-chain.sh`: drive `gflow video i2v --initial-frame seed.png --out-dir clips --json` per link, extract seed frames with **ffmpeg** (`-sseof -0.1 -frames:v 1`), verify each download before spending next credit.
3. **Build** — `build-assets.sh`: per clip → poster webp (ffmpeg→PNG→cwebp; ffmpeg's webp encoder is disabled here) + scrub-optimized mp4 (`-an -crf 20 -g 8 +faststart`).
4. **Page** — `web/index.html` wires `scrub-engine.js` via `mountScrollWorld({sections, connectors})`. Chain clips already seamless → `connectors: [null,...]`.
5. **Serve** — `python3 -m http.server` local preview.

## Pilot result
SoDeal 4-beat fly-through (chợ VN → shop SoDeal-red → plaza deal → hero). 4/4 clips, seams continuous, page serves 200. See `web/`, `clips/` (gitignored, regenerable).

## Integration into design:os (deferred — after retro + more runs)
- **gflow = new "hand"**: envelope adapter wrapping `gflow … --json` → `{ok,command,data}` + exit codes; register in `doctor.sh`. **MUST use the i2v+ffmpeg path, not `chain`.** Preflight deps (pillow, ffmpeg, cwebp).
- **scroll-world = new track** under the conductor: brief → manifest → gen (gflow hand) → build → serve/export.

## LOCKED DIRECTION (Fable 5, 260722) — supersedes the pilot pipeline above

**Stills are the backbone. Imagen owns art direction; Veo is only a camera interpolating between approved stills.** Kill the last-frame seed-chain — it's an error integrator (drift compounds with scene count, structural not fixable by prompting).

**Architecture — keyframe-anchored (Frames-to-Video):** every segment fixes BOTH endpoints (still k → still k+1) via `gflow video i2v --initial-frame stillK --end-frame stillK+1` (CONFIRMED available in gflow 0.42). Error bounded per segment, never accumulates; seams pixel-exact by construction. Stills = scroll "stations". Failed segment degrades to still + Ken-Burns (page still ships).

**Model recipe:** Imagen (+ master reference still) = all stills/art direction · veo-fast frames-to-video = motion drafts · veo-quality frames-to-video = final hero segments only (download decoupling removed its only objection; 1080p matters because scrubbed frames show as stills) · **omni-flash OUT** (can't i2v #125; "looked best" only on unconstrained t2v, doesn't transfer).

**Consistency = 3 locked layers + 1 gate:** (1) one approved master style still → reference image for every subsequent Imagen gen; (2) frozen prompt scaffold `[Cinematography]+[Subject]+[Action]+[Context]+[Style/Ambiance]` — Cinematography+Style blocks verbatim as SoDeal brand style-block; (3) frames-to-video bounds residual drift. **GATE: human approves the full still storyboard BEFORE any video credit is spent** (kills trial-and-error burn).

**Standard pipeline:**
```
scene list + camera path → master style still (approve)
→ N storyboard stills (reference + scaffold) → APPROVE = GATE
→ SUBMIT all veo-fast segments (no inline download)
→ COLLECT settled clips by media_id from catalog (client.download_video)
→ review scrub feel → re-render approved segments at veo-quality (same keyframes/prompts) → collect
→ extract frames at scrub density → IMAGE-SEQUENCE scrub in scroll-world (NOT <video> currentTime seeking — seek latency = jank)
```

**Download fix (core unblock):** decouple download from gen. Generate → ignore flaky inline download → pull every clip by `media_id` via `client.download_video()` after render settles (proven: recovered stranded omni + veo-quality). This is the ONLY sanctioned download path.

**Hand contract (design:os):** split `gen` → **submit** (returns media_id, non-blocking) + **collect** (idempotent batch pull of settled media) + **manifest** (media_id/prompt/model/keyframes per submission — nothing stranded, credit accountable). `doctor` checks auth + credit balance. Submit-all-then-collect amortizes the ~1min serial Playwright cost (renders are server-side concurrent).

**Backend-agnostic:** keep gflow for the pilot, but make submit/collect/manifest work identically for the official Veo 3.1 API (ai-multimodal — supports first+last-frame + reference images). Swapping backends = config, not surgery. SWITCH when: credits exhausted, gflow breakage > ~1 workday/month, or pilot → paid client deliverable. Build no further gflow-specific cleverness above the hand boundary.

**STOP:** last-frame chaining · omni-flash · inline downloads · exploratory gen at video tier · serial one-clip loops.

## VERIFIED + BUILD DECISIONS (Opus, 260722) — grounds the LOCKED DIRECTION in the actual gflow 0.42 surface

Verified every load-bearing API against the installed binary/package before writing a line (count-before-you-target):
- **`--end-frame` real** — `gflow video i2v --initial-frame X --end-frame Y` + `GenerateVideoRequest.{start_image,end_image,start_image_ref_id,end_image_ref_id}` → Flow interpolates start→end. Frames-to-video is buildable exactly as LOCKED describes.
- **Download decoupling real** — `client.generate_video(req, download=False)` renders+polls server-side and skips the flaky inline grab, returning `VideoResult.status.media_id`; `client.download_video(media_id, out_path)` (client.py:1346) pulls it later. This is the sanctioned submit/collect split at the client boundary.
- **omni-flash OUT confirmed at source** — i2v `--help` states it silently drops start/end frames → falls back to t2v (#125). STOP-list item is correct.
- **Session wiring** — `_resolve_profile(None)`→name, `auth.profile_dir(name)`→dir, `FlowApiClient(profile_dir, out_dir)`.

**Architecture decision (load-bearing): the hand is a Python client-driver, NOT a bash CLI-wrapper.** The CLI (`gflow video i2v`) has no no-download flag — it always downloads inline (the credit-stranding path). The submit/collect contract is only reachable via `generate_video(download=False)` + `download_video()` at the client boundary. So `flythrough-hand.sh gen` (bash→CLI) is structurally incompatible with LOCKED and is **superseded** by `flythrough_hand.py` (submit | collect | manifest) + `flythrough_backends.py` (Backend protocol · GflowBackend concrete · VeoApiBackend swap-seam stub). Boilerplate authored + offline-validated (manifest gate rejects count-mismatch + missing-still); live submit/collect + tests pending (Sonnet).

**SKILL.md §5 stale-fact → gap:** es-gflow §5 asserts *"No download-by-media-id command exists in 0.42"* — false at the client layer (`download_video` exists). File via `/es-librarian record` (do not hand-patch the skill mid-task).

**Open questions — resolved / remaining:**
- ~~`collect` = poll or deferred batch pass?~~ **Deferred batch pull, retry-on-fail.** No public status-by-id method exists; `download_video()` IS the settle-probe — a failed pull = not-settled-yet, caller reruns `collect`. `pending>0` is not an error (exit 0).
- **Submit concurrency (new, needs a call):** `generate_video(download=False)` still *polls to terminal* before returning → submit is serial-per-segment (~1min each) but downloads are decoupled+recoverable (delivers LOCKED's core promise). True fire-all-then-collect (LOCKED's "renders are server-side concurrent") needs capturing media_id via `on_started` and *not* awaiting the poll — deeper, likely transport-level. Built level-1 (proven-safe); level-2 flagged, not built speculatively (es-lazy + STOP: no cleverness above the hand boundary).
- **Remaining:** scrub density / frame-extraction rate vs page-weight (prefer 4s segments); long-term home for rendered assets (CDN/export, not git).

## LIVE FLOW RECON (computer-use, 260722) — verified against the actual Flow web app, not gflow's snapshot

Drove the labs.google/fx Flow editor directly (Ultra session) to answer "has Flow updated?". Findings:

1. **Video models UNCHANGED vs gflow 0.42** — live picker offers exactly: Omni Flash · Veo 3.1 Lite · Veo 3.1 Fast · Veo 3.1 Quality · Veo 3.1 Lite [Lower Priority]. No Veo 3.5/newer. gflow's catalog is in sync → **no breaking model-update; gflow 0.42 is not stale on this axis.** All Veo 3.1 = native audio (our scrub encode strips audio anyway).
2. **Omni Flash is now the UI DEFAULT** (Google's headline pick) — but it structurally CANNOT do first+last-frame interpolation (drops frames → t2v fallback; #125 stated in i2v `--help`). The LOCKED keyframe-anchored architecture's omni exclusion is a **permanent structural constraint, not a gflow bug** — omni is t2v/ingredients-only, incompatible with bounded-drift keyframing. Not relitigable.
3. **Frames-to-video is attach-driven, not a separate mode** — pick Video + a Veo 3.1 model, attach 1 image (first frame) or 2 (first+last = interpolation) via the media picker. Maps 1:1 to gflow `--initial-frame`/`--end-frame`. Backbone fully supported live.
4. **Consistency system richer than SKILL.md assumes** — Flow has first-class **Character entities** ("define look/voice once, reference anywhere via @tag") AND image models **NARWHAL/nano2 + GEM_PIX_2/nano-pro with ref_cap 10** (vs IMAGEN_3_5/image4 ref_cap 3). **Tweak within LOCKED (not a direction change):** for the master-style-still lock (consistency layer 1), the nano models' 10-reference capacity likely beats Imagen — pilot both.
5. **New Tools gallery (`gflow tools`) maps onto LOCKED stages** — **Storyboard Studio / Story Sketch** (script→cast→storyboard stills), **Style Writer** (moodboard→style prompt = master-style extraction), **Transition Machine** (seamless transitions), **Stringout Creator** (stitch), **Video Resizer** (any aspect → 9:16 mobile). Optional accelerators for stills/GATE + seams; templated apps, NOT a replacement for the deterministic keyframe backbone.
6. **No breaking Flow UI update** — structure consistent with gflow's automation model; pilot failures were download-race/automation fragility, not a stale UI. gflow remains viable; download-decouple stays the fix; official Veo API stays the robust swap seam.
7. Ultra active; +50 daily bonus credits until Aug 31.

**Net:** LOCKED keyframe-anchored direction HOLDS, fully supported by live Flow. Only refinements: consider nano2/nano-pro (ref_cap 10) for stills; Style/Storyboard tools as optional `--inspire` accelerators — both inside the locked architecture.
