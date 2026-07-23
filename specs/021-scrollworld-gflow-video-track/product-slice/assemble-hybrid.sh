#!/bin/bash
# Assemble the hybrid film: dark anchored orbit (veo) + crisp stills-morph explode reveal.
# orbit ends at K03, explode starts at K03 -> seamless. Output: web webp frame-sequence + manifest.
set -e
cd "/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice"
export PATH="$HOME/.local/bin:$PATH"
SRC=source; SITE=site/assets/seq/aura

# 1. normalize orbit to 1536x864 24fps + dark grade (match Ink Chamber), silence audio
ffmpeg -y -loglevel error -i "$SRC/orbit-anchored.mp4" \
  -vf "scale=1536:864:force_original_aspect_ratio=decrease,pad=1536:864:(ow-iw)/2:(oh-ih)/2:black,fps=24,eq=contrast=1.06:saturation=0.97" \
  -an -c:v libx264 -crf 16 -pix_fmt yuv420p "$SRC/orbit-final.mp4"

# 2. concat orbit + explode-stills (both 1536x864 24fps)
printf "file 'orbit-final.mp4'\nfile 'explode-stills.mp4'\n" > "$SRC/filmlist.txt"
ffmpeg -y -loglevel error -f concat -safe 0 -i "$SRC/filmlist.txt" \
  -c:v libx264 -crf 16 -pix_fmt yuv420p "$SRC/aura-film.mp4"
ORBIT_F=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$SRC/orbit-final.mp4")
TOTAL_F=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$SRC/aura-film.mp4")
echo "orbit frames=$ORBIT_F total=$TOTAL_F"

# 3. extract to webp sequence at 1440-wide (retina scrub); thin to keep count reasonable
rm -rf "$SITE"; mkdir -p "$SITE"
ffmpeg -y -loglevel error -i "$SRC/aura-film.mp4" -vf "scale=1440:-2" -q:v 82 "$SITE/f%04d.webp"
COUNT=$(ls "$SITE"/*.webp | wc -l | tr -d ' ')
echo "SEQ frames=$COUNT dir=$SITE"
echo "ORBIT_END=$ORBIT_F TOTAL=$COUNT"
