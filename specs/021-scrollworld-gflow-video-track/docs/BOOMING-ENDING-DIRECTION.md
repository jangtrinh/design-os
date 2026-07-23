# BOOMING + ENDING — Director's cut (Fable 5, 260723)

Owner verdict on clips-A: continuity OK, but "THIẾU CẢM GIÁC BOOMING, ENDING hơi CHÁN."
This doc is the fix. Constraint honored throughout: every seam stays a slow steady forward
drift (MASTERY §3); all drama lives INSIDE legs or in the scrub-speed mapping.

---

## 1. The booming concept: "DIVE — BREATHE — BUILD — IGNITE"

**Diagnosis first.** The flight is not under-rendered — it is under-CONDUCTED. Booming is
contrast, not speed: a roller coaster at constant velocity is a train. Right now all four
legs scrub at the same rate, so the one genuinely dramatic move we already own (leg1's
aerial dive into the town) reads as a slow elevator. The renders of legs 1–3 stay; the
tempo map changes.

**The tempo curve (a piece of music, four movements):**

| Beat | Leg | Feel | How |
|---|---|---|---|
| **DIVE** | 1 | Booming entrance — you FALL into the world | Short `scroll` → high scrub speed. The existing descent, played fast, IS a dive. Free. |
| **BREATHE** | 2 | Float through the living market, time dilates | Long `scroll` + high `linger` — camera hangs mid-market while copy peaks, then accelerates out. The slow-fast accordion. |
| **BUILD** | 3 | Pulse quickens — the red sign appears down the street | Medium `scroll`, modest `linger`. Perceptibly faster than beat 2. Anticipation. |
| **IGNITE** | 4 (NEW render) | Hero push-in → world bursts to life → rise-and-reveal | The only credit spend. §2. |

Camera language: fast–slow–medium–slow-then-RELEASE. The dive earns the float; the float
earns the build; the build earns the ignition. Constant speed earns nothing.

---

## 2. The killer ending: **"THE IGNITION & RISE"** (one reworked final leg)

Kill the parked-at-the-door ending. Arriving at a shop is logistics; an ending is the world
ANSWERING you. New final leg, one continuous move, three internal beats:

1. **Arrival (seam-legal):** first ~1s continues the same slow steady forward glide toward
   the shopfront — velocity-continuous with leg3 by construction (seeded from leg3's real
   last frame, verbatim handoff clause).
2. **The Ignition:** the camera ACCELERATES into a hero push-in — the red SoDeal sign grows
   to dominate the frame, the big % tag swinging by the door — and at the moment of arrival
   the world reacts: every lantern and every red deal-tag along the street FLARES to warm
   red-gold light in a wave radiating outward from the shop. The visitor's arrival switches
   the world on. That is the brand sentence: *SoDeal lights up the whole town.*
3. **The Rise (the money shot):** the camera sweeps up and back in one rising crane arc,
   above the tiled rooftops, revealing the WHOLE miniature town at deepening dusk — canal
   winding through, every street strung with glowing lanterns and glowing % tags, the SoDeal
   shop shining at the centre. Eases to a gentle floating rest on this wide aerial hero frame.

Why this ending works: it bookends the opening aerial (arrive from the sky, leave risen back
into it — the journey closes a circle); it converts the whole 24s world into brand real
estate (every light is now SoDeal-red); and the final wide, near-still frame is the perfect
stable canvas for the **"Tải app" CTA overlay** (trigger at ~92% scroll, over the resting
aerial). Crane-up + pull-back is a reversal INSIDE one render — explicitly safe (MASTERY §4);
scrubbing backward replays the rise in reverse smoothly, no seam involved. The final leg has
no outgoing seam, so after its first second it has total expressive freedom.

**New leg4 motion prompt (replaces prompts-archA.jsonl line 4):**

```json
{"prompt": "Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward glide toward the glowing SoDeal shopfront. Then the camera smoothly accelerates into a faster hero push-in, the red SoDeal sign growing until it dominates the frame, a big red percent-symbol deal tag swinging beside the open door. As the camera arrives, the world ignites: every lantern and every red percent deal tag along the street flares to life in a wave of warm red-gold glow spreading outward from the shop. The camera then sweeps smoothly up and backward in one rising crane arc, climbing above the tiled rooftops to reveal the whole miniature market town at deepening golden dusk, the turquoise canal winding through streets strung with glowing lanterns and red percent deal tags, the SoDeal shop shining brightest at the centre. In the final seconds, ease into a gentle floating rest on this wide aerial view. Soft matte clay diorama, tilt-shift miniature, warm golden-hour light deepening to dusk, cohesive Hoi An palette of SoDeal red, saffron, terracotta, cream, turquoise canal. Smooth, graceful, subtle parallax. No text, no captions."}
```

