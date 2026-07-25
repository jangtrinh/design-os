#!/bin/bash
cd "/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice"
GPY=/Users/jang/.local/share/uv/tools/gflow-cli/bin/python
DRV=/Users/jang/.claude/skills/es-gflow/references/archA_driver.py
seed="source/ink-chain2/seed5.png"
for i in 6 7 8 9; do
  pkill -x "Google Chrome" 2>/dev/null; pkill -f "chrome-mac|for-testing" 2>/dev/null; sleep 12
  python3 -c "import json;p=[json.loads(l) for l in open('prompts-ink.jsonl') if l.strip()];open('source/_p1.jsonl','w').write(json.dumps(p[$i])+'\n')"
  rm -rf source/_leg; mkdir -p source/_leg
  echo "== leg $i (seed $(basename $seed)) =="
  "$GPY" "$DRV" source/_leg "$seed" source/_p1.jsonl veo-quality 6 > "source/legrun_$i.out" 2>&1
  if [ -f source/_leg/leg0.mp4 ]; then
    cp source/_leg/leg0.mp4 "source/ink-chain2/leg$i.mp4"; cp source/_leg/seed0.png "source/ink-chain2/seed$i.png"
    seed="source/ink-chain2/seed$i.png"; echo "leg $i OK"
  else echo "leg $i FAIL"; grep '"error"' "source/legrun_$i.out"|tail -1; fi
done
echo "RESUME DONE: $(ls source/ink-chain2/leg*.mp4|wc -l|tr -d ' ')/10"
