#!/bin/bash
# scroll-world Architecture A — continuous forward take (FOLLOW THE REPO, no invention).
# leg0 start = st1 (designed still). Each next leg's --initial-frame = the PREVIOUS leg's
# ACTUAL LAST FRAME (ffmpeg). NO --end-frame. Prompt = repo's forward-glide + motion-handoff
# contract (bold clauses verbatim). veo-fast draft, 6s, 16:9. Verify each download before next.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
WORK="/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track"
cd "$WORK"
OUT=clips-A; rm -rf "$OUT"; mkdir -p "$OUT"
STYLE="Soft matte clay diorama, tilt-shift miniature, warm golden-hour light, cohesive Hoi An palette of SoDeal red, saffron, terracotta, cream, turquoise canal. Smooth, graceful, slow motion, subtle parallax. No text, no captions."

# Architecture-A leg prompts (repo template: Continue forward glide -> mid move -> settle into forward glide toward next)
P0="Single continuous cinematic camera move, no cuts. Begin high above the whole miniature market town seen from outside like a tiny model, the camera slowly glides FORWARD and descends toward the market street beside the turquoise canal, sweeping in toward the stalls and red lanterns as if flying down into the town. In the final second, settle into a slow, steady forward glide along the market street. $STYLE"
P1="Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward glide. Tracking low and level forward along the market street, stalls, potted trees and lantern strings sliding past in parallax, small red and gold percent-sign deal tags coming into view on the awnings. In the final second, settle back into a slow, steady forward glide toward the red-signed SoDeal shop further down the street. $STYLE"
P2="Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward glide. Gliding forward and descending gently toward the SoDeal shopfront with its red sign on the left of the street, the glowing storefront growing to become the centre of the frame, tiny shoppers with red bags passing below. In the final second, settle back into a slow, steady forward glide straight toward the shop entrance. $STYLE"
P3="Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward glide. One final slow push straight toward the glowing SoDeal shopfront until it fills the frame, the red SoDeal sign above and a big red percent-symbol deal tag hanging by the open door. In the final second, ease to a gentle near-stop settled directly in front of the shopfront. $STYLE"

leg() { # $1=index  $2=initial-frame  $3=prompt
  local i="$1" seed="$2" prompt="$3"
  echo "== leg $i: i2v --initial-frame $(basename "$seed") (NO end-frame) =="
  local before after new
  before=$(ls "$OUT"/*.mp4 2>/dev/null | sort)
  gflow video i2v --initial-frame "$seed" "$prompt" \
    --model veo-fast --aspect 16:9 --duration 6 --out-dir "$OUT" --json \
    > "$OUT/leg_$i.json" 2> "$OUT/leg_$i.err" || { echo "CMD FAIL leg $i"; tail -3 "$OUT/leg_$i.err"; exit 1; }
  after=$(ls "$OUT"/*.mp4 2>/dev/null | sort)
  new=$(comm -13 <(echo "$before") <(echo "$after") | grep -vE "leg[0-9]\.mp4|seed" | head -1)
  [ -z "$new" ] && { echo "DOWNLOAD FAIL leg $i"; exit 1; }
  cp -f "$new" "$OUT/leg$i.mp4"
  # extract this leg's ACTUAL last frame as the next leg's seed (repo: real frame, not a still)
  ffmpeg -y -loglevel error -sseof -0.08 -i "$OUT/leg$i.mp4" -frames:v 1 -update 1 "$OUT/seed$i.png"
  echo "leg $i OK -> leg$i.mp4 ($(stat -f%z "$OUT/leg$i.mp4") bytes); seed$i.png extracted"
}

leg 0 "stills-v2/st1-169.png" "$P0"
leg 1 "$OUT/seed0.png" "$P1"
leg 2 "$OUT/seed1.png" "$P2"
leg 3 "$OUT/seed2.png" "$P3"
echo "ARCH-A DONE: $(ls "$OUT"/leg*.mp4 | wc -l | tr -d ' ')/4 legs"
