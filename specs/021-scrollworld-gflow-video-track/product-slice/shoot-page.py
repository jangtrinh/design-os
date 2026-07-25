#!/usr/bin/env python3
"""Serve site/ and screenshot the scrub page at N scroll depths to verify the 3 beats render."""
import asyncio, http.server, socketserver, threading, functools, sys
from pathlib import Path
ROOT=Path("/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice/site")
PORT=8791
def serve():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    with socketserver.TCPServer(("127.0.0.1",PORT),h) as httpd: httpd.serve_forever()
threading.Thread(target=serve,daemon=True).start()

async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={"width":1440,"height":900},device_scale_factor=2)
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html")
        await pg.wait_for_timeout(2500)
        total=await pg.evaluate("document.body.scrollHeight - window.innerHeight")
        for i,frac in enumerate([0.06,0.22,0.40,0.58,0.74,0.92]):
            await pg.evaluate(f"window.scrollTo(0,{int(total*frac)})")
            await pg.wait_for_timeout(1400)
            await pg.screenshot(path=f"/Users/jang/Products/ease-design/specs/021-scrollworld-gflow-video-track/product-slice/source/_page_{i}.png")
        errs=await pg.evaluate("window.__err||''")
        print("scrollHeight",total,"errs:",errs)
        await b.close()
asyncio.run(main())
