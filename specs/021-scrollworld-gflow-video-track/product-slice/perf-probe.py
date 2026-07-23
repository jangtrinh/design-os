#!/usr/bin/env python3
import asyncio, http.server, socketserver, threading, functools
from pathlib import Path
ROOT=Path("/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice/site")
PORT=8796
def serve():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    with socketserver.TCPServer(("127.0.0.1",PORT),h) as httpd: httpd.serve_forever()
threading.Thread(target=serve,daemon=True).start()

# scroll top->bottom over ~6s while sampling rAF frame intervals -> FPS + long-frame count
MEASURE="""async () => {
  const H=document.body.scrollHeight-innerHeight; let ivs=[], last=performance.now(), running=true;
  function tick(now){ ivs.push(now-last); last=now; if(running) requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  const t0=performance.now(); await new Promise(res=>{
    (function f(now){ const p=Math.min(1,(now-t0)/6000); window.scrollTo(0,H*p); p<1?requestAnimationFrame(f):res(); })(t0);
  });
  running=false; ivs=ivs.slice(3);
  const avg=ivs.reduce((a,b)=>a+b,0)/ivs.length;
  const long=ivs.filter(x=>x>32).length;   // frames slower than ~30fps
  const worst=Math.max(...ivs);
  return {fps:+(1000/avg).toFixed(1), longFrames:long, total:ivs.length, worstMs:+worst.toFixed(1)};
}"""

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b=await p.chromium.launch()
        ctx=await b.new_context(viewport={"width":1440,"height":900}, device_scale_factor=2)
        pg=await ctx.new_page()
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html"); await pg.wait_for_timeout(2500)
        # prewarm frame cache so decode isn't the confound in run 1
        await pg.evaluate("async()=>{const H=document.body.scrollHeight-innerHeight;for(let y=0;y<=H;y+=H/30){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,40));}window.scrollTo(0,0);}")
        await pg.wait_for_timeout(600)
        on=await pg.evaluate(MEASURE)
        print("STARS ON :", on)
        await pg.evaluate("()=>{document.getElementById('stars').style.display='none';}")
        await pg.wait_for_timeout(400)
        off=await pg.evaluate(MEASURE)
        print("STARS OFF:", off)
        await pg.evaluate("()=>{document.querySelectorAll('*').forEach(e=>{e.style.backdropFilter='none';e.style.webkitBackdropFilter='none';});}")
        await pg.wait_for_timeout(400)
        nobf=await pg.evaluate(MEASURE)
        print("NO BACKDROP+NO STARS:", nobf)
        await b.close()
asyncio.run(main())
