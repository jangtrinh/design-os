// look-shots.mjs — one rendered shot per width for look.mjs: offline context, probe, screenshot, and the
// numbered item lines. Every shot runs under a deadline; a page that never settles becomes an UNVERIFIED
// item (look.mjs then closes the browser), never an endless wait.
import { probePage } from "./look-probe.mjs";

export const DEFAULT_DEADLINE_MS = 45000;
const TIMED_OUT = Symbol("timed out");

/** `siteHref` (the evidence site folder as a file URL ending in "/") lets a missing file be named relative to the page. */
export async function shoot(browser, url, width, deadlineMs = DEFAULT_DEADLINE_MS, siteHref = new URL(".", url).href) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const problems = [];
  await context.route("**/*", (route) => {
    const target = route.request().url();
    if (target.startsWith("file:") || target.startsWith("data:") || target.startsWith("blob:") || target === "about:blank") return route.continue();
    problems.push(`blocked request ${target}`);
    return route.abort();
  });
  // Every WebSocket is closed before it reaches a server; a Playwright without this API cannot prove L3.
  const socketsBlocked = typeof context.routeWebSocket === "function";
  if (socketsBlocked) {
    await context.routeWebSocket(/.*/, (socket) => {
      problems.push(`blocked websocket ${socket.url()}`);
      socket.close();
    });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(deadlineMs);
  // A local file the browser asked for and did not find, named as the page wrote it (template, shadow DOM and script loads included).
  page.on("requestfailed", (request) => {
    const asked = request.url();
    if (asked.startsWith("file:") && String(request.failure()?.errorText).includes("ERR_FILE_NOT_FOUND")) {
      const clean = asked.split(/[?#]/)[0];
      const shown = clean.startsWith(siteHref) ? clean.slice(siteHref.length) : clean;
      let name;
      try {
        name = decodeURIComponent(shown);
      } catch {
        name = shown; // a malformed percent escape in the file name: report the name as the browser asked for it
      }
      problems.push(`missing file ${name}`);
    }
  });
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console error: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  const work = (async () => {
    await page.goto(url, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const probe = await page.evaluate(probePage);
    const png = await page.screenshot({ fullPage: true });
    return { width, probe, problems, png, socketsBlocked };
  })();
  work.catch(() => {}); // a late failure after the deadline must not crash the run
  let timer;
  const deadline = new Promise((done) => { timer = setTimeout(() => done(TIMED_OUT), deadlineMs); });
  const settled = await Promise.race([work, deadline]);
  clearTimeout(timer);
  if (settled === TIMED_OUT) return { width, hung: true, deadlineMs, problems, socketsBlocked };
  await context.close();
  return settled;
}

export function itemLines({ width, probe, problems, socketsBlocked, hung, deadlineMs }) {
  const w = `@${width}`;
  if (hung) return [[true, `L1-L5 ${w}: UNVERIFIED — the page did not finish within ${deadlineMs} ms (a script may be looping)`, "make the page settle, or raise --deadline"]];
  const items = [];
  const over = probe.scrollWidth > probe.clientWidth;
  items.push([over, `L1 page-overflow ${w}: scrollWidth ${probe.scrollWidth} ${over ? ">" : "<="} clientWidth ${probe.clientWidth}`, "find the element wider than the viewport"]);
  const small = probe.smallest !== null && probe.smallest.size < 24;
  items.push([small, `L2 target-size ${w}: smallest of ${probe.targetCount} targets ${probe.smallest ? `${probe.smallest.size}px (${probe.smallest.name})` : "none"}, floor 24px`, "enlarge the target or its padding"]);
  const unverifiedSockets = socketsBlocked ? "" : " — UNVERIFIED: this Playwright cannot block WebSockets";
  items.push([problems.length > 0 || !socketsBlocked, `L3 console-and-network ${w}: ${problems.length} problem(s)${problems.length ? " — " + problems.slice(0, 3).join("; ") : ""}${unverifiedSockets}`, socketsBlocked ? "fix the script error or bundle the asset" : "update Playwright and run look again"]);
  const pending = probe.pendingImages.length > 0 ? `, ${probe.pendingImages.length} still loading after the full scroll — UNVERIFIED: ${probe.pendingImages.slice(0, 3).join(", ")}` : "";
  const { state, from, to } = probe.scroll;
  const scrolled = state === "growing" ? ` — UNVERIFIED: page kept growing while scrolled (${from}px to ${to}px), so images below were not all checked`
    : state === "capped" ? ` — UNVERIFIED: page is taller than the 60-step scroll cap (${from}px), so images below were not all checked` : "";
  items.push([probe.brokenImages.length > 0 || probe.pendingImages.length > 0 || state !== "ok", `L4 broken-images ${w}: ${probe.brokenImages.length} broken${probe.brokenImages.length ? " — " + probe.brokenImages.slice(0, 3).join(", ") : ""}${pending}${scrolled}`, "fix the image path, or make the image load and the page stop growing"]);
  const blank = probe.textLength === 0 && probe.visualCount === 0;
  items.push([blank, `L5 blank-page ${w}: ${probe.textLength} characters of text, ${probe.visualCount} visual element(s)`, "the page rendered empty"]);
  return items;
}