Deliberate deltas from house style: **"slow motion" is removed** from this leg's style tail
(it fights the acceleration — the other three legs keep it); dusk deepening is named so the
ignition has darkness to ignite against. If the engine supports a longer final leg (8s vs 6s),
take it — the arc wants ~1s glide / 1.5s push / 1s ignition / rest for the rise-and-settle.

---

## 3. The plan, ranked by ROI per credit

### Tier 1 — FREE: the pacing score (do first, ~15 min, 0 credits)
Per-section engine config (values relative to the current uniform baseline ≈100vh/section):

| Section | `scroll` | `linger` | Intent |
|---|---|---|---|
| 1 DIVE | **70vh** | **0.10** | Fast, near-linear scrub → the descent reads as a dive |
| 2 BREATHE | **160vh** | **0.45** | Long dwell, mid-market plateau while copy peaks, accelerate out |
| 3 BUILD | **110vh** | **0.25** | Medium; clearly quicker than S2 → rising pulse |
| 4 IGNITE | **200vh** | **0.55** | Slow-burn push (copy peaks on the sign), then linger's tail-acceleration releases into the rise |

Ship this alone first — the owner should feel the boom appear with ZERO re-renders. Tune by
feel; the SHAPE (short-long-medium-longest, low-high-mid-high) is the direction.

### Tier 2 — CHEAP: the Ignition & Rise finale (1 credit draft, +1 for quality pass)
Regenerate ONLY leg4 with the prompt above: `start_image` = leg3's actual last frame
(ffmpeg `-sseof -0.08`), no end-frame, standard archA_driver path. Localized — no cascade.
**Same credit, run the §9 HYBRID test:** set `reference_images=(master_style_still,)` on this
request. The rise re-synthesizes the aerial town from a street-level seed — exactly where
style drift bites — so the master-still ref is both insurance for this shot AND the one-credit
mechanism test MASTERY §9 is already waiting for. If the transport rejects the combo, render
without the ref and judge the invented aerial on palette-hold (dream-logic aerial is
acceptable for a finale; off-palette is not).

### Tier 3 — ONLY IF the 6s arc can't hold (judge the Tier-2 draft first): split the finale
Leg4 = push-in + ignition, ending "settle back into a slow, steady forward glide"; leg5 = the
rise. Costs +1 credit, +1 seam, +1 drift hop. Do NOT pre-commit — most likely the single-leg
version lands, and the extra seam forces the ignition to decelerate back to a drift, which
blunts it.

### NOT needed: upstream re-render
No full-chain re-render. The monotony is a conducting problem, not a footage problem — leg1
already contains the dive; Tier 1 unlocks it. Re-rendering leg0 cascades the whole chain
(~4+ credits) for energy we can get free. Declined.

---

## 4. Seam & smoothness ledger (MASTERY compliance)

- **Seam 1–2, 2–3:** renders untouched; frame-lock and velocity continuity unchanged.
- **Seam 3–4:** new leg4 seeded from leg3's real last frame, opens with the verbatim
  "continue the same slow, steady forward glide" clause for its first second. Contract intact.
- **Final end:** no outgoing seam; ease-to-rest. Backward scrub traverses the crane arc inside
  one render — safe per §4.
- **Pacing (scroll/linger) changes zero frames** — seam frame-lock is untouched by Tier 1.
  One QA add: high `linger` accelerates the scrub tail into a seam, so the perceived RATE can
  step at a boundary even though frames match. After tuning, scrub both directions and check
  no rate-jump reads at seams 2→3 especially (0.45 tail into 0.25 head); if it does, ease
  S2 linger toward 0.35 before touching anything else.
- **Drift caveat (§9):** leg count stays at 4 (Tier 3 would make it 5 — that is the only path
  that spends drift budget, and it is gated). The finale's aerial re-synthesis is the drift
  hot-spot; the hybrid ref is the mitigation, and its result should be recorded back into
  MASTERY §9 as the pending one-credit test's answer.

---

## 5. Acceptance (what the owner should FEEL)

1. Scroll starts → you FALL into the town (owner's word: booming) — within the first screen.
2. The market breathes — slow enough to want to stop, then it pulls you forward.
3. The red sign appears → pace quickens without any jerk at any seam, either scrub direction.
4. Arrival → the world lights up FOR you → you rise and see everything you flew through now
   glowing SoDeal-red → "Tải app" lands on the resting wide shot. That is an ENDING.
