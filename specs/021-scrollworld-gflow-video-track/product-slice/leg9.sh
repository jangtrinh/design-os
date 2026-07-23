#!/bin/bash
cd "/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice"
GPY=/Users/jang/.local/share/uv/tools/gflow-cli/bin/python
DRV=/Users/jang/.claude/skills/es-gflow/references/archA_driver.py
python3 -c "import json;p=[json.loads(l) for l in open('prompts-ink.jsonl') if l.strip()];open('source/_p9.jsonl','w').write(json.dumps(p[9])+'\n')"
for attempt in 1 2 3; do
  pkill -x "Google Chrome" 2>/dev/null; pkill -f "chrome-mac|for-testing|Chromium" 2>/dev/null; pkill -f "playwright" 2>/dev/null; sleep 20
  rm -rf source/_leg9; mkdir -p source/_leg9
  echo "attempt $attempt"
  "$GPY" "$DRV" source/_leg9 source/ink-chain2/seed8.png source/_p9.jsonl veo-quality 6 > "source/legrun_9_$attempt.out" 2>&1
  if [ -f source/_leg9/leg0.mp4 ]; then cp source/_leg9/leg0.mp4 source/ink-chain2/leg9.mp4; echo "LEG9 OK attempt $attempt"; break; else echo "attempt $attempt fail"; fi
done
echo "legs total: $(ls source/ink-chain2/leg*.mp4|wc -l|tr -d ' ')/10"
