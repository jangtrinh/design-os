#!/usr/bin/env python3
"""360 product orbit — keyframe-bounded A->A loop (research: product = bounded, end-frame REQUIRED).
start_image == end_image == master so the clip closes a seamless loop; the prompt drives the spin.
veo-fast draft, 8s (max, for a full turn), download-decoupled. Measures the P-1 open question:
does ONE clip hold a full 360, or is 4x 90-degree arcs needed (judge loop-closure + visible rotation).
"""
from __future__ import annotations
import asyncio, json, subprocess, sys
from pathlib import Path

WORK=Path("/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice")
MASTER=WORK/"source/stills/master.png"
OUT=WORK/"source"; OUT.mkdir(parents=True, exist_ok=True)
PROMPT=("The premium over-ear headphone rotates smoothly a full 360 degrees on an invisible turntable, "
 "spinning steadily around its vertical axis at a constant speed and returning to the exact same starting "
 "angle, one continuous seamless loop. The studio lighting, soft contact shadow and soft warm-grey gradient "
 "background stay perfectly constant and unchanged; the headphone stays floating and centred, no bounce, no "
 "drift, only a clean steady rotation. High-end studio product render, crisp detail. No text, no logo.")

async def main() -> int:
    from gflow_cli._cli_helpers import _resolve_profile
    from gflow_cli.auth import profile_dir as pdir
    from gflow_cli.api.client import FlowApiClient
    from gflow_cli.api.video import Aspect, GenerateVideoRequest, Mode, VideoModel
    prof=pdir(_resolve_profile(None))
    req=GenerateVideoRequest(prompt=PROMPT, mode=Mode.I2V, aspect=Aspect.LANDSCAPE,
        model=VideoModel.from_cli("veo-quality"), duration=8,
        start_image=MASTER, end_image=MASTER)   # A->A loop closure
    dest=OUT/"orbit.mp4"
    try:
        async with FlowApiClient(profile_dir=prof, out_dir=OUT) as c:
            res=await c.generate_video(req=req, out_dir=OUT, download=False)
        mid=res.status.media_id
        async with FlowApiClient(profile_dir=prof, out_dir=OUT) as c:
            await c.download_video(mid, dest)
    except Exception as e:
        print(json.dumps({"ok":False,"error":str(e)})); return 1
    if not dest.exists() or dest.stat().st_size==0:
        print(json.dumps({"ok":False,"error":"no mp4","media_id":mid})); return 1
    print(json.dumps({"ok":True,"media_id":mid,"mp4":str(dest),"bytes":dest.stat().st_size}))
    return 0

if __name__=="__main__":
    sys.exit(asyncio.run(main()))
