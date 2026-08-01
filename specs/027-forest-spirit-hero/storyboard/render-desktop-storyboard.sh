#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SPEC_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
REPO_DIR=$(CDPATH= cd -- "$SPEC_DIR/../.." && pwd)
SITE_ASSETS="$SPEC_DIR/site/assets"
WORK_DIR="$SCRIPT_DIR/work"
FRAME_DIR="$SCRIPT_DIR/desktop"

mkdir -p "$WORK_DIR" "$FRAME_DIR"

FAR="$SITE_ASSETS/rough-far-world.webp"
MID="$SITE_ASSETS/rough-mid-world.webp"
SHRINE="$SITE_ASSETS/rough-shrine-grounded.webp"
SPIRIT="$SITE_ASSETS/rough-spirit-core.webp"
LIGHT="$SITE_ASSETS/rough-spirit-light-envelope.webp"
RAYS="$SITE_ASSETS/rough-rear-atmosphere.webp"
CANOPY="$SITE_ASSETS/rough-canopy-arch.webp"
SILL="$SITE_ASSETS/rough-near-sill.webp"
FOREGROUND_SOURCE="$REPO_DIR/design/assets/forest-spirit-hero-test/published/foreground-frame-1920x1080.webp"

ANCHOR_X=653
ANCHOR_Y=405

magick "$SPIRIT" -trim +repage "$WORK_DIR/spirit.png"
magick "$LIGHT" -trim +repage "$WORK_DIR/light.png"
magick "$FOREGROUND_SOURCE" -resize 960x540 -crop 460x540+500+0 +repage "$WORK_DIR/right-obstruction-texture.png"
magick -size 460x540 canvas:none -fill 'rgba(8,22,18,0.94)' \
  -draw "path 'M 175,0 C 245,95 220,205 270,310 C 315,405 275,475 330,540 L 460,540 L 460,0 Z'" \
  -blur 0x3 "$WORK_DIR/right-obstruction-shade.png"
magick "$WORK_DIR/right-obstruction-shade.png" "$WORK_DIR/right-obstruction-texture.png" \
  -compose over -composite -channel A -fx 'a*(1-clamp((i/w-0.78)/0.22))' +channel \
  "$WORK_DIR/right-obstruction.png"

transform_layer() {
  tl_input=$1
  tl_scale=$2
  tl_shift_x=$3
  tl_shift_y=$4
  tl_output=$5
  tl_target_x=$((ANCHOR_X + tl_shift_x))
  tl_target_y=$((ANCHOR_Y + tl_shift_y))
  magick "$tl_input" -alpha set -virtual-pixel transparent \
    -define distort:viewport=960x540+0+0 \
    -distort SRT "$ANCHOR_X,$ANCHOR_Y $tl_scale 0 $tl_target_x,$tl_target_y" \
    "$tl_output"
}

place_subject() {
  ps_input=$1
  ps_height=$2
  ps_centre_x=$3
  ps_centre_y=$4
  ps_opacity=$5
  ps_output=$6
  ps_width=$(magick "$ps_input" -resize "x$ps_height" -format '%w' info:)
  ps_offset_x=$((ps_centre_x - ps_width / 2))
  ps_offset_y=$((ps_centre_y - ps_height / 2))
  magick -size 960x540 canvas:none \
    \( "$ps_input" -resize "x$ps_height" -channel A -evaluate multiply "$ps_opacity" +channel \) \
    -geometry "+$ps_offset_x+$ps_offset_y" -compose over -composite "$ps_output"
}

place_obstruction() {
  obstruction_x=$1
  obstruction_output=$2
  magick -size 960x540 canvas:none "$WORK_DIR/right-obstruction.png" \
    -geometry "+$obstruction_x+0" -compose over -composite "$obstruction_output"
}

