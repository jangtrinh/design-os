#!/usr/bin/env python3
"""Clean dark orbit, keyframe-anchored K01 -> K03 (both crisp dark Ink Chamber stills).
A pure camera move between two assembled-product endpoints = veo's strength; anchoring BOTH ends
to the dark Codex stills keeps the look dark (no softbox drift) and hands off exactly to K03 so the
stills-morph explode continues seamlessly. Download-decoupled (submit -> collect by media_id)."""
from __future__ import annotations
import asyncio, json, sys
from pathlib import Path

W=Path("/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice")
K01=W/"refs/K01-169.png"; K03=W/"refs/K03-169.png"
OUT=W/"source"; OUT.mkdir(parents=True, exist_ok=True)
PROMPT=("Slow cinematic camera orbit around a floating premium over-ear headphone in a pitch-black "
 "studio. The camera starts at a low near-profile and orbits smoothly about forty degrees toward a "
 "three-quarter front view of the front earcup, rising slightly to earcup level and pushing in a little. "
 "The INK-black background stays pure black with only a soft dim pool of light behind the product and a "
 "cold blade rim light from back-left carving the metal edges. Deeply crushed blacks, high contrast, "
 "85mm telephoto compression, premium cinematic product film. The headphone stays whole, assembled, "
 "floating, no floor, no bounce. NO bright softbox, NO white background, NO text, NO logo.")

async def main() -> int:
    from gflow_cli._cli_helpers import _resolve_profile
    from gflow_cli.auth import profile_dir as pdir
    from gflow_cli.api.client import FlowApiClient
    from gflow_cli.api.video import Aspect, GenerateVideoRequest, Mode, VideoModel
    prof=pdir(_resolve_profile(None))
    req=GenerateVideoRequest(prompt=PROMPT, mode=Mode.I2V, aspect=Aspect.LANDSCAPE,
        model=VideoModel.from_cli("veo-quality"), duration=6,
        start_image=K01, end_image=K03)
    dest=OUT/"orbit-anchored.mp4"
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
