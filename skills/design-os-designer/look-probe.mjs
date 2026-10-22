// look-probe.mjs — the one function look.mjs runs INSIDE the page (via page.evaluate), so it must stay
// self-contained: no imports, no outer variables. It makes the page show everything it would show a reader,
// in a fixed deterministic sequence, then measures L1, L2, L4 and L5.
//   1. images marked loading="lazy" are switched to eager;
//   2. the page height is read ONCE, then the page is scrolled to that height in fixed viewport-height
//      steps (instant, never animated; at most 60 steps) with a fixed 60 ms pause, then back to the top;
//   3. every image still loading is awaited (at most 4 s in total).
// A page that kept growing while scrolled, or is taller than the step cap, was not fully visited: that is
// reported in `scroll` ("growing" / "capped"), never treated as checked. An image still incomplete after
// the wait is `pending`: unknown, never counted as fine.
export async function probePage() {
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  const jump = (top) => window.scrollTo({ top, behavior: "instant" });
  for (const img of document.querySelectorAll("img[loading]")) img.loading = "eager";
  const root = document.documentElement;
  const step = Math.max(window.innerHeight, 200);
  const maxSteps = 60;
  const startHeight = root.scrollHeight;
  const end = Math.min(startHeight, step * maxSteps);
  for (let y = 0; y < end; y += step) {
    jump(y);
    await pause(60);
  }
  jump(0);
  const scroll = startHeight > end ? { state: "capped", from: startHeight, to: root.scrollHeight }
    : root.scrollHeight - startHeight > step ? { state: "growing", from: startHeight, to: root.scrollHeight }
    : { state: "ok", from: startHeight, to: root.scrollHeight };
  const sourced = () => [...document.images].filter((img) => img.getAttribute("src") || img.currentSrc);
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && sourced().some((img) => !img.complete)) await pause(50);

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };
  const targets = [...document.querySelectorAll("a[href], button, select, textarea, summary, [role='button'], input:not([type='hidden'])")]
    .filter((el) => !el.disabled && visible(el) && getComputedStyle(el).display !== "inline");
  let smallest = null;
  for (const el of targets) {
    const r = el.getBoundingClientRect();
    const size = Math.min(r.width, r.height);
    if (smallest === null || size < smallest.size) smallest = { size: Math.round(size * 10) / 10, name: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") };
  }
  const images = sourced();
  return {
    scrollWidth: root.scrollWidth,
    clientWidth: root.clientWidth,
    height: root.scrollHeight,
    scroll,
    smallest,
    targetCount: targets.length,
    brokenImages: images.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.getAttribute("src")),
    pendingImages: images.filter((img) => !img.complete).map((img) => img.getAttribute("src")),
    textLength: (document.body ? document.body.innerText : "").trim().length,
    visualCount: document.querySelectorAll("img, svg, canvas, video").length,
  };
}
