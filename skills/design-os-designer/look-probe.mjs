// look-probe.mjs — the one function look.mjs runs INSIDE the page (via page.evaluate), so it must stay
// self-contained: no imports, no outer variables. It makes the page show everything it would show a reader,
// in a fixed deterministic sequence, then measures L1, L2, L4 and L5.
//   1. images marked loading="lazy" are switched to eager, and every image still loading is awaited
//      (at most 4 s per wait);
//   2. the page height h0 is read, then the page is scrolled to h0 in fixed viewport-height steps (instant,
//      never animated; at most 60 steps) with a fixed 60 ms pause, and the images are awaited again;
//   3. height h1 is read. If it grew by more than one step, ONE more pass runs to h1 and h2 is read.
// `scroll` is "capped" when h0 is taller than the step cap, "growing" when the page still grew by more than
// a step on the second pass (an endless feed), else "ok". A finite lazy loader converges on the second pass.
// Capped and growing pages were not fully visited: reported, never treated as checked. An image still
// incomplete after the waits is `pending`: unknown, never counted as fine.
export async function probePage() {
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  const root = document.documentElement;
  const step = Math.max(window.innerHeight, 200);
  const maxSteps = 60;
  const sourced = () => [...document.images].filter((img) => img.getAttribute("src") || img.currentSrc);
  const settle = async () => {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && sourced().some((img) => !img.complete)) await pause(50);
  };
  const visit = async (to) => {
    for (let y = 0; y < Math.min(to, step * maxSteps); y += step) {
      window.scrollTo({ top: y, behavior: "instant" });
      await pause(60);
    }
    await settle();
    return root.scrollHeight;
  };
  for (const img of document.querySelectorAll("img[loading]")) img.loading = "eager";
  await settle();
  const h0 = root.scrollHeight;
  const h1 = await visit(h0);
  const h2 = h1 - h0 > step ? await visit(h1) : h1;
  window.scrollTo({ top: 0, behavior: "instant" });
  const scroll = h0 > step * maxSteps ? { state: "capped", from: h0, to: h2 }
    : h2 - h1 > step ? { state: "growing", from: h0, to: h2 }
    : { state: "ok", from: h0, to: h2 };

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
