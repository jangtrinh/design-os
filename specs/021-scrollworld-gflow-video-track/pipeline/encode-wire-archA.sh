#!/bin/bash
# Encode Arch-A legs per scroll-world Step 6 (unsharp + crf20 + g8 + faststart) into web-v2,
# and extract posters = each leg's FIRST frame (repo: poster == clip first frame), finale = leg3 last.
set -uo pipefail
export PATH="$HOME/.local/bin:$PATH"
cd "/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track"
SRC=clips-A; WEB=web-v2
mkdir -p "$WEB/assets/vid"
[ -f "$SRC/leg0.mp4" ] || { echo "legs not ready"; exit 1; }
# scrub-optimized encode (repo Step 6 exact)
for i in 0 1 2 3; do
  ffmpeg -y -loglevel error -i "$SRC/leg$i.mp4" -an -vf "unsharp=5:5:0.8:5:5:0.0" \
    -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -g 8 -keyint_min 8 -sc_threshold 0 \
    -movflags +faststart "$WEB/assets/vid/s$i.mp4"
done
# posters = leg first frames (s0..s3), finale poster s4 = leg3 LAST frame (the arrival)
for i in 0 1 2 3; do
  ffmpeg -y -loglevel error -i "$SRC/leg$i.mp4" -frames:v 1 -vf "scale=1536:-2" "$WEB/assets/_p$i.png"
  cwebp -quiet -q 88 "$WEB/assets/_p$i.png" -o "$WEB/assets/s$i.webp"; rm -f "$WEB/assets/_p$i.png"
done
ffmpeg -y -loglevel error -sseof -0.08 -i "$SRC/leg3.mp4" -frames:v 1 -update 1 "$WEB/assets/_p4.png"
cwebp -quiet -q 88 "$WEB/assets/_p4.png" -o "$WEB/assets/s4.webp"; rm -f "$WEB/assets/_p4.png"
echo "encoded + posters:"; ls "$WEB/assets/"*.webp "$WEB/assets/vid/"*.mp4
