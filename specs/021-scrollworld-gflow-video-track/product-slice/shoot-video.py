#!/usr/bin/env python3
"""Record a LinkedIn interaction video of the scrub page: playwright records the context while an
eased scroll choreography walks the 3 beats. A fast pre-warm pass loads every frame into cache first
(no blank flashes); we trim that lead-in afterwards with ffmpeg."""
import asyncio, http.server, socketserver, threading, functools
from pathlib import Path
ROOT=Path("/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice/site")
OUT=Path("/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice/source/rec")
PORT=8794
def serve():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    with socketserver.TCPServer(("127.0.0.1",PORT),h) as httpd: httpd.serve_forever()
threading.Thread(target=serve,daemon=True).start()

CHOREO="""async () => {
  const H = document.body.scrollHeight - innerHeight;
  const ease = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
  const to = (a,b,dur) => new Promise(res=>{const t0=performance.now();
    (function f(now){const p=Math.min(1,(now-t0)/dur); window.scrollTo(0,a+(b-a)*ease(p)); p<1?requestAnimationFrame(f):res();})(t0);});
  const hold = ms => new Promise(r=>setTimeout(r,ms));
  const stops=[0,0.20,0.36,0.52,0.70,0.84,1.0];
  window.scrollTo(0,0); await hold(1400);
  for(let i=0;i<stops.length-1;i++){ await to(H*stops[i], H*stops[i+1], 3200); await hold(1200); }
  await hold(700);
}"""
PREWARM="""async () => {
  const H = document.body.scrollHeight - innerHeight;
  const step=(y)=>new Promise(r=>{window.scrollTo(0,y);setTimeout(r,110);});
  for(let y=0;y<=H;y+=H/60) await step(y);   // down slow enough for HQ to load+cache each beat
  for(let y=H;y>=0;y-=H/60) await step(y);    // and back to top
  window.scrollTo(0,0); await new Promise(r=>setTimeout(r,1200));  // settle: HQ frame 0 sharp
}"""

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={"width":1280,"height":720}, device_scale_factor=1,
                                record_video_dir=str(OUT), record_video_size={"width":1280,"height":720})
        pg=await ctx.new_page()
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        await pg.wait_for_timeout(2000)
        await pg.evaluate(PREWARM)          # cache all frames
        await pg.wait_for_timeout(500)
        await pg.evaluate(CHOREO)            # the recorded walk-through
        await pg.wait_for_timeout(300)
        path=await pg.video.path()
        await ctx.close(); await b.close()
        print("VIDEO", path)

asyncio.run(main())
