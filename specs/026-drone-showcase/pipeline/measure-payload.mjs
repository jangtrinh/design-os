// "Nặng" phải thành số. Đo: byte tới first paint, byte để cuộn hết trang,
// thời gian tới frame đầu của từng cảnh, và phân bổ theo loại tài nguyên.
// Có tuỳ chọn bóp băng thông để thấy đúng cái người dùng 4G thấy.
const ROOT = '/Users/jang/orca/workspaces/ease-design/opah/';
const { chromium } = (await import(ROOT + 'node_modules/playwright/index.js')).default;
const EXE = process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1228/chrome-mac-arm64/' +
  'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const BASE = process.env.BASE || 'http://127.0.0.1:4312';

// Fast 4G theo Lighthouse: 1.6 Mbps xuống, RTT 150ms
const THROTTLE = process.env.THROTTLE === '1';

function kb(n) { return (n / 1024).toFixed(0) + ' KB'; }

const b = await chromium.launch({ executablePath: EXE });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const p = await ctx.newPage();

const bytes = { total: 0, byType: {}, byScene: {} };
p.on('response', async (r) => {
  let len = 0;
  try { len = (await r.body()).length; } catch { return; }
  const u = r.url();
  const ext = (u.split('?')[0].split('.').pop() || '?').slice(0, 5);
  bytes.total += len;
  bytes.byType[ext] = (bytes.byType[ext] || 0) + len;
  const m = u.match(/assets\/([a-z-]+)\//);
  if (m) bytes.byScene[m[1]] = (bytes.byScene[m[1]] || 0) + len;
});

if (THROTTLE) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8, latency: 150,
  });
}

const t0 = Date.now();
await p.goto(BASE + '/', { waitUntil: 'load' });
const tLoad = Date.now() - t0;
const atLoad = bytes.total;

// chờ cảnh hero vẽ xong frame đầu
const tPaint = await p.evaluate(async () => {
  const s = performance.now();
  const el = document.querySelector('[data-scrub="hero"]');
  for (let i = 0; i < 600 && !el.classList.contains('is-painted'); i++) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  return Math.round(performance.now() - s);
});
const afterHero = bytes.total;

// cuộn hết trang, từng bước, như người dùng thật
const steps = 40;
for (let i = 1; i <= steps; i++) {
  await p.evaluate((f) => {
    const de = document.documentElement;
    window.scrollTo({ top: (de.scrollHeight - de.clientHeight) * f, behavior: 'instant' });
  }, i / steps);
  await p.waitForTimeout(220);
}
const full = bytes.total;

console.log(`${THROTTLE ? 'Fast 4G (1.6Mbps/150ms RTT)' : 'mạng không bóp'} · 390x844`);
console.log(`  tới sự kiện load        : ${kb(atLoad)}   (${tLoad} ms)`);
console.log(`  tới frame hero đầu tiên : ${kb(afterHero)}   (+${tPaint} ms sau load)`);
console.log(`  cuộn hết trang          : ${kb(full)}`);
console.log('  theo loại  : ' + Object.entries(bytes.byType).sort((a, c) => c[1] - a[1])
  .map(([k, v]) => `${k} ${kb(v)}`).join(' · '));
console.log('  theo cảnh  : ' + Object.entries(bytes.byScene).sort((a, c) => c[1] - a[1])
  .map(([k, v]) => `${k} ${kb(v)}`).join(' · '));
await b.close();
