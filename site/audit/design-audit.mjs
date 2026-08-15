#!/usr/bin/env node
// Deck design audit — the deterministic quality floor for this deck.
//
//   node audit/design-audit.mjs              full run (needs playwright)
//   node audit/design-audit.mjs --static     source gates only, no browser
//
// Exits non-zero if any gate fails, so it can sit in CI or a pre-commit hook.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { runStatic } from './gates-static.mjs';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticOnly = process.argv.includes('--static');

const results = [...runStatic(DIR)];

if (!staticOnly) {
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch {
    console.error('playwright not resolvable — run with --static, or `npm i -D playwright`');
    process.exit(2);
  }
  const { runRendered, runViewportParity, runInteractive, runMultilingualFit } = await import('./gates-rendered.mjs');
  const url = pathToFileURL(`${DIR}/index.html`).href;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    results.push(...await runRendered(page, url));
    results.push(...await runViewportParity(page, url));
    results.push(...await runInteractive(page, url));
    results.push(...await runMultilingualFit(page, url));
  } finally { await browser.close(); }
}

let failed = 0;
const MAX_SHOWN = 8;
console.log(`\n  DECK DESIGN AUDIT — ${results.length} gates\n  ${'─'.repeat(58)}`);
for (const r of results) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  console.log(`  ${mark}  ${r.name}${r.pass ? '' : `  (${r.failures.length})`}`);
  if (!r.pass) {
    failed++;
    for (const f of r.failures.slice(0, MAX_SHOWN)) console.log(`          ${f}`);
    if (r.failures.length > MAX_SHOWN) console.log(`          …and ${r.failures.length - MAX_SHOWN} more`);
  }
  if (r.note) console.log(`          note: ${r.note}`);
}
console.log(`  ${'─'.repeat(58)}`);
console.log(`  ${failed ? `${failed} GATE(S) FAILED` : 'ALL GATES PASS'}\n`);
process.exit(failed ? 1 : 0);
