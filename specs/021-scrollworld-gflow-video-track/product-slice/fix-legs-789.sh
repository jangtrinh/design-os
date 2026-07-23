#!/bin/bash
# Fill the broken transition: leg7 (reassembly-descend) never rendered (profile-lock), so leg8
# was seeded from seed6 (EXPLODED) and jumped straight to SEALED. Re-render 7->8->9 chained from
# seed6, softbox look kept. One leg per process + hard Chrome-kill + gap + retries to beat the
# profile-launch race that failed leg7/leg9 before.
cd "/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice"
GPY=/Users/jang/.local/share/uv/tools/gflow-cli/bin/python
DRV="$PWD/archA_driver_named.py"            # names each Flow project AURA-legN (trackable)
seed="source/ink-chain2/seed6.png"          # leg6 out = leg7 in
for i in 7 8 9; do
  python3 -c "import json;p=[json.loads(l) for l in open('prompts-ink.jsonl') if l.strip()];open('source/_p789.jsonl','w').write(json.dumps(p[$i])+'\n')"
  ok=0
  for attempt in 1 2 3; do
    pkill -9 -f 'Google Chrome for Testing' 2>/dev/null; pkill -9 -f chromium 2>/dev/null; pkill -9 -f playwright 2>/dev/null
    sleep 7
    rm -rf source/_leg789; mkdir -p source/_leg789
    echo "== leg $i attempt $attempt (seed $(basename $seed)) =="
    "$GPY" "$DRV" source/_leg789 "$seed" source/_p789.jsonl veo-quality 6 AURA "$i" > "source/legfix_${i}_${attempt}.out" 2>&1
    if [ -f source/_leg789/leg0.mp4 ]; then
      cp source/_leg789/leg0.mp4 "source/ink-chain2/leg$i.mp4"
      cp source/_leg789/seed0.png "source/ink-chain2/seed$i.png"
      seed="source/ink-chain2/seed$i.png"
      echo "leg $i OK ($(stat -f%z source/ink-chain2/leg$i.mp4) bytes)"; ok=1; break
    else
      echo "leg $i attempt $attempt FAIL"; grep -oE '"error":[^}]*' "source/legfix_${i}_${attempt}.out" | tail -1
      sleep 5
    fi
  done
  [ $ok -eq 0 ] && { echo "LEG $i EXHAUSTED — stop"; exit 1; }
done
echo "FIX 789 DONE: legs=$(ls source/ink-chain2/leg*.mp4 | wc -l | tr -d ' ')/10"
