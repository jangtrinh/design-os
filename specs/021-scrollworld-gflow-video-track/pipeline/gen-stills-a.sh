#!/usr/bin/env bash
# Codex image_gen — stills-v2 round A: ST3 (ref master) + ST1 (ref master).
# Both derive from the approved bible s0-master.jpg. Zero-credit (Codex native).
set -uo pipefail
WORK="/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track"
cd "$WORK"
mkdir -p stills-v2
cp -f stills/s0-master.jpg stills-v2/st2.png   # ST2 = the bible, verbatim

CX() { CMUX_CODEX_HOOKS_DISABLED=1 codex exec -C "$WORK" -s workspace-write --skip-git-repo-check "$@"; }

echo "== ST3 (ref = master): forward + down along market street, deal tags appear =="
CX 'Use the image generation tool ($imagegen) with the attached image as the reference. This is THE EXACT SAME miniature town as the attached reference image — the same buildings in the same positions, the same street layout, the same canal on the right, the same lantern lines and awnings. Do not redesign it, do not invent new geography, do not restyle it, do not recolor it. Copy the reference world faithfully. The ONLY change is the camera position: the camera has moved FORWARD along the main market street toward the hexagonal-roofed corner building and slightly LOWER, so the market stalls are larger in frame and the far edge of town from the reference is now off-frame behind the camera. New in this frame only: small red-and-gold percent-sign deal tags hanging from the stall awnings and lantern strings, and a few shopper figures carrying tiny red shopping bags. Soft matte clay-render isometric miniature diorama town, Hoi An old-quarter style: saffron-yellow plaster shophouses with terracotta tile roofs, strings of glowing red and gold silk lanterns, market awnings in terracotta, saffron, cream and sky-blue, potted bonsai trees, a turquoise canal with tiny wooden boats, tiny figures wearing non la conical hats. Warm golden-hour light, soft long shadows, tilt-shift miniature depth of field. Palette: SoDeal red #E0282E accents, saffron #E8A33D, terracotta #B4552D, cream #F2E3C9, canal turquoise #7EC8D8. High detail, high resolution. Wide 3:2 landscape. Save it as ./stills-v2/st3.png. Do not do anything else.' \
  -i "$WORK/stills/s0-master.jpg"
echo "ST3 exit=$? -> $(ls -la stills-v2/st3.png 2>/dev/null || echo MISSING)"

echo "== ST1 (ref = master): pull UP and BACK, whole town below =="
CX 'Use the image generation tool ($imagegen) with the attached image as the reference. This is THE EXACT SAME miniature town as the attached reference image — the same buildings in the same positions, the same street layout, the same canal on the right, the same lantern lines and awnings. Do not redesign it, do not invent new geography, do not restyle it, do not recolor it. Copy the reference world faithfully. The ONLY change is the camera position: the camera has pulled UP and BACK, much higher and further away, so the ENTIRE miniature town is visible below as one connected diorama — the market intersection and canal from the reference now sit in the middle distance at the centre of the frame, the turquoise canal winds through the whole town from foreground to background with tiny boats, terracotta rooftops spread to the edges, and a warm hazy golden-hour sky band occupies the top fifth of the frame. Every landmark from the reference is still present, just smaller and seen from above. Soft matte clay-render isometric miniature diorama town, Hoi An old-quarter style: saffron-yellow plaster shophouses with terracotta tile roofs, strings of glowing red and gold silk lanterns, market awnings in terracotta, saffron, cream and sky-blue, potted bonsai trees, a turquoise canal with tiny wooden boats, tiny figures wearing non la conical hats. Warm golden-hour light, soft long shadows, tilt-shift miniature depth of field. Palette: SoDeal red #E0282E accents, saffron #E8A33D, terracotta #B4552D, cream #F2E3C9, canal turquoise #7EC8D8. High detail, high resolution. Wide 3:2 landscape. Save it as ./stills-v2/st1.png. Do not do anything else.' \
  -i "$WORK/stills/s0-master.jpg"
echo "ST1 exit=$? -> $(ls -la stills-v2/st1.png 2>/dev/null || echo MISSING)"
echo "ROUND A DONE"
