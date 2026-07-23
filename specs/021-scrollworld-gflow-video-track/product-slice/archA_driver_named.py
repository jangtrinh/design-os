#!/usr/bin/env python3
"""archA seed-chain driver + NAMED Flow projects (so generations are trackable by leg on Flow,
not by timestamp). Local variant of es-gflow/references/archA_driver.py — a gap is recorded to
graduate project-labelling into the shared driver.

Usage: archA_driver_named.py <out_dir> <seed.png> <prompts.jsonl> [model] [duration] [label] [leg_start]
  label     e.g. "AURA" -> each Flow project titled "AURA-legN"
  leg_start N so a single-leg re-roll names its project by the REAL leg number (e.g. 7), not 0.
"""
from __future__ import annotations
import asyncio, json, subprocess, sys
from pathlib import Path

def log(o): print(json.dumps(o), flush=True)

async def main() -> int:
    out=Path(sys.argv[1]); seed0=Path(sys.argv[2]); prompts_f=Path(sys.argv[3])
    model=sys.argv[4] if len(sys.argv)>4 else "veo-fast"
    duration=int(sys.argv[5]) if len(sys.argv)>5 else 6
    label=sys.argv[6] if len(sys.argv)>6 and sys.argv[6] else None
    leg_start=int(sys.argv[7]) if len(sys.argv)>7 else 0
    out.mkdir(parents=True, exist_ok=True)
    prompts=[json.loads(l)["prompt"] for l in prompts_f.read_text().splitlines() if l.strip()]

    from gflow_cli._cli_helpers import _resolve_profile
    from gflow_cli.auth import profile_dir as pdir
    from gflow_cli.api.client import FlowApiClient
    from gflow_cli.api.video import Aspect, GenerateVideoRequest, Mode, VideoModel
    profile_dir=pdir(_resolve_profile(None))

    seed=seed0
    for i, prompt in enumerate(prompts):
        legno=leg_start+i
        title=f"{label}-leg{legno}" if label else None
        req=GenerateVideoRequest(prompt=prompt, mode=Mode.I2V, aspect=Aspect.LANDSCAPE,
            model=VideoModel.from_cli(model), duration=duration, start_image=Path(seed))  # NO end_image
        try:
            async with FlowApiClient(profile_dir=profile_dir, out_dir=out) as client:
                pid=None
                if title:
                    proj=await client.create_project(title=title)   # named -> trackable on Flow
                    pid=proj.project_id
                res=await client.generate_video(req=req, project_id=pid, out_dir=out, download=False)
            mid=res.status.media_id
            legmp4=out/f"leg{i}.mp4"
            async with FlowApiClient(profile_dir=profile_dir, out_dir=out) as client:
                await client.download_video(mid, legmp4)
        except Exception as e:
            log({"ok":False,"leg":legno,"error":str(e)}); return 1
        if not legmp4.exists() or legmp4.stat().st_size==0:
            log({"ok":False,"leg":legno,"error":"no mp4 after download","media_id":mid}); return 1
        seed=out/f"seed{i}.png"
        subprocess.run(["ffmpeg","-y","-loglevel","error","-sseof","-0.08","-i",str(legmp4),
                        "-frames:v","1","-update","1",str(seed)], check=True)
        log({"ok":True,"leg":legno,"title":title,"media_id":mid,"mp4":str(legmp4),"bytes":legmp4.stat().st_size})
    log({"ok":True,"done":True,"legs":len(prompts)})
    return 0

if __name__=="__main__":
    sys.exit(asyncio.run(main()))
