# ART DIRECTION — Product Scroll Film
## "INK CHAMBER" — a premium over-ear headphone, shot like a film, scrubbed like a page

Status: DIRECTION LOCKED (Fable 5, art director / DOP) · 2026-07-23
Deliverable consumers: Codex image_gen (keyframe stills), gflow/Veo (inter-keyframe motion), canvas scrub engine (playback).
Reference plates: `refs/ref1-airpods-pro.png`, `refs/ref2-overear.png`, `refs/ref3-akg-dark.png` (primary), `refs/OUR-codex-still-K3.png` (rejected baseline).

---

## 0. Why K3 was rejected (the diagnosis, so we never regress)

| Axis | OUR K3 | The refs | Verdict |
|---|---|---|---|
| Light | One ambient wash; product and background sit at the same value | AKG: ~8:1 ratio, hard rim carves edges out of black, pooled key, crushed shadow | K3's light *describes*; ref light *dramatizes* |
| Camera | Eye-level orthographic side profile | High 3/4 with perspective recession (ref3), arc composition (ref2), diagonal + scale change (ref1) | K3 is a catalog diagram, not a shot |
| Spread | Even row, equal gaps, equal size, one axis | Staggered in Z, unequal gaps, one crowned hero part | Even = assembly manual; unequal = film |
| Revelation | All parts opaque | Transparent shell with copper/PCB burning inside (ref1, ref3) | K3 has no secret, therefore no story |
| Hierarchy | Nothing is the money part | Ref3's transparent cup glows brighter than everything else | No focal point = no reason to look |

Every fix below is one of: **light ratio, camera attitude, Z-depth stagger, transparency reveal, focal crown.**

---

## 1. Aesthetic & world — the decision

**DARK. The AKG direction, fused with the design:os brand: an INK-black chamber, paper-white type, one ember of #ff3e00 living inside the product.**

Justification (each reason is load-bearing):

1. **Product logic.** A black leather + brushed-metal headphone on white (Apple route) reads as silhouette — you lose the materials. On black, rim light *carves* leather grain and metal anisotropy out of the dark. Ref3 proves it: same product class, and it is the closest to premium-cinematic of the three refs.
2. **Brand logic.** design:os is Swiss Monolith: INK foreground, brutal type, #ff3e00 as a scarce signal. A dark chamber IS the ink; the copper voice-coil and PCB glow are pushed warm toward #ff3e00 so the brand accent is *materialized inside the product* — never a decorative graphic. White seamless would be an Apple cosplay with zero brand ownership.
3. **Production logic (the ugly truth that decides it).** Veo output is 720p and soft, and we have no upscaler. Dark frames hide interpolation mush, compression, and softness in crushed shadow; white seamless exposes every artifact at 100% brightness. The art direction must carry the pipeline: **dark is the only background that lets Veo-in-between footage sit next to crisp Codex stills without a visible quality seam.**

