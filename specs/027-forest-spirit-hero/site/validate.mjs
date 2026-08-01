import { access, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const site = dirname(fileURLToPath(import.meta.url));
const assets = join(site, 'assets', 'production');
const requiredLayers = [
  'far-world.webp', 'mid-terrain.webp', 'rooted-shrine.webp', 'rear-atmosphere.webp',
  'near-haze.webp', 'canopy-arch.webp', 'right-obstruction.webp', 'near-sill.webp',
  'spirit-core.webp', 'spirit-glow.webp', 'settled-static.webp'
];
const labels = ['threshold', 'notice', 'crossing', 'absence', 'reveal', 'orbit', 'settle', 'release'];
const labelPositions = [0, 0.1, 0.23, 0.38, 0.48, 0.68, 0.86, 0.94];
const [html, css, js, assetFiles] = await Promise.all([
  readFile(join(site, 'index.html'), 'utf8'), readFile(join(site, 'styles.css'), 'utf8'),
  readFile(join(site, 'hero.js'), 'utf8'), readdir(assets)
]);

function assert(condition, message) { if (!condition) throw new Error(message); }
async function identify(asset, format) {
  const { stdout } = await run('magick', [join(assets, asset), '-format', format, 'info:']);
  return stdout.trim();
}

for (const layer of requiredLayers) {
  assert(assetFiles.includes(layer), `Missing production layer: ${layer}`);
  const dimensions = await identify(layer, '%wx%h');
  assert(dimensions === '1920x1080', `${layer} must be 1920x1080, found ${dimensions}`);
}
for (const layer of ['spirit-core.webp', 'spirit-glow.webp']) {
  const bounds = await identify(layer, '%[fx:page.width]x%[fx:page.height]');
  const { stdout } = await run('magick', [join(assets, layer), '-alpha', 'extract', '-threshold', '1%', '-trim', '-format', '%wx%h', 'info:']);
  const [width, height] = stdout.trim().split('x').map(Number);
  assert(bounds === '1920x1080' && width >= 120 && height >= 120, `${layer} alpha content is empty or undersized`);
}

assert(!html.includes('rough-'), 'Final site must not reference rough assets');
assert(!html.match(/https?:\/\//), 'Runtime assets must be local; external URLs are not allowed');
assert(html.includes('vendor/gsap.min.js') && html.includes('vendor/ScrollTrigger.min.js'), 'Missing local GSAP/ScrollTrigger vendor scripts');
await Promise.all(['vendor/gsap.min.js', 'vendor/ScrollTrigger.min.js'].map((file) => access(join(site, file))));
for (const name of requiredLayers) assert(html.includes(`assets/production/${name}`), `Production layer not referenced: ${name}`);
assert((html.match(/data-plane=/g) || []).length === 9, 'Expected the nine production scene planes');
assert(/data-plane="focus-group"[\s\S]*data-semantic="rooted-shrine"/.test(html), 'Shrine must remain nested inside the focus group');
assert(/data-plane="focus-group"[\s\S]*data-plane="spirit-behind"[\s\S]*data-semantic="rooted-shrine"[\s\S]*data-plane="spirit-front"/.test(html), 'Depth-swap carriers must share the shrine focus coordinate system');
assert(!html.includes('data-plane="rooted-shrine"') && !js.includes("plane('rooted-shrine')"), 'Shrine cannot have an independent plane or runtime transform');
assert(!css.includes('rooted-shrine') || !css.match(/rooted-shrine[^}]*transform/), 'Shrine cannot receive an independent CSS transform');
assert((js.match(/ScrollTrigger\.create/g) || []).length === 1 && js.includes('pin: stage') && js.includes('scrub: 0.35'), 'Expected one pinned scrub ScrollTrigger');
assert(js.includes('gsap.registerPlugin(window.ScrollTrigger)'), 'ScrollTrigger must be registered once');
labels.forEach((label, index) => assert(js.includes(`.addLabel('${label}', ${labelPositions[index]})`), `Missing normalized label ${label}`));
assert(js.includes('spirit-behind') && js.includes('spirit-front') && js.includes('.set(behind, { autoAlpha: 0 }, \'orbit\')') && js.includes('.set(front, { autoAlpha: 1'), 'Missing reverse-safe behind/front spirit crossing');
assert(js.includes("window.matchMedia('(prefers-reduced-motion: reduce)').matches") && js.includes("hero.classList.add('is-reduced');\n    return;"), 'Reduced motion must return before scrub setup');
assert(css.includes('@media (prefers-reduced-motion: reduce)') && css.includes('.settled-preview { display: block; }'), 'Reduced motion must render the settled static state');
assert(!/\.to\([^\n]+\b(?:width|height|top|left|margin|padding)\s*:/.test(js), 'Timeline may only animate compositor-safe properties');
assert(js.includes('checkpointValues') && js.includes('0.23') && js.includes('0.58') && js.includes('0.94'), 'Missing deterministic storyboard progress query support');
assert(js.includes(".set(behind, { autoAlpha: 0 }, 'absence')"), 'Absence must fully hide the spirit');
assert(js.includes(".to(obstruction, { autoAlpha: 1, x: 190, scale: 1.125, duration: 0.1 }, 'absence')") && js.includes('x: 720, autoAlpha: 0.68'), 'Obstruction must hold then clear during reveal');

console.log(`Forest production validation passed: ${requiredLayers.length} 1920x1080 assets, ${labels.length} labels, local GSAP.`);