render_station() {
  station_id=$1
  focus_scale=$2
  far_scale=$3
  canopy_scale=$4
  sill_scale=$5
  world_shift_x=$6
  canopy_shift_x=$7
  obstruction_x=$8
  light_gain=$9
  spirit_mode=${10}
  spirit_height=${11}
  spirit_x=${12}
  spirit_y=${13}
  spirit_opacity=${14}
  mood=${15}
  frame_output=${16}

  transform_layer "$FAR" "$far_scale" "$world_shift_x" 0 "$WORK_DIR/$station_id-far.png"
  transform_layer "$MID" "$focus_scale" "$world_shift_x" 0 "$WORK_DIR/$station_id-mid.png"
  transform_layer "$SHRINE" "$focus_scale" "$world_shift_x" 0 "$WORK_DIR/$station_id-shrine.png"
  transform_layer "$RAYS" "$focus_scale" "$world_shift_x" 0 "$WORK_DIR/$station_id-rays.png"
  transform_layer "$CANOPY" "$canopy_scale" "$canopy_shift_x" 0 "$WORK_DIR/$station_id-canopy.png"
  transform_layer "$SILL" "$sill_scale" "$canopy_shift_x" 0 "$WORK_DIR/$station_id-sill.png"

  place_subject "$WORK_DIR/spirit.png" "$spirit_height" "$spirit_x" "$spirit_y" "$spirit_opacity" "$WORK_DIR/$station_id-spirit.png"
  place_subject "$WORK_DIR/light.png" "$spirit_height" "$spirit_x" "$spirit_y" "$spirit_opacity" "$WORK_DIR/$station_id-light.png"
  place_obstruction "$obstruction_x" "$WORK_DIR/$station_id-obstruction.png"

  magick "$WORK_DIR/$station_id-rays.png" -evaluate multiply "$light_gain" "$WORK_DIR/$station_id-rays-gain.png"

  if [ "$spirit_mode" = "behind-shrine" ]; then
    layer_order="spirit-first"
  else
    layer_order="shrine-first"
  fi

  if [ "$layer_order" = "spirit-first" ]; then
    magick "$WORK_DIR/$station_id-far.png" \
      "$WORK_DIR/$station_id-rays-gain.png" -compose screen -composite \
      "$WORK_DIR/$station_id-mid.png" -compose over -composite \
      "$WORK_DIR/$station_id-light.png" -compose screen -composite \
      "$WORK_DIR/$station_id-spirit.png" -compose over -composite \
      "$WORK_DIR/$station_id-shrine.png" -compose over -composite \
      "$WORK_DIR/$station_id-canopy.png" -compose over -composite \
      "$WORK_DIR/$station_id-obstruction.png" -compose over -composite \
      "$WORK_DIR/$station_id-sill.png" -compose over -composite \
      "$WORK_DIR/$station_id-composite.png"
  else
    magick "$WORK_DIR/$station_id-far.png" \
      "$WORK_DIR/$station_id-rays-gain.png" -compose screen -composite \
      "$WORK_DIR/$station_id-mid.png" -compose over -composite \
      "$WORK_DIR/$station_id-shrine.png" -compose over -composite \
      "$WORK_DIR/$station_id-light.png" -compose screen -composite \
      "$WORK_DIR/$station_id-spirit.png" -compose over -composite \
      "$WORK_DIR/$station_id-canopy.png" -compose over -composite \
      "$WORK_DIR/$station_id-obstruction.png" -compose over -composite \
      "$WORK_DIR/$station_id-sill.png" -compose over -composite \
      "$WORK_DIR/$station_id-composite.png"
  fi

  if [ "$mood" = "absence" ]; then
    magick "$WORK_DIR/$station_id-composite.png" -fill 'rgba(3,13,17,0.22)' -colorize 18 "$frame_output"
  elif [ "$mood" = "warm" ]; then
    magick "$WORK_DIR/$station_id-composite.png" -fill 'rgba(255,222,156,0.10)' -colorize 8 "$frame_output"
  else
    cp "$WORK_DIR/$station_id-composite.png" "$frame_output"
  fi
}

render_station s01 1.000 1.000 1.020 1.020 0 0 330 0.40 front 95 336 194 0.78 cool "$FRAME_DIR/01-threshold.png"
render_station s02 1.015 1.006 1.045 1.045 0 0 310 0.62 front 132 365 235 0.92 cool "$FRAME_DIR/02-recognition.png"
render_station s03 1.040 1.015 1.090 1.100 -2 0 360 0.78 front 205 520 162 1.00 cool "$FRAME_DIR/03-crossing.png"
render_station s04 1.045 1.018 1.125 1.135 -3 0 300 0.28 behind-shrine 170 685 185 0.16 absence "$FRAME_DIR/04-absence.png"
render_station s05 1.072 1.026 1.155 1.175 -8 0 470 0.92 behind-shrine 165 620 205 0.92 warm "$FRAME_DIR/05-reveal.png"
render_station s06 1.095 1.035 1.185 1.215 -11 0 650 1.08 front 178 710 228 1.00 warm "$FRAME_DIR/06-orbit.png"
render_station s07 1.110 1.040 1.200 1.250 -12 0 760 0.98 front 122 825 272 0.96 warm "$FRAME_DIR/07-settle.png"

magick montage \
  "$FRAME_DIR/01-threshold.png" "$FRAME_DIR/02-recognition.png" \
  "$FRAME_DIR/03-crossing.png" "$FRAME_DIR/04-absence.png" \
  "$FRAME_DIR/05-reveal.png" "$FRAME_DIR/06-orbit.png" \
  "$FRAME_DIR/07-settle.png" \
  -thumbnail 480x270 -tile 2x4 -geometry +12+28 -background '#101b16' \
  -fill '#eef3df' -stroke none -pointsize 17 \
  -set label '%t' "$SCRIPT_DIR/desktop-storyboard-contact-sheet.jpg"

magick "$FRAME_DIR/07-settle.png" -resize 1920x1080 "$SCRIPT_DIR/reduced-motion-settled-preview-1920x1080.png"

printf 'Rendered seven desktop storyboard frames and contact sheet.\n'
