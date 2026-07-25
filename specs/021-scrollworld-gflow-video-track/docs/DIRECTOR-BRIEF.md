# DIRECTOR BRIEF — SoDeal fly-through, take 2

**From:** Fable 5 (director) · **Date:** 260722 · **Supersedes nothing — AMENDS `SPEC.md → LOCKED DIRECTION`**
**Hand to:** Codex (stills, §3) → video stage (§4). Opus specs the run, Sonnet executes, Fable audits before credits burn at veo-quality.

---

## 1 — ARCHITECTURE RULING: keyframe-anchored RE-RATIFIED, with two binding amendments

**Ruling: keep frames-to-video with BOTH endpoints locked. The pilot did not falsify the architecture — it falsified the keyframes.** Frames-to-video is a camera interpolator: hand it two views of the SAME space along a plausible forward camera move and it renders camera motion; hand it two *different* spaces and it has no choice but to morph. We handed it four different dioramas. The morphing was obedience, not failure.

**Why not architecture A (last-frame seed-chain):** my LOCKED objection stands untouched — A integrates error in the *video* tier, ungated, where every hop costs credits and drift compounds invisibly (the pilot's own RETRO logged "art-direction drift + inconsistency" from exactly this). A also forfeits the storyboard GATE: you can't approve a film whose frames don't exist until render time.

**Why not architecture B (dive + aerial connector):** B is for *archipelago* worlds — separate diorama islands that need aerial hops to feel connected. Our world is ONE connected town; island-hopping it would fracture the very continuity we're building, costs 2N−1 clips instead of N−1, and B's camera reversal at every seam scrubs backward as a stutter (scroll is a scrubber — every seam plays both ways).

**The reconciliation (skill vs LOCKED — both are right):** the scroll-world skill's rule "a fixed end-image forces the camera to pull back → #1 cause of stutter" is true **when the end-image is a wider or unrelated establishing shot**. It is inverted when the end-image is a strictly *forward-advanced* view of the same world: then the end-frame doesn't drag the camera backward, it *pulls it forward*. So:

> **AMENDMENT 1 — One-world clause.** Every pair of consecutive stills must be two camera positions in ONE persistent world: same buildings in the same places, ≥60% visible-content overlap between neighbours. Stills are generated as a *camera path* (each still references its neighbour's actual pixels for geometry), never as style-referenced independents.
>
> **AMENDMENT 2 — Monotonic-forward clause.** Station k+1 must be strictly further along the flight than station k (closer / lower / deeper — never wider, never a re-establish). This is what makes an end-image legal: it can only ever pull the camera forward.

**Does the still-chain reintroduce my drift objection?** No. LOCKED killed *ungated* error integration in the *expensive video* tier. The still chain is gated (human approves each still before the next is generated — the GATE now checks geography, not just style), zero-credit (Codex image_gen), re-rollable, and 4 hops deep. Iteration belongs exactly there. Video segments remain endpoint-bounded; drift still cannot accumulate across segments. LOCKED's STOP list, model recipe (veo-fast draft → veo-quality final, omni OUT), submit/collect hand contract: **all hold unchanged.**

---

## 2 — THE ONE WORLD: "Phố SoDeal" and the camera path

**World bible = `stills/s0-master.jpg`.** That image IS the town — its geography is now law:
a Hội An-style miniature old quarter at golden hour; a main market street running lower-left → upper-right; a **turquoise canal with wooden boats on the RIGHT** of the street; a **hexagonal-roofed corner shophouse at the central intersection**; the **SoDeal-red storefront sign on the LEFT block**; red/gold lantern strings crossing overhead; awnings in terracotta / saffron / cream / sky-blue; bonsai in terracotta pots; tiny figures in nón lá. Every still must contain these landmarks in these relative positions, camera-transformed.

(Evidence this is achievable: existing `s2-station.jpg` already holds the master's exact layout — canal, intersection, awnings all in place — because it was generated as an *edit* of the master. s1/s3 broke because they were generated as *style references*. The method in §3 forces the edit behaviour.)

**One continuous shot, 5 stations, 4 segments — the camera only ever flies forward and down:**

| # | Station | Camera | Story beat (copy anchor) |
|---|---|---|---|
| ST1 | **The World** | Highest & furthest: whole town below, canal winding through, warm sky band at top. (Derived FROM the master by a pull-back delta — see §3 order.) | Hero: "Chợ ưu đãi của người Việt" |
| ST2 | **The Market** | = `s0-master.jpg`, verbatim (already approved). Mid-aerial over the intersection. | Life of the market |
| ST3 | **Deals Alive** | Pushed forward along the main street + slightly lower; red/gold **% deal tags** now hang on stalls & awnings, shoppers carry bags. (Geography of s2, camera advanced.) | "Săn deal mỗi ngày" |
| ST4 | **The SoDeal Shop** | Continues forward and low; the SoDeal-red storefront is now the centred focal point, interior glowing, lantern strings framing the top. | "Thương hiệu bạn yêu, giá bạn thích" |
| ST5 | **Hero / CTA** | Final slow push: shopfront fills the frame, clean **SoDeal** wordmark on the red sign, one oversized red deal-tag hanging by the door. Camera settled. | CTA: "Tải SoDeal" (HTML overlay) |

Scrub pacing (engine): ST1 `scroll:1.2`; ST2–ST3 brisk (`1.0`); ST4 `scroll:1.4, linger:0.4`; ST5 `scroll:1.6, linger:0.5` + CTA.

**Signage rule:** the master's sign reads "SoDea1—" (garbled). At ST2 distance that passes; at ST4/ST5 it would be a brand fail. Prompt the exact wordmark `SoDeal` at ST4/ST5 (Codex renders short text cleanly — proven on this machine) and re-roll until clean; fallback = blank red sign + HTML logo overlay. Never ship garbled brand text in the close stations.

---

## 3 — STILL GENERATION (Codex image_gen, zero-credit)

### Method: neighbour-referenced camera deltas
Generation order ≠ film order. Walk OUT and IN from the approved master so every generated still references its **film-neighbour's actual pixels**:

```
ST2 = s0-master.jpg            (exists, approved — the bible)
ST3 = gen, ref ST2             (camera delta: forward + down)
ST4 = gen, ref ST3             (forward + down)
ST5 = gen, ref ST4             (final push-in)
ST1 = gen, ref ST2             (pull UP and BACK — legal here: this is generation, not a film segment)
```

**Gate per hop (before generating the next):** landmark checklist — canal RIGHT of street · hexagonal-roof corner building · SoDeal-red sign · lantern lines · same awning colours in same slots — plus eyeball ≥60% content overlap with the reference. A still that drifted is re-rolled NOW; a bad still poisons every still after it (same poison-frame rule as the skill's leg check). Full 5-still storyboard gets human approval BEFORE any video credit (LOCKED GATE, unchanged — it now approves *geography + style*, not style alone).

### Frozen blocks (byte-identical in every prompt)

**STYLE BLOCK:**
```
Soft matte clay-render isometric miniature diorama town, Hội An old-quarter style: saffron-yellow plaster shophouses with terracotta tile roofs, strings of glowing red and gold silk lanterns, market awnings in terracotta, saffron, cream and sky-blue, potted bonsai trees, a turquoise canal with tiny wooden boats, tiny figures wearing nón lá conical hats. Warm golden-hour light, soft long shadows, tilt-shift miniature depth of field. Palette: SoDeal red #E0282E accents, saffron #E8A33D, terracotta #B4552D, cream #F2E3C9, canal turquoise #7EC8D8. High detail, high resolution.
```

**ONE-WORLD BLOCK (the load-bearing text — this is what turns "style reference" into "same place"):**
```
This is THE EXACT SAME miniature town as the attached reference image — the same buildings in the same positions, the same street layout, the same canal on the right, the same lantern lines and awnings. Do not redesign it, do not invent new geography, do not restyle it, do not recolor it. Copy the reference's world faithfully. The ONLY change is the camera position, as described.
```

### Copy-paste commands (run from `$WORK` = this spec dir; ~1–3 min each; sequential — each needs the previous)

Codex mechanics: hooks parked via env; **prompt argument BEFORE the `-i` flag** (variadic); single-quote so `$imagegen` never expands. Output 1536×1024 (3:2).

**ST3 (ref = master):**
```bash
CMUX_CODEX_HOOKS_DISABLED=1 codex exec -C "$WORK" -s workspace-write --skip-git-repo-check \
'Use the image generation tool ($imagegen) with the attached image as the reference. This is THE EXACT SAME miniature town as the attached reference image — the same buildings in the same positions, the same street layout, the same canal on the right, the same lantern lines and awnings. Do not redesign it, do not invent new geography, do not restyle it, do not recolor it. Copy the reference world faithfully. The ONLY change is the camera position: the camera has moved FORWARD along the main market street toward the hexagonal-roofed corner building and slightly LOWER, so the market stalls are larger in frame and the far edge of town from the reference is now off-frame behind the camera. New in this frame only: small red-and-gold percent-sign deal tags hanging from the stall awnings and lantern strings, and a few shopper figures carrying tiny red shopping bags. Soft matte clay-render isometric miniature diorama town, Hội An old-quarter style: saffron-yellow plaster shophouses with terracotta tile roofs, strings of glowing red and gold silk lanterns, market awnings in terracotta, saffron, cream and sky-blue, potted bonsai trees, a turquoise canal with tiny wooden boats, tiny figures wearing nón lá conical hats. Warm golden-hour light, soft long shadows, tilt-shift miniature depth of field. Palette: SoDeal red #E0282E accents, saffron #E8A33D, terracotta #B4552D, cream #F2E3C9, canal turquoise #7EC8D8. High detail, high resolution. Wide 3:2 landscape. Save it as ./stills-v2/st3.png. Do not do anything else.' \
-i "$WORK/stills/s0-master.jpg"
```

**ST4 (ref = st3):**
```bash
CMUX_CODEX_HOOKS_DISABLED=1 codex exec -C "$WORK" -s workspace-write --skip-git-repo-check \
'Use the image generation tool ($imagegen) with the attached image as the reference. [ONE-WORLD BLOCK verbatim] The ONLY change is the camera position: the camera has continued FORWARD and descended LOWER, now approaching the shophouse with the red storefront sign on the left block of the street; that red-signed SoDeal shop is now the centred focal point of the frame, its warm interior glowing with shelves of goods, lantern strings crossing the top of the frame, the canal still visible at the right edge. The sign is a clean rectangular red sign — if any text appears on it, it reads exactly "SoDeal" in white capital letters, nothing else. [STYLE BLOCK verbatim] Wide 3:2 landscape. Save it as ./stills-v2/st4.png. Do not do anything else.' \
-i "$WORK/stills-v2/st3.png"
```

**ST5 (ref = st4):**
```bash
CMUX_CODEX_HOOKS_DISABLED=1 codex exec -C "$WORK" -s workspace-write --skip-git-repo-check \
'Use the image generation tool ($imagegen) with the attached image as the reference. [ONE-WORLD BLOCK verbatim] The ONLY change is the camera position: the camera has made one final slow push forward and down, settling close in front of the SAME red-signed shopfront from the reference — the shopfront now fills most of the frame, warmly lit interior visible through the open front, red and gold lanterns framing the top corners, and one oversized red gift-tag-shaped deal tag with a white percent symbol hanging beside the door. The shop sign reads exactly "SoDeal" in clean white capital letters on the red sign, and no other readable text exists anywhere in the image. [STYLE BLOCK verbatim] Wide 3:2 landscape. Save it as ./stills-v2/st5.png. Do not do anything else.' \
-i "$WORK/stills-v2/st4.png"
```

**ST1 (ref = master; pull-back — generation only, film plays it first):**
```bash
CMUX_CODEX_HOOKS_DISABLED=1 codex exec -C "$WORK" -s workspace-write --skip-git-repo-check \
'Use the image generation tool ($imagegen) with the attached image as the reference. [ONE-WORLD BLOCK verbatim] The ONLY change is the camera position: the camera has pulled UP and BACK, much higher and further away, so the ENTIRE miniature town is visible below as one connected diorama — the market intersection and canal from the reference now sit in the middle distance at the centre of the frame, the turquoise canal winds through the whole town from foreground to background with tiny boats, terracotta rooftops spread to the edges, and a warm hazy golden-hour sky band occupies the top fifth of the frame. Every landmark from the reference is still present, just smaller and seen from above. [STYLE BLOCK verbatim] Wide 3:2 landscape. Save it as ./stills-v2/st1.png. Do not do anything else.' \
-i "$WORK/stills/s0-master.jpg"
```

`ST2` = copy `stills/s0-master.jpg` → `stills-v2/st2.png`.

### Aspect fix (mandatory, deterministic)
Codex outputs 3:2; Veo endpoints are 16:9. Centre-crop every station before the video stage; 3:2 originals stay as page posters:
```bash
for f in stills-v2/st*.png; do
  ffmpeg -y -i "$f" -vf "crop=iw:iw*9/16" "${f%.png}-169.png"
done
```
(Compose accordingly: nothing story-critical in the top/bottom ~8% of any still.)

---

## 4 — MOTION: 4 segments, frames-to-video, both endpoints locked

Per LOCKED: `gflow video i2v --initial-frame stK-169.png --end-frame stK+1-169.png`, **veo-fast for the full draft chain → human review of scrub feel → veo-quality re-render of approved segments (same keyframes, same prompts)**. Duration **6s** per segment (RETRO reliability cap). Submit-all-then-collect via the Python hand (`generate_video(download=False)` → `download_video(media_id)`); no inline downloads.

Seams are frame-exact **by construction** (segment k ends ON st(k+1); segment k+1 starts ON st(k+1)) — the shared still IS the seam. Motion-handoff contract: every prompt both *begins* and *ends* in the same slow steady forward drift, so velocity is continuous across seams in both scrub directions. `connectors: [null × 4]`, crossfade ≈ 0.06.

**Frozen motion preamble (every segment, verbatim):**
```
Single continuous cinematic camera move, no cuts, no scene change. The first frame and the last frame are two views of the SAME miniature clay town; the camera travels smoothly between them. The buildings, streets, canal and lanterns are rigid and fixed — nothing morphs, nothing is redesigned, only the camera moves, gliding at a slow constant forward speed from the first framing to the second. Begins already drifting slowly forward; ends settled in the same slow steady forward drift. Soft matte clay miniature diorama, tilt-shift, warm golden-hour light. Smooth, graceful, slow. No text, no captions.
```

**Per-segment middle clause** (insert after "only the camera moves,"):

| Seg | Endpoints | Middle clause |
|---|---|---|
| 1 | st1 → st2 | "descending from a high aerial view of the whole town, gliding forward and down toward the market intersection by the canal, rooftops rising past the frame edges as the camera sinks into the town" |
| 2 | st2 → st3 | "pushing forward along the main market street toward the hexagonal-roofed corner building, sinking slightly lower, stalls and lantern strings drawing closer as red and gold deal tags come into view" |
| 3 | st3 → st4 | "continuing forward and descending gently toward the red-signed SoDeal shopfront on the left block, the storefront growing to become the centre of the frame" |
| 4 | st4 → st5 | "one final slow push toward the glowing SoDeal shopfront until it fills the frame, easing to a near-stop, the giant red deal tag drifting slightly beside the door" |

**Failure fallback (per segment, in order):** (1) re-roll ≤3; (2) if it still morphs, the delta was too big — generate ONE intermediate still (ref the earlier endpoint, prompt "camera halfway between…"), split into two 4s segments; (3) only then LOCKED's Ken-Burns degrade. Never widen a delta to "save a segment".

**QA before veo-quality spend (skill Step 8, now non-negotiable):** extract & diff boundary frames at every seam (must be near-identical by construction — a mismatch means a wrong file was wired, not a render issue); scrub the draft page both directions; check no segment contains a frame where the camera visibly reverses.

---

## 5 — STOP LIST (delta to LOCKED's)

Everything in LOCKED's STOP list, plus:
- **STOP style-reference stills** — a reference image without the ONE-WORLD BLOCK produces a new diorama, proven twice (s1, s3).
- **STOP wider-than-previous end-frames** — the only end-image that stutters is one behind the camera (Amendment 2).
- **STOP generating still k+2 before still k+1 passes the landmark gate.**
- **STOP garbled brand text in ST4/ST5** — clean "SoDeal" or blank-sign + HTML overlay.

*Optional (not blocking): file a librarian gap noting scroll-world's "no end-image" rule needs the one-world/forward-advanced qualifier — the skill and this ruling are consistent once that sentence exists.*