**World spec:**
- Background: vertical gradient, `#0a0a0b` at frame edges → `#1c1c1f` in a soft off-center pool (the key light's spill). Never flat. Faint vignette all four edges. No visible floor plane — the product floats; a soft contact-occlusion pool beneath it is the only ground truth.
- Palette: INK blacks, charcoal greys, one cold near-white (rim light + type), brushed-nickel speculars, and ONE warm accent — copper/#ff3e00 glow, appearing **only** in the x-ray and explode beats, only inside the product.
- Materials contract (state in every Codex prompt): matte-grain leather headband and cushions (micro-sheen, no gloss), brushed dark aluminum yokes/sliders (anisotropic streak highlights), smoked-glass transparent earcup shell (beats 3+), copper voice coil, green-black PCB with warm-lit traces.
- Finish: subtle uniform film grain is added at the CANVAS layer (one overlay for the whole scrub) — it unifies crisp stills and soft Veo frames into one photographic texture. Never bake grain into the stills.
- **Type is DOM, never pixels.** All copy renders as HTML over the canvas — Veo would smear baked type at 720p, and Swiss type must be knife-crisp. The frames are shot to leave negative-space voids where copy lands (see §4).

---

## 2. DOP / lighting design — the look, named

**The look: "ONE BLADE, ONE POOL, ONE EMBER."**
A single hard blade of rim light in the dark, a pooled overhead key, and — when the shell goes transparent — a warm ember burning inside. Nothing else. Every keyframe prompt names these three sources and their ratio; if a still could have been lit by a softbox catalog setup, it is rejected.

- **KEY — "the pool":** one large overhead softbox, high and behind-left of product, feathered so its spill forms the off-center background pool. It models the leather's top surfaces and gives the metal its broad, soft gradient. Intensity: reads ~2 stops under the rim on the product's lit side.
- **RIM — "the blade" (the signature):** one hard narrow strip light, back-left, slightly high. It draws a continuous cold-white line along the headband arc, the yoke edges, and the earcup circumference. On brushed aluminum it becomes a single anisotropic streak — that streak is the wordless "premium" claim. The blade NEVER moves between keyframes (light continuity is what makes still-to-still Veo motion read as one scene).
- **FILL:** almost none. Ratio ≈ 8:1. Blacks are allowed to crush to true black; we do not apologize for lost detail — lost detail IS the mood.
- **EMBER — the brand light:** from beat 3 (x-ray) onward, the copper coil + PCB glow warm (#ff3e00-shifted tungsten). It behaves as a practical: it rim-lights the INSIDE of the transparent shell, spills faint warmth onto the nearest exploded parts, and is the brightest element in the frame during the money shots. When the product reassembles, the ember is swallowed — the last frames are cold again except one hairline of orange (§4, beat 5).
- **Reflections & shadow:** transparent shell picks up the blade as a curved white sliver plus a faint interior ember bounce. Leather shows sheen only on key-facing curvature. Below the product: soft elliptical occlusion pool, darker than the background, no hard cast shadow (floating product, not tabletop).

---

## 3. Camera — angle & movement per beat

Grammar constraint (production reality): motion exists only as Veo interpolation between two crafted stills. Therefore **every camera move is a small delta** — ≤ 30° orbit, ≤ 20% push/pull, ≤ 10% lateral drift per clip — and all drama beyond that is carried by LIGHT CHANGE and PART CHOREOGRAPHY, which interpolate more gracefully than big camera flights. Angles change decisively **across** beats, but each beat's internal move is one clean gesture. Lens language: 85mm-equivalent product telephoto throughout (compressed, dignified — never wide-angle distortion), shallow DOF only where a foreground part is deliberately soft.

| Beat | Camera attitude | The move | Why |
|---|---|---|---|
| 1 ORBIT (arrival) | LOW — 10° below earcup axis, near-profile. The product looks down at us. | Slow 25° orbit toward 3/4-front + gentle push-in | Low angle = reverence. The product is introduced as a monument, not an item. |
| 2 APPROACH | Rising to cup-level, 3/4 front, medium-close on right earcup | Continue orbit ~15°, push to the cup | The film narrows its attention; the audience is told *this cup* is where the story lives. |
| 3 X-RAY | Slightly HIGH, tight 3/4 on the earcup (cup ≈ 60% of frame height), looking a few degrees down into it | Camera nearly static — a breath of push. THE LIGHT does the beat: shell goes glass, ember ignites | A held camera during a revelation reads as awe. Motion here would cheapen it. |
| 4 EXPLODE | Pull back + RISE to high 3/4 — the AKG angle (~20° above), diagonal axis lower-left → upper-right into depth | One continuous pull-and-rise while parts release | Rising camera + expanding parts = the frame literally opens. High angle lets the Z-stagger read. |
| 4b DRIFT (hold) | Same high 3/4 | 8% lateral drift + ~10° orbit, nothing else | Parallax across the suspended constellation proves the 3D; slow enough to read copy. |
| 5 REASSEMBLE | Descending back through 3/4-front to a final near-profile, LOW again | Descend + reverse-orbit while parts snap home; end static | The film returns to the monument it opened on — a closed loop. The last frame holds dead still. |

---

## 4. The shot sequence & transitions — the emotional arc

**Arc in one line: reverence → curiosity → revelation → wonder → resolution.**

1. **ORBIT — "the monument" (scroll 0–18%).** Black frame; the blade rim draws the headband arc out of nothing before the key pool blooms. First recognition of the object. Copy: product wordmark, lower-left void, paper-white. Transition out: the orbit's push-in naturally hands to beat 2 (same move, tightening).
2. **APPROACH — "the question" (18–30%).** The camera commits to the right earcup; background pool centers behind the cup and haloes it. Tension: an opaque, perfect surface. No copy — silence before the reveal.
3. **X-RAY — "the revelation" (30–48%). MONEY SHOT #1.** Two-stage, done entirely with light: (a) the shell's outer cap turns smoked glass, internals visible but unlit — a held breath; (b) the EMBER ignites — copper coil and PCB traces burn warm while the exterior world drops a stop darker. This is ref3's signature executed with more discipline. Copy: one engineering claim, right-side void. Transition out: the ember's glow *stays* as the constant while everything else starts to move — light continuity bridges the cut-less transition.
4. **EXPLODE — "wonder" (48–78%). MONEY SHOT #2 at full constellation.** Parts release along the diagonal into depth (choreography §5). Ends in the suspended constellation: driver + coil center-crowned and brightest, ember spilling on neighbors, foreground cushion edge softly out of focus, headband levitating above. The drift (4b) holds the constellation for reading. Copy: 2–3 feature callouts in the dark voids between part clusters — thin white hairlines to parts, Swiss-brutal labels.
5. **REASSEMBLE — "resolution" (78–100%).** Reverse choreography, tighter and faster — precision, not replayed footage (§5 timing differs). The ember is progressively swallowed as the shell seats; final frame is the whole product, low near-profile, cold blade rim — plus ONE new element: a hairline #ff3e00 underline beneath the DOM wordmark, the only orange that survives outside the product. Copy: CTA. The page ends on stillness.

Pacing note for the scrub map: beats are NOT equal scroll lengths — revelation (3) and explode (4) own ~66% of the scroll. Fast beats feel fast because slow beats are long.

---

## 5. Element choreography — how the parts move

The anti-pattern is K3's even mechanical spread. The rule here: **unequal gaps, staggered release, material-true easing, one crown.**

**Part inventory (7):** ear cushion · acoustic fabric ring · grille disc · driver + copper coil (THE CROWN) · damping ring · PCB · outer shell cap (smoked glass). Headband + yoke never explode — they levitate as one piece above, anchoring the silhouette (as in ref2/ref3: the recognizable arc keeps the exploded frame a *headphone*, not a parts pile).

- **Release order & stagger:** cushion first (softest, nearest camera), then fabric ring, grille, damping ring, PCB, shell cap — and the DRIVER releases LAST, shortest travel, so the eye lands on it as everything else clears. Stagger ≈ 8–10% scroll between releases; overlapping, never simultaneous.
- **Spacing:** unequal by design. Big gap between cushion and grille (air), tight cluster of driver+coil+damping (the engine reads as one jewel), medium gap to PCB, shell cap furthest with a 15° face-rotation toward camera (ref1's trick — the part *presents* itself).
- **Axis:** NOT a horizontal row. The diagonal explode axis runs lower-left → upper-right into depth; each successive part is smaller in frame = Z-recession the high camera can read. Slight vertical scatter (±3%) so silhouettes never align — aligned silhouettes are what made K3 look die-cut.
- **Easing (material-true):** leather cushion peels off slow-out, sensual. Metal parts eject expo-out with a tiny overshoot and spring-settle — machined precision. Glass cap drifts, nearly frictionless. In scroll-scrub terms: ease curves are baked into per-part travel-vs-scroll maps, and the keyframes are generated at the eased positions (Veo interpolates between eased poses, so the ease survives interpolation).
- **Reassemble ≠ reverse playback:** same paths, ~30% tighter stagger, snap ease-in, and each part seats with a one-frame micro-compress (2% scale dip) — the felt "click" of tolerance-fit engineering. The driver seats first (crown returns home first), shell cap seals last, killing the ember.

---

## 6. SHOT LIST — art-directed keyframes (the Codex deliverable)

Global spec for every still: 2048×1152 (16:9), same product identity chained from the previous accepted still (Codex references prior frames), background gradient + vignette per §1, lighting per §2 with the blade direction LOCKED (back-left, slightly high) across all frames, 85mm-equiv telephoto, no text baked in, no props, no floor. Each consecutive pair = one Veo clip; deltas stay inside §3 limits.

| KF | Beat | Camera | Lighting | Composition & action |
|---|---|---|---|---|
| **K01 "Void profile"** | 1 | Low (10° below cup axis), near-profile, product right-of-center at ~40% frame height | Blade rim ONLY — headband arc and cup edge drawn as a cold line; key pool at 10%, barely-there background glow upper-left | Product whole, floating; lower-left third is pure black void (wordmark lands here in DOM) |
| **K02 "First light"** | 1 | Orbited ~25° toward 3/4-front, risen to cup-level, pushed in to ~48% | Key pool blooms to full: leather grain and yoke streak now readable; ratio settles at 8:1 | The monument revealed; occlusion pool appears beneath |
| **K03 "The cup"** | 2 | Continue orbit ~15°, medium-close — right earcup ~45% frame height, slightly right of center | Background pool centers directly behind cup = halo separation; blade unchanged | Opaque perfect cup; left third void for silence (no copy) |
| **K04 "Glass"** | 3 | A breath of push from K03, a few degrees high looking down into the cup (cup ~60% height) | Same sources; shell cap now SMOKED GLASS — internals (grille, driver, PCB) visible but UNLIT, cold | The held breath — you can see in, but it hasn't spoken yet |
| **K05 "Ember" — MONEY #1** | 3 | Identical to K04 (static camera) | EMBER IGNITES: copper coil + PCB traces glow warm #ff3e00-shifted; exterior drops ~1 stop; glass picks up interior bounce + blade sliver | The revelation frame. Right-side void for the engineering claim |
| **K06 "Release"** | 4 | Pulling back + rising toward high 3/4 (~12° above), product ~55% width | Ember constant; key/blade unchanged; spill from ember touches the departing cushion | First separation: cushion + fabric ring have peeled (unequal gaps), rest seated — the explode has BEGUN, mid-gesture, not posed |
| **K07 "Full constellation" — MONEY #2** | 4 | High 3/4, the AKG angle (~20° above), whole system on the lower-left → upper-right diagonal | Ember at max as the frame's brightest point on the crowned driver+coil cluster; blade carves every part edge; foreground cushion edge softly defocused | All 7 parts suspended per §5 spacing; headband+yoke levitating above, arc intact; dark voids between clusters left for callout copy |
| **K08 "Drift"** | 4b | K07 translated laterally ~8% + orbited ~10° | Identical to K07 | Parallax proof-of-3D; composition still leaves the callout voids readable |
| **K09 "Recall"** | 5 | Descending, orbited back toward 3/4-front, product ~50% | Ember dimming — half-swallowed as driver and inner parts have seated | Parts mid-flight homeward, tighter cluster, shell cap still out with its 15° face turn |
| **K10 "Sealed"** | 5 | Cup-level 3/4-front (echo of K02 but tighter) | Ember gone — shell sealed; cold blade + pool only | Product whole again, micro-compress moment just passed; poised stillness |
| **K11 "Monument, again"** | 5 | Return to low near-profile (echo of K01, slightly closer than K01) | Blade rim + low pool; deepest frame of the film | End frame, held: lower-left void for wordmark + the single #ff3e00 hairline + CTA (all DOM) |

Clip map: K01→K02→…→K11 = 10 Veo clips; scroll lengths weighted per §4 pacing (K04→K05 and K06→K07→K08 own the majority of scroll travel). If a clip's interpolation smears part edges, insert ONE additional Codex still at the eased midpoint of that clip (§5 eased poses) rather than accepting the smear — crispness always comes from stills, never from asking Veo to try harder.

Acceptance test for every generated still, before it enters the sequence: (1) can you name the blade, the pool, and (beats 3+) the ember in the frame? (2) is exactly one element the brightest/crowned? (3) do any two part silhouettes align or sit at equal gaps? (4) is there a black void where this beat's copy lands? Fail any → reshoot the still, don't fix in post.
