#!/usr/bin/env python3
import asyncio, http.server, socketserver, threading, functools
from pathlib import Path
ROOT=Path("/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice/site")
PORT=8798
def serve():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    with socketserver.TCPServer(("127.0.0.1",PORT),h) as httpd: httpd.serve_forever()
threading.Thread(target=serve,daemon=True).start()

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={"width":1440,"height":900})
        pg=await ctx.new_page()
        errs=[]; pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        pg.on("requestfailed", lambda r: errs.append("REQFAIL "+r.url.split('/')[-1]))
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html"); await pg.wait_for_timeout(2500)
        H=await pg.evaluate("document.body.scrollHeight-innerHeight")
        # scroll to each of 6 beats at a REALISTIC quick pace, then report has-clip + canvas-blank per scene
        for frac in [0.08,0.24,0.42,0.60,0.78,0.94]:
            await pg.evaluate(f"window.scrollTo(0,{int(H*frac)})"); await pg.wait_for_timeout(700)
        rep=await pg.evaluate("""()=>{
          return [...document.querySelectorAll('.sw-scene')].map((s,i)=>{
            const c=s.querySelector('canvas'); let blank=null;
            if(c){const x=c.getContext('2d'); try{const d=x.getImageData(c.width>>1,c.height>>1,1,1).data; blank=(d[0]+d[1]+d[2])<6;}catch(e){blank='err';}}
            return {i, hasClip:s.classList.contains('has-clip'), hasCanvas:!!c, centerBlank:blank};
          });
        }""")
        print("SECTIONS:")
        for r in rep: print(" ", r)
        print("ERRORS:", errs[:8])
        await b.close()
asyncio.run(main())
