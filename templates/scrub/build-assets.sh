#!/usr/bin/env bash
#
# build-assets — encode a scroll-cinema clip chain to the scrub-encode floor,
# and pull one poster per clip.
#
# Emitted verbatim by `ui scrub-scaffold`. The floor it carries is stated in
# knowledge/scroll-cinema-direction.md § "The scrub-encode floor"; `ui scrub-lint`
# checks the encoded result against that same floor. Change a knob here and
# scrub-lint is what tells you — run it on every output before shipping.
#
# Why a poster goes through PNG instead of straight to webp: many ffmpeg builds
# ship with the webp encoder disabled, so `cwebp` does that leg.
#
# Usage:
#   ./build-assets.sh <src-dir> <out-dir> [landscape|portrait]
#
# Requires: ffmpeg (with ffprobe), cwebp.  `design-os doctor` reports all three.

set -euo pipefail

SRC="${1:-}"
OUT="${2:-}"
PROFILE="${3:-landscape}"

if [ -z "$SRC" ] || [ -z "$OUT" ]; then
  echo "usage: $0 <src-dir> <out-dir> [landscape|portrait]" >&2
  exit 2
fi
[ -d "$SRC" ] || { echo "build-assets: no such source directory: $SRC" >&2; exit 2; }

for bin in ffmpeg ffprobe cwebp; do
  command -v "$bin" >/dev/null 2>&1 || { echo "build-assets: '$bin' not on PATH" >&2; exit 2; }
done

# ---- the floor -------------------------------------------------------------
# Keep these in step with src/core/scrub-encode-floor.ts. Uniform settings across
# the whole chain are part of the one-take illusion: a single clip encoded
# differently reads as a cut.
CRF=20
UNSHARP="5:5:0.8:5:5:0.0"
POSTER_WIDTH=1536
POSTER_QUALITY=88

case "$PROFILE" in
  landscape)
    GOP=8
    SCALE=""            # native resolution — never downscale a scrub clip
    ;;
  portrait)
    GOP=4               # tighter: a phone decoder's seek cost scales with GOP
    SCALE="scale=720:-2"
    ;;
  *)
    echo "build-assets: unknown profile '$PROFILE' (expected landscape|portrait)" >&2
    exit 2
    ;;
esac

mkdir -p "$OUT/vid"

shopt -s nullglob
clips=("$SRC"/*.mp4)
shopt -u nullglob
[ "${#clips[@]}" -gt 0 ] || { echo "build-assets: no .mp4 files in $SRC" >&2; exit 2; }

for clip in "${clips[@]}"; do
  name="$(basename "$clip" .mp4)"

  # A portrait profile must be fed a natively-rendered 9:16 chain. Centre-cropping
  # a 16:9 source is a FALLBACK, and one the user has to be told about — so this
  # refuses rather than cropping silently.
  if [ "$PROFILE" = "portrait" ]; then
    dims="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$clip")"
    w="${dims%x*}"; h="${dims#*x}"
    if [ "$w" -gt "$h" ]; then
      echo "build-assets: $name is ${dims} (landscape) but the portrait profile was asked for." >&2
      echo "  Render the chain natively at 9:16. A centre-crop shows only the middle of the" >&2
      echo "  frame and must never be applied silently — crop it yourself if that is what you want." >&2
      exit 1
    fi
  fi

  vf="unsharp=$UNSHARP"
  [ -n "$SCALE" ] && vf="$SCALE,$vf"

  # -an          a scrubbed clip never plays sound
  # -g/-keyint_min/-sc_threshold 0   fixed GOP, so seek cost is uniform
  # +faststart   the index must precede the payload, or the first seek waits
  #              for the whole file
  ffmpeg -y -loglevel error -i "$clip" \
    -an -vf "$vf" \
    -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p \
    -g "$GOP" -keyint_min "$GOP" -sc_threshold 0 \
    -movflags +faststart \
    "$OUT/vid/$name.mp4"

  # Poster = the clip's FIRST frame: what the stage holds until the clip paints.
  ffmpeg -y -loglevel error -i "$clip" -frames:v 1 \
    -vf "scale=$POSTER_WIDTH:-2" "$OUT/$name.png"
  cwebp -quiet -q "$POSTER_QUALITY" "$OUT/$name.png" -o "$OUT/$name.webp"
  rm -f "$OUT/$name.png"

  echo "built $name → $OUT/vid/$name.mp4 + $OUT/$name.webp"
done

echo
echo "next: verify the floor actually held —"
for clip in "${clips[@]}"; do
  echo "  ui scrub-lint $OUT/vid/$(basename "$clip")"
done
