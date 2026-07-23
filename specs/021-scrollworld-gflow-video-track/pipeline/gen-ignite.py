#!/usr/bin/env python3
"""Ignition & Rise finale (Fable's BOOMING-ENDING-DIRECTION §2) — replaces leg3.
Architecture A: start_image = seed2 (leg2's real last frame). NO end-frame. + the §9 HYBRID
test: reference_images=(st1 master aerial,) alongside start_image to hold art-direction on the
aerial re-synthesis. Falls back to pure i2v if the transport rejects the combo. Download-decoupled.
"""
from __future__ import annotations
import asyncio, json, subprocess, sys
from pathlib import Path

WORK=Path("/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track")
START=WORK/"clips-A/seed2.png"          # leg2's actual last frame (current leg3's seed)
REF=WORK/"stills-v2/st1-169.png"        # master wide-aerial (hybrid style anchor for the rise)
OUT=WORK/"clips-A"; OUT.mkdir(exist_ok=True)
PROMPT=("Single continuous cinematic camera move, no cuts. Continue the same slow, steady forward "
 "glide toward the glowing SoDeal shopfront. Then the camera smoothly accelerates into a faster hero "
 "push-in, the red SoDeal sign growing until it dominates the frame, a big red percent-symbol deal tag "
 "swinging beside the open door. As the camera arrives, the world ignites: every lantern and every red "
 "percent deal tag along the street flares to life in a wave of warm red-gold glow spreading outward from "
 "the shop. The camera then sweeps smoothly up and backward in one rising crane arc, climbing above the "
 "tiled rooftops to reveal the whole miniature market town at deepening golden dusk, the turquoise canal "
 "winding through streets strung with glowing lanterns and red percent deal tags, the SoDeal shop shining "
 "brightest at the centre. In the final seconds, ease into a gentle floating rest on this wide aerial view. "
 "Soft matte clay diorama, tilt-shift miniature, warm golden-hour light deepening to dusk, cohesive Hoi An "
 "palette of SoDeal red, saffron, terracotta, cream, turquoise canal. Smooth, graceful, subtle parallax. "
 "No text, no captions.")

async def main() -> int:
    from gflow_cli._cli_helpers import _resolve_profile
    from gflow_cli.auth import profile_dir as pdir
    from gflow_cli.api.client import FlowApiClient
    from gflow_cli.api.video import Aspect, GenerateVideoRequest, Mode, VideoModel
    prof=pdir(_resolve_profile(None))
    model=VideoModel.from_cli("veo-fast")

    def build(with_ref: bool):
        kw=dict(prompt=PROMPT, mode=Mode.I2V, aspect=Aspect.LANDSCAPE, model=model,
                duration=8, start_image=START)
        if with_ref: kw["reference_images"]=(REF,)
        return GenerateVideoRequest(**kw)

    used_ref=True
    try:
        req=build(True)
    except Exception as e:
        print(json.dumps({"note":"DTO rejected start+ref combo, falling back to pure i2v","err":str(e)})); used_ref=False; req=build(False)

    async def run(req):
        async with FlowApiClient(profile_dir=prof, out_dir=OUT) as c:
            res=await c.generate_video(req=req, out_dir=OUT, download=False)
        mid=res.status.media_id
        dest=OUT/"leg3.mp4"
        async with FlowApiClient(profile_dir=prof, out_dir=OUT) as c:
            await c.download_video(mid, dest)
        return mid, dest

    try:
        mid,dest=await run(req)
    except Exception as e:
        if used_ref:  # transport (not DTO) rejected the combo → retry pure i2v
            print(json.dumps({"note":"transport rejected ref combo, retrying pure i2v","err":str(e)})); used_ref=False
            mid,dest=await run(build(False))
        else:
            print(json.dumps({"ok":False,"error":str(e)})); return 1
    if not dest.exists() or dest.stat().st_size==0:
        print(json.dumps({"ok":False,"error":"no mp4","media_id":mid})); return 1
    subprocess.run(["ffmpeg","-y","-loglevel","error","-sseof","-0.08","-i",str(dest),
                    "-frames:v","1","-update","1",str(OUT/"seed3.png")],check=True)
    print(json.dumps({"ok":True,"used_reference":used_ref,"media_id":mid,"mp4":str(dest),"bytes":dest.stat().st_size}))
    return 0

if __name__=="__main__":
    sys.exit(asyncio.run(main()))
