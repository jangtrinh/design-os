import { chromium } from "playwright";
import { mkdir, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const cases = [
  { name: "design-os-promotion", viewport: { width: 1440, height: 900 }, action: recordPromotion },
  { name: "nutrition-native-mobile", viewport: { width: 1440, height: 900 }, action: recordNutrition },
];
const browser = await chromium.launch({ channel: "chrome", headless: true });

for (const item of cases) {
  const directory = resolve(root, "runs", item.name, "demo");
  const temporary = resolve(directory, "raw");
  await mkdir(temporary, { recursive: true });
  const context = await browser.newContext({
    viewport: item.viewport,
    recordVideo: { dir: temporary, size: item.viewport },
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(pathToFileURL(resolve(root, "runs", item.name, "index.html")).href, { waitUntil: "domcontentloaded" });
  await page.locator("main").waitFor({ state: "visible" });
  await page.waitForTimeout(1500);
  await item.action(page);
  const video = page.video();
  await context.close();
  await rename(await video.path(), resolve(directory, `${item.name}.webm`));
}

await browser.close();

async function scrollPage(page, stops, duration = 950) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (const stop of stops) {
    await page.evaluate(({ top, time }) => new Promise((done) => {
      const start = scrollY;
      const began = performance.now();
      const frame = (now) => {
        const progress = Math.min((now - began) / time, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        scrollTo(0, start + (top - start) * eased);
        progress < 1 ? requestAnimationFrame(frame) : done();
      };
      requestAnimationFrame(frame);
    }), { top: height * stop, time: duration });
    await page.waitForTimeout(350);
  }
}

async function recordPromotion(page) {
  await page.locator("#compile").click();
  await page.waitForTimeout(900);
  await scrollPage(page, [0.13, 0.28, 0.44, 0.62, 0.78, 1]);
}

async function recordNutrition(page) {
  await page.waitForTimeout(700);
  await page.locator("#shutter").click();
  await page.waitForTimeout(2200);
}
