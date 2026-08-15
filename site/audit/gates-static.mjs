// Static gates — parse deck.css and index.html. No browser, no dependencies.
// These encode the design-system rules that must hold in the source itself.
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export const TYPE_STEPS  = ['micro','label','body','title','heading','display','hero'];
export const TYPE_RATIO  = 1.3333;
export const SPACE_STEPS = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96, 128];

// Strip @media blocks: the fixed 1920x1080 stage is transform-scaled, so
// viewport-conditional type inside it is itself a defect (gate 6 below).
function stripMedia(css) {
  let out = '', depth = 0, media = null;
  for (const line of css.split('\n')) {
    if (media === null && line.trimStart().startsWith('@media')) media = depth;
    if (media === null) out += line + '\n';
    depth += (line.split('{').length - 1) - (line.split('}').length - 1);
    if (media !== null && depth <= media) media = null;
  }
  return out;
}

export function runStatic(dir) {
  const css = readFileSync(`${dir}/deck.css`, 'utf8');
  const i18nRaw = existsSync(`${dir}/translations.js`) ? readFileSync(`${dir}/translations.js`, 'utf8') : null;
  const html = readFileSync(`${dir}/index.html`, 'utf8');
  const body = stripMedia(css);
  const results = [];
  const gate = (name, failures, note) =>
    results.push({ name, pass: failures.length === 0, failures, note });

  // 1. Every font-size resolves through the scale. A raw literal is a size
  //    someone picked by eye, which is how 19 unrelated sizes accumulated.
  gate('type/tokenised',
    [...body.matchAll(/font-size:\s*(\d+)px/g)].map(m => `raw font-size: ${m[1]}px`));

  // 2. The scale is one ratio. Guards against a step being nudged in isolation.
  const decl = Object.fromEntries(
    [...css.matchAll(/--fs-(\w+):\s*(\d+)px/g)].map(m => [m[1], +m[2]]));
  const ratioFails = [];
  for (let i = 1; i < TYPE_STEPS.length; i++) {
    const a = decl[TYPE_STEPS[i - 1]], b = decl[TYPE_STEPS[i]];
    if (a == null || b == null) { ratioFails.push(`--fs-${TYPE_STEPS[i]} missing`); continue; }
    const r = b / a;
    if (Math.abs(r - TYPE_RATIO) / TYPE_RATIO > 0.03)
      ratioFails.push(`--fs-${TYPE_STEPS[i-1]}->${TYPE_STEPS[i]} ratio ${r.toFixed(3)} (want ${TYPE_RATIO})`);
  }
  gate('type/one-ratio', ratioFails);

  // 3. Every gap/pad/margin lands on the spacing scale.
  const spaceFails = [];
  for (const m of body.matchAll(/(?:^|[\s;{])(gap|row-gap|column-gap|padding|margin)(-top|-right|-bottom|-left)?:\s*([^;}]+)/g)) {
    if (/var\(|calc\(|auto|%/.test(m[3])) continue;
    for (const px of m[3].matchAll(/(\d+)px/g)) {
      const v = +px[1];
      if (v <= 128 && !SPACE_STEPS.includes(v))
        spaceFails.push(`${m[1]}${m[2] || ''}: ${v}px off the base`);
    }
  }
  gate('space/on-scale', [...new Set(spaceFails)]);

  // 4. Percentage column pairs plus a gap always exceed 100% of the track.
  //    This silently overflowed 12 grids across 11 slides.
  gate('grid/no-percent-columns',
    [...body.matchAll(/grid-template-columns:\s*\d+%\s+\d+%/g)].map(m => m[0]));

  // 5. No element is left with NO styled class at all. Two whole slides once
  //    rendered as unstyled text dumps because their layout blocks were never
  //    written. Checking per-element rather than per-class matters: a variant
  //    hook like `chamber-1` is legitimately bare when it rides a styled base,
  //    so flagging every unstyled class would bury the real failure in noise.
  const styled = new Set([...css.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(m => m[1]));
  const orphans = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    const list = m[1].split(/\s+/).filter(c => c && !c.startsWith('slide-layout-'));
    if (list.length && !list.some(c => styled.has(c))) orphans.add(list.join('.'));
  }
  gate('css/no-orphan-elements', [...orphans].sort(),
    'flags elements whose every class is unstyled; variant hooks on a styled base are exempt');

  // 6. The stage is a fixed board that is transform-scaled, so type must never
  //    be redeclared per viewport. It once rendered body copy at ~7px on phones.
  const mediaOnly = css.replace(stripMedia(css), '');
  gate('stage/resolution-independent',
    [...mediaOnly.matchAll(/font-size:\s*(\d+)px/g)].map(m => `@media raw font-size: ${m[1]}px`));

  // 7. Imagery is allowlisted, with a stated reason per plate.
  //    An image belongs on a slide only when it IS the evidence for that
  //    slide's claim or the subject itself. Uniform ambient texture across a
  //    deck reads as decoration, not design — this deck carried exactly that
  //    for one revision. Encoding the allowlist keeps it from creeping back,
  //    and catches orphan asset files left behind by a removed plate.
  const EARNED = {
    'cinema-orbit':    'slide 21 — the card names this camera move',
    'cinema-exploded': 'slide 21 — the card names this camera move',
    'cinema-macro':    'slide 21 — the card names this camera move',
    'color-hsl':       'slide 16 — the ring IS the uneven-lightness claim',
    'color-oklch':     'slide 16 — the ring IS the uniform-lightness claim',
    'gflow-canvas':    'slide 22 — the card is a WebGL viewport',
    'memory-vectors':  'slide 14 — depicts the embedding space described',
  };
  const referenced = new Set([...css.matchAll(/assets\/([a-z-]+)\.(?:jpg|png)/g)].map(m => m[1]));
  const imgFails = [];
  for (const r of referenced)
    if (!(r in EARNED)) imgFails.push(`${r} is used but not in the earned allowlist`);
  if (existsSync(`${dir}/assets`))
    for (const f of readdirSync(`${dir}/assets`)) {
      const base = f.replace(/\.(jpg|png)$/, '');
      if (!referenced.has(base)) imgFails.push(`${f} is an orphan file, referenced by nothing`);
    }
  gate('content/images-earn-their-place', imgFails,
    `${referenced.size} plate(s) in use, each with a stated reason`);

  // 8. Every advertised language is actually translated. The picker offered
  //    seven; four of them carried byte-identical English, so a viewer could
  //    select 日本語 and get English with no indication anything had failed.
  //    Shipping a language selector that silently no-ops is worse than
  //    offering fewer languages.
  if (i18nRaw) {
    const dict = JSON.parse(i18nRaw.slice(i18nRaw.indexOf('{'), i18nRaw.lastIndexOf('}') + 1));
    const codes = (dict.languages || []).map(l => l.code);
    const base = codes[0];
    const tally = {};
    for (const [, per] of Object.entries(dict.slides || {}))
      for (const c of codes) {
        if (c === base || !per[c] || !per[base]) continue;
        tally[c] = tally[c] || { same: 0, total: 0 };
        tally[c].total++;
        if (JSON.stringify(per[c]) === JSON.stringify(per[base])) tally[c].same++;
      }
    gate('i18n/no-placeholder-languages',
      Object.entries(tally)
        .filter(([, v]) => v.total && v.same / v.total > 0.5)
        .map(([c, v]) => `"${c}" is ${Math.round(v.same / v.total * 100)}% identical to "${base}" — advertised but not translated`),
      `${codes.length} language(s) advertised: ${codes.join(', ')}`);
  }

  return results;
}
