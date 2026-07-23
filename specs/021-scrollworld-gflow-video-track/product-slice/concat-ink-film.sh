#!/bin/bash
# Concat the softbox seed-chain (leg0..leg9 in order) -> ink-film2 -> 2K upscale (Real-ESRGAN local,
# no credits) -> renders/AURA-ink-chamber-film.mp4. Run AFTER fix-legs-789 lands 10/10.
set -e
cd "/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice"
export PATH="$HOME/.local/bin:$PATH"
N=$(ls source/ink-chain2/leg*.mp4 | wc -l | tr -d ' ')
[ "$N" -eq 10 ] || { echo "NOT READY: $N/10 legs"; exit 1; }
: > source/ink2list.txt
for i in 0 1 2 3 4 5 6 7 8 9; do echo "file 'ink-chain2/leg$i.mp4'" >> source/ink2list.txt; done
ffmpeg -y -loglevel error -f concat -safe 0 -i source/ink2list.txt -c copy source/ink-film2.mp4
echo "concat: $(ffprobe -v error -show_entries format=duration -of csv=p=0 source/ink-film2.mp4)s"
# CFR normalize then 2K upscale via skill (photoreal cinematic -> default animevideov3 is fine + fast)
ffmpeg -y -loglevel error -i source/ink-film2.mp4 -fps_mode cfr -r 24 -an source/ink-film2-cfr.mp4
bash ~/.claude/skills/es-video-upscale/scripts/upscale-video-realesrgan.sh source/ink-film2-cfr.mp4 --target 1440
mkdir -p ../renders
ffmpeg -y -loglevel error -i source/ink-film2-cfr_upscaled_1440p.mp4 -c:v libx264 -crf 17 -pix_fmt yuv420p -movflags +faststart ../renders/AURA-ink-chamber-film.mp4
echo "FILM: ../renders/AURA-ink-chamber-film.mp4 $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 ../renders/AURA-ink-chamber-film.mp4)"
