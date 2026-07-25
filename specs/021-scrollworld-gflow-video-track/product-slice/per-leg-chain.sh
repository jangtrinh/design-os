#!/bin/bash
# Seed-chain, ONE leg per process + gap, to dodge the profile-launch race.
# leg0 already exists (source/ink-chain2/leg0.mp4 + seed0.png). Continue legs 1..9.
cd "/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice"
GPY=/Users/jang/.local/share/uv/tools/gflow-cli/bin/python
DRV=/Users/jang/.claude/skills/es-gflow/references/archA_driver.py
seed="source/ink-chain2/seed0.png"
for i in 1 2 3 4 5 6 7 8 9; do
  python3 -c "import json;p=[json.loads(l) for l in open('prompts-ink.jsonl') if l.strip()];open('source/_p1.jsonl','w').write(json.dumps(p[$i])+'\n')"
  rm -rf source/_leg; mkdir -p source/_leg
  echo "== leg $i (seed $(basename $seed)) =="
  "$GPY" "$DRV" source/_leg "$seed" source/_p1.jsonl veo-quality 6 > "source/legrun_$i.out" 2>&1
  if [ -f source/_leg/leg0.mp4 ]; then
    cp source/_leg/leg0.mp4 "source/ink-chain2/leg$i.mp4"
    cp source/_leg/seed0.png "source/ink-chain2/seed$i.png"
    seed="source/ink-chain2/seed$i.png"
    echo "leg $i OK ($(stat -f%z source/ink-chain2/leg$i.mp4) bytes)"
  else
    echo "leg $i FAIL"; grep -E '"error"' "source/legrun_$i.out" | tail -1; break
  fi
  sleep 8
done
echo "PER-LEG CHAIN DONE: $(ls source/ink-chain2/leg*.mp4 | wc -l | tr -d ' ')/10"
