#!/usr/bin/env bash
# Trích chuỗi frame WebP cho scrub-section từ một clip.
#
# Vì sao qua PNG: ffmpeg cài bằng brew ở máy này KHÔNG có encoder libwebp
# ("Unknown encoder 'libwebp'"). cwebp của gói `webp` thì có, nên đường đi là
# ffmpeg -> PNG tạm -> cwebp -> webp. Đừng đổi lại thành `-c:v libwebp`.
#
# Hai tầng chất lượng vì engine (scrub-section.js) nhận `frames` + `framesLQ`:
# tầng LQ nhẹ để hiện ngay khi cuộn nhanh, tầng HQ nâng cấp đúng frame đang xem.
#
#   ./extract-frames.sh <input.mp4> <out-dir> <tên> [bước-frame]
#
# Ví dụ: ./extract-frames.sh Drone-Circling.mp4 ../site/assets hero 1
set -euo pipefail

IN="${1:?thiếu input.mp4}"
OUT_ROOT="${2:?thiếu thư mục đích}"
NAME="${3:?thiếu tên cảnh}"
STEP="${4:-1}"

HQ_W=1600; HQ_Q=80
LQ_W=480;  LQ_Q=50

HQ="$OUT_ROOT/$NAME"
LQ="$OUT_ROOT/$NAME-lq"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/frames.XXXXXX")
trap 'rm -rf "$TMP"' EXIT INT TERM

rm -rf "$HQ" "$LQ"; mkdir -p "$HQ" "$LQ"

SELECT=""
[[ "$STEP" -gt 1 ]] && SELECT="select='not(mod(n\\,$STEP))',"

echo "==> Tách PNG từ $(basename "$IN") (mỗi $STEP frame)"
ffmpeg -v error -y -i "$IN" -vf "${SELECT}scale=$HQ_W:-2" -fps_mode passthrough "$TMP/%04d.png"
N=$(find "$TMP" -name '*.png' | wc -l | tr -d ' ')
echo "==> $N frame -> WebP (HQ ${HQ_W}px q$HQ_Q, LQ ${LQ_W}px q$LQ_Q)"

# -P: cwebp là đơn luồng, chạy song song theo số core cho nhanh
find "$TMP" -name '*.png' -print0 | xargs -0 -P "$(sysctl -n hw.ncpu)" -I{} sh -c '
  f="{}"; b=$(basename "$f" .png)
  cwebp -quiet -q '"$HQ_Q"' "$f" -o "'"$HQ"'/$b.webp"
  cwebp -quiet -q '"$LQ_Q"' -resize '"$LQ_W"' 0 "$f" -o "'"$LQ"'/$b.webp"
'

echo "    HQ: $(ls "$HQ" | wc -l | tr -d ' ') frame, $(du -sh "$HQ" | cut -f1)"
echo "    LQ: $(ls "$LQ" | wc -l | tr -d ' ') frame, $(du -sh "$LQ" | cut -f1)"
