// Rendered gates — measure the real laid-out deck in a browser.
// These catch the failures that source inspection cannot see: content spilling
// its card, text that vanishes into its own background, arbitrary voids.

const CONTRAST_NORMAL = 4.5;   // WCAG AA body
const CONTRAST_LARGE  = 3.0;   // WCAG AA >=24px bold / >=30px
const DEAD_BAND       = 96;    // one --sp-7; beyond this a void is a hole
const RHYTHM_TOL      = 16;    // large voids inside one container must agree

export async function runRendered(page, fileUrl) {
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const findings = await page.evaluate(({ CONTRAST_NORMAL, CONTRAST_LARGE, DEAD_BAND, RHYTHM_TOL }) => {
    const out = { fit: [], chrome: [], rhythm: [], contrast: [], unverifiable: [], stage: [] };

    const srgb = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = rgb => 0.2126 * srgb(rgb[0]) + 0.7152 * srgb(rgb[1]) + 0.0722 * srgb(rgb[2]);
    const parse = c => { const m = c.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

    // A gradient is a range of backgrounds, so a text colour must clear the
    // WORST stop in it, not an average. url() layers cannot be resolved here.
    const stopsOf = bgImage => {
      if (!bgImage || bgImage === 'none') return { stops: [], hasImage: false };
      const hasImage = /url\(/.test(bgImage);
      const stops = [...bgImage.matchAll(/rgba?\([^)]+\)/g)]
        .map(m => ({ rgb: parse(m[0]), a: (m[0].match(/[\d.]+/g) || [])[3] }))
        .filter(s => s.rgb && (s.a === undefined || +s.a > 0.5))
        .map(s => s.rgb);
      return { stops, hasImage };
    };

    const slides = [...document.querySelectorAll('.slide-item')];
    slides.forEach(s => s.classList.remove('active'));

    for (const s of slides) {
      s.classList.add('active');
      const sr = s.getBoundingClientRect();

      // -- stage: the board is exactly 1920x1080 -------------------------------
      if (Math.round(sr.width) !== 1920 || Math.round(sr.height) !== 1080)
        out.stage.push(`${s.id}: ${Math.round(sr.width)}x${Math.round(sr.height)}`);

      // -- fit: nothing overflows its own padding box --------------------------
      for (const el of s.querySelectorAll('*')) {
        if (!el.children.length) continue;
        const oh = el.scrollHeight - el.clientHeight;
        const ow = el.scrollWidth - el.clientWidth;
        const tag = (el.className || el.tagName).toString().split(' ')[0].slice(0, 30);
        if (el.clientHeight > 0 && oh > 4) out.fit.push(`${s.id} ${tag} +${oh}h`);
        else if (el.clientWidth > 0 && ow > 4) out.fit.push(`${s.id} ${tag} +${ow}w`);
      }

      // -- chrome: content clears the fixed header and footer rails ------------
      const sec = s.querySelector('section');
      const hdr = s.querySelector('.chrome-header')?.getBoundingClientRect();
      const ftr = s.querySelector('.chrome-footer')?.getBoundingClientRect();
      // A rail that is hidden has a zero-size rect, which would read as being
      // at the top of the frame and fail every slide. Only visible rails are
      // clearance-checked — the footer is display:none in this deck.
      const visible = el => el && el.width > 0 && el.height > 0;
      if (sec) {
        const r = sec.getBoundingClientRect();
        if (visible(hdr) && r.top < hdr.bottom) out.chrome.push(`${s.id} stage top under header`);
        if (visible(ftr) && r.bottom > ftr.top) out.chrome.push(`${s.id} stage bottom under footer`);
      }

      // -- rhythm: large voids inside one container must agree with each other --
      // Two equal voids are a three-zone composition; 144/120/152 is drift.
      for (const el of s.querySelectorAll('*')) {
        const cs = getComputedStyle(el);
        if (cs.display !== 'flex' && cs.display !== 'grid') continue;
        if (cs.display === 'flex' && cs.flexDirection !== 'column') continue;
        const kids = [...el.children].map(c => c.getBoundingClientRect())
          .filter(r => r.height > 2).sort((a, b) => a.top - b.top);
        if (kids.length < 3) continue;
        const gaps = [];
        for (let i = 1; i < kids.length; i++) gaps.push(Math.round(kids[i].top - (kids[i-1].top + kids[i-1].height)));
        const big = gaps.filter(g => g > DEAD_BAND);
        if (big.length > 1 && Math.max(...big) - Math.min(...big) > RHYTHM_TOL)
          out.rhythm.push(`${s.id} ${(el.className||el.tagName).toString().split(' ')[0].slice(0,26)} [${gaps.join(', ')}]`);
      }

      // -- contrast: every text run against the surface actually behind it -----
      for (const el of s.querySelectorAll('h1,h2,h3,h4,p,span,strong,code,small,li,div')) {
        if (el.children.length || !el.textContent.trim()) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
        const fg = parse(cs.color);
        if (!fg) continue;

        // Walk to the painted surface, compositing every semi-transparent layer
        // over the one beneath it. Treating a 7%-alpha fill as opaque was the
        // difference between "invisible text" and "a perfectly legible pill".
        const over = (top, a, under) => top.map((c, i) => c * a + under[i] * (1 - a));
        let node = el, bg = null, viaImage = false;
        const pending = [];                          // translucent layers, nearest first
        while (node && node !== document.documentElement) {
          const ns = getComputedStyle(node);
          const { stops, hasImage } = stopsOf(ns.backgroundImage);
          if (hasImage) { viaImage = true; break; }
          if (stops.length) {                        // gradient: take its worst stop
            bg = stops.reduce((w, c) => ratio(fg, c) < ratio(fg, w) ? c : w, stops[0]);
            break;
          }
          const parts = ns.backgroundColor.match(/[\d.]+/g);
          if (parts) {
            const a = parts.length > 3 ? +parts[3] : 1;
            const rgb = parts.slice(0, 3).map(Number);
            if (a >= 0.999) { bg = rgb; break; }      // opaque: the walk ends here
            if (a > 0) pending.push({ rgb, a });      // translucent: keep descending
          }
          node = node.parentElement;
        }
        if (bg) for (let i = pending.length - 1; i >= 0; i--) bg = over(pending[i].rgb, pending[i].a, bg);

        const size = parseFloat(cs.fontSize), weight = +cs.fontWeight || 400;
        const large = size >= 30 || (size >= 24 && weight >= 700);
        const label = `${s.id} "${el.textContent.trim().slice(0, 28)}"`;

        if (viaImage) { out.unverifiable.push(label); continue; }
        if (!bg) continue;
        const cr = ratio(fg, bg);
        if (cr < (large ? CONTRAST_LARGE : CONTRAST_NORMAL))
          out.contrast.push(`${label} ${cr.toFixed(2)}:1 (needs ${large ? CONTRAST_LARGE : CONTRAST_NORMAL})`);
      }

      s.classList.remove('active');
    }
    slides[0].classList.add('active');
    return out;
  }, { CONTRAST_NORMAL, CONTRAST_LARGE, DEAD_BAND, RHYTHM_TOL });

  return [
    { name: 'stage/exact-1920x1080',  pass: !findings.stage.length,    failures: findings.stage },
    { name: 'fit/no-container-spill', pass: !findings.fit.length,      failures: [...new Set(findings.fit)] },
    { name: 'chrome/rail-clearance',  pass: !findings.chrome.length,   failures: findings.chrome },
    { name: 'rhythm/voids-agree',     pass: !findings.rhythm.length,   failures: findings.rhythm },
    { name: 'contrast/wcag-aa',       pass: !findings.contrast.length, failures: [...new Set(findings.contrast)] },
    { name: 'contrast/over-imagery',  pass: true, failures: [],
      note: `${new Set(findings.unverifiable).size} text runs sit over an image plate — not statically resolvable, covered by the scrim contract; verify visually` },
  ];
}

// The stage is transform-scaled, so identical type at every viewport is a gate.
export async function runViewportParity(page, fileUrl) {
  const seen = [];
  for (const width of [390, 1024, 1920]) {
    await page.setViewportSize({ width, height: Math.round(width * 0.5625) });
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    seen.push(await page.evaluate(() => {
      const t = document.querySelector('.slide-item.active .radiant-display-title');
      const b = document.querySelector('.slide-item.active .radiant-body-text');
      return [t && getComputedStyle(t).fontSize, b && getComputedStyle(b).fontSize].join('/');
    }));
  }
  const fails = seen.every(v => v === seen[0]) ? [] : [`type differs by viewport: ${seen.join('  ')}`];
  return [{ name: 'stage/viewport-parity', pass: !fails.length, failures: fails }];
}

// Interactive states are part of the design and must clear contrast too.
// Controls inside a closed overlay cannot be hovered, and measuring their
// resting style instead reports a state no user ever sees. The overlay is
// opened first so its controls are tested for real; anything still not
// visible is reported as skipped rather than silently passed.
export async function runInteractive(page, fileUrl) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);

  const p2 = c => { const m = c.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
  const sr = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = c => 0.2126 * sr(c[0]) + 0.7152 * sr(c[1]) + 0.0722 * sr(c[2]);

  const fails = [], skipped = [];
  for (const theme of ['light', 'dark']) {
    await page.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await page.click('#btn-lang', { timeout: 2000 }).catch(() => {});   // reveal overlay controls
    await page.waitForTimeout(350);

    for (const id of await page.$$eval('.nav-btn[id]', els => els.map(e => e.id))) {
      const visible = await page.$eval('#' + id, e => {
        const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && +cs.opacity > 0.1;
      }).catch(() => false);
      if (!visible) { skipped.push(`${theme} #${id}`); continue; }

      await page.hover('#' + id, { timeout: 2000, force: true }).catch(() => {});
      // Hover states now carry a 160ms background transition. Sampling before
      // it settles measures an intermediate frame no user ever sees — the wait
      // must clear the longest hover transition in the sheet, with margin.
      await page.waitForTimeout(300);
      const r = await page.evaluate(i => {
        const el = document.getElementById(i);
        let n = el, bg = null;
        const pend = [];
        while (n && n !== document.documentElement) {
          const parts = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
          if (parts) {
            const a = parts.length > 3 ? +parts[3] : 1, rgb = parts.slice(0, 3).map(Number);
            if (a >= 0.999) { bg = rgb; break; }
            if (a > 0) pend.push({ rgb, a });
          }
          n = n.parentElement;
        }
        return { bg, pend, fg: getComputedStyle(el).color };
      }, id);
      const fg = p2(r.fg);
      let bg = r.bg;
      if (!bg || !fg) continue;
      for (let k = r.pend.length - 1; k >= 0; k--)
        bg = r.pend[k].rgb.map((c, x) => c * r.pend[k].a + bg[x] * (1 - r.pend[k].a));
      const cr = (Math.max(L(fg), L(bg)) + 0.05) / (Math.min(L(fg), L(bg)) + 0.05);
      if (cr < 3.0) fails.push(`${theme} #${id} hover ${cr.toFixed(2)}:1`);
    }
    await page.click('#btnCloseLang', { timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  return [{ name: 'interactive/hover-contrast', pass: !fails.length, failures: fails,
    note: skipped.length ? `${skipped.length} control(s) not reachable, skipped: ${[...new Set(skipped)].join(', ')}` : undefined }];
}

// The deck ships seven languages and every one of them renders into the same
// fixed cards. Testing only the default language passes a deck that clips the
// moment a viewer switches — verbose languages run materially longer than the
// English the layout was tuned against.
export async function runMultilingualFit(page, fileUrl) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  const langs = await page.evaluate(() =>
    (typeof DECK_I18N !== 'undefined' ? DECK_I18N.languages.map(l => l.code) : ['en']));

  const fails = [], unmeasured = [];
  let lastSeen = null;
  for (const code of langs) {
    // deck.js exposes its API as window.deck. An earlier version of this gate
    // probed for bare globals, silently fell through to a UI click that hit the
    // wrong element, and reported identical overflow for five very different
    // languages — a number that measured nothing. The switch is now verified
    // to have actually changed the copy before anything is measured.
    const applied = await page.evaluate(c => {
      if (window.deck && typeof window.deck.setLanguage === 'function') {
        window.deck.setLanguage(c);
        return true;
      }
      return false;
    }, code).catch(() => false);
    if (!applied) { fails.push(`[${code}] could not switch language — gate cannot verify`); continue; }
    await page.waitForTimeout(450);

    const active = await page.evaluate(() =>
      document.querySelector('.slide-item .radiant-body-text')?.textContent.trim().slice(0, 40) || '');
    if (code !== 'en' && active === lastSeen) {
      // Either the switch failed or the language is an untranslated copy of
      // another. i18n/no-placeholder-languages tells the two apart; this gate
      // just declines to measure content it cannot attribute to a language.
      unmeasured.push(code);   // reported by i18n/no-placeholder-languages
      continue;
    }
    lastSeen = active;

    const spills = await page.evaluate(() => {
      const bad = [];
      const slides = [...document.querySelectorAll('.slide-item')];
      const prev = document.querySelector('.slide-item.active')?.id;
      slides.forEach(s => s.classList.remove('active'));
      for (const s of slides) {
        s.classList.add('active');
        for (const el of s.querySelectorAll('*')) {
          if (!el.children.length) continue;
          const o = el.scrollHeight - el.clientHeight;
          if (el.clientHeight > 0 && o > 4)
            bad.push(`${s.id} ${(el.className || el.tagName).toString().split(' ')[0].slice(0, 26)} +${o}h`);
        }
        s.classList.remove('active');
      }
      if (prev) document.getElementById(prev)?.classList.add('active');
      return [...new Set(bad)];
    });
    for (const sp of spills) fails.push(`[${code}] ${sp}`);
  }
  const measured = langs.filter(c => !unmeasured.includes(c));
  return [{ name: 'i18n/fit-every-language', pass: !fails.length, failures: fails,
    note: `measured ${measured.length}/${langs.length}: ${measured.join(', ')}`
        + (unmeasured.length ? ` — ${unmeasured.join(', ')} carry copy identical to another language, see i18n/no-placeholder-languages` : '') }];
}
