// look-probe.mjs — the one function look.mjs runs INSIDE the page (via page.evaluate), so it must stay
// self-contained: no imports, no outer variables. It makes the page show everything it would show a reader,
// in a fixed deterministic sequence, then measures L1, L2, L4 and L5.
//   1. images marked loading="lazy" are switched to eager;
//   2. the page is scrolled from top to bottom in fixed viewport-height steps with a fixed 60 ms pause, then back to top;
//   3. every image still loading is awaited (at most 4 s in total).
// An image that is still incomplete after that is reported as `pending`: unknown, never counted as fine.
export async function probePage() {
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  for (const img of document.querySelectorAll("img[loading]")) img.loading = "eager";
  const root = document.documentElement;
  const step = Math.max(window.innerHeight, 200);
  for (let y = 0; y < root.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await pause(60);
  }
  window.scrollTo(0, 0);
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
    smallest,
    targetCount: targets.length,
    brokenImages: images.filter((img) => img.complete && img.naturalWidth === 0).map((img) => img.getAttribute("src")),
    pendingImages: images.filter((img) => !img.complete).map((img) => img.getAttribute("src")),
    textLength: (document.body ? document.body.innerText : "").trim().length,
    visualCount: document.querySelectorAll("img, svg, canvas, video").length,
  };
}
