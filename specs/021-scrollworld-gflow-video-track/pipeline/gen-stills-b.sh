#!/usr/bin/env bash
# Codex image_gen — stills-v2 round B: forward chain ST4 (ref st3) -> ST5 (ref st4).
# Close-in stations; brand wordmark "SoDeal" must render clean (re-roll if garbled).
set -uo pipefail
WORK="/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track"
cd "$WORK"
CX() { CMUX_CODEX_HOOKS_DISABLED=1 codex exec -C "$WORK" -s workspace-write --skip-git-repo-check "$@"; }
STYLE='Soft matte clay-render isometric miniature diorama town, Hoi An old-quarter style: saffron-yellow plaster shophouses with terracotta tile roofs, strings of glowing red and gold silk lanterns, market awnings in terracotta, saffron, cream and sky-blue, potted bonsai trees, a turquoise canal with tiny wooden boats, tiny figures wearing non la conical hats. Warm golden-hour light, soft long shadows, tilt-shift miniature depth of field. Palette: SoDeal red #E0282E accents, saffron #E8A33D, terracotta #B4552D, cream #F2E3C9, canal turquoise #7EC8D8. High detail, high resolution.'
OW='This is THE EXACT SAME miniature town as the attached reference image — the same buildings in the same positions, the same street layout, the same canal on the right, the same lantern lines and awnings. Do not redesign it, do not invent new geography, do not restyle it, do not recolor it. Copy the reference world faithfully.'

echo "== ST4 (ref = st3): approach SoDeal-red shopfront, becomes centred focal point =="
CX "Use the image generation tool (\$imagegen) with the attached image as the reference. $OW The ONLY change is the camera position: the camera has continued FORWARD and descended LOWER, now approaching the shophouse with the red storefront sign on the left block of the street; that red-signed SoDeal shop is now the centred focal point of the frame, its warm interior glowing with shelves of goods, lantern strings crossing the top of the frame, the canal still visible at the right edge. The sign is a clean rectangular red sign — if any text appears on it, it reads exactly \"SoDeal\" in white capital letters, nothing else. $STYLE Wide 3:2 landscape. Save it as ./stills-v2/st4.png. Do not do anything else." \
  -i "$WORK/stills-v2/st3.png"
echo "ST4 exit=$? -> $(ls -la stills-v2/st4.png 2>/dev/null || echo MISSING)"

echo "== ST5 (ref = st4): final push, shopfront fills frame, clean SoDeal wordmark =="
CX "Use the image generation tool (\$imagegen) with the attached image as the reference. $OW The ONLY change is the camera position: the camera has made one final slow push forward and down, settling close in front of the SAME red-signed shopfront from the reference — the shopfront now fills most of the frame, warmly lit interior visible through the open front, red and gold lanterns framing the top corners, and one oversized red gift-tag-shaped deal tag with a white percent symbol hanging beside the door. The shop sign reads exactly \"SoDeal\" in clean white capital letters on the red sign, and no other readable text exists anywhere in the image. $STYLE Wide 3:2 landscape. Save it as ./stills-v2/st5.png. Do not do anything else." \
  -i "$WORK/stills-v2/st4.png"
echo "ST5 exit=$? -> $(ls -la stills-v2/st5.png 2>/dev/null || echo MISSING)"
echo "ROUND B DONE"
