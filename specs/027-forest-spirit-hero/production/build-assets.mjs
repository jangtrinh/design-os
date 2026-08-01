import { mkdir, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'site', 'assets');
const output = join(source, 'production');
const magick = (...args) => run('magick', args, { maxBuffer: 1024 * 1024 });
const fromSource = (name) => join(source, name);
const toOutput = (name) => join(output, name);
const webp = ['-quality', '90', '-define', 'webp:method=6'];

async function resizeCanvas(input, name) {
  await magick(input, '-resize', '1920x1080!', ...webp, toOutput(name));
}

async function createSpiritLayers() {
  const spirit = fromSource('spirit.webp');
  const core = toOutput('spirit-core.webp');
  await magick('-size', '1920x1080', 'xc:none', '(', spirit, '-resize', '236x284!', ')', '-geometry', '+1380+360', '-composite', ...webp, core);
  await magick(
    '-size', '1920x1080', 'xc:none',
    '(', '-size', '360x430', 'xc:#c9ffd3', '(', spirit, '-resize', '360x430!', '-alpha', 'extract', '-blur', '0x28', ')', '-alpha', 'off', '-compose', 'copyopacity', '-composite', ')',
    '-geometry', '+1318+286', '-compose', 'over', '-composite', ...webp, toOutput('spirit-glow.webp')
  );
}

async function composeSettled() {
  await magick(
    toOutput('far-world.webp'),
    toOutput('rear-atmosphere.webp'), '-compose', 'screen', '-composite',
    toOutput('mid-terrain.webp'), '-compose', 'over', '-composite',
    toOutput('rooted-shrine.webp'), '-compose', 'over', '-composite',
    toOutput('spirit-glow.webp'), '-compose', 'screen', '-composite',
    toOutput('spirit-core.webp'), '-compose', 'over', '-composite',
    toOutput('near-haze.webp'), '-compose', 'screen', '-composite',
    toOutput('canopy-arch.webp'), '-compose', 'over', '-composite',
    toOutput('near-sill.webp'), '-compose', 'over', '-composite',
    ...webp,
    toOutput('settled-static.webp')
  );
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

await resizeCanvas(fromSource('background-plate-1920x1080.webp'), 'far-world.webp');
await resizeCanvas(fromSource('rough-mid-world.webp'), 'mid-terrain.webp');
await resizeCanvas(fromSource('rough-shrine-grounded.webp'), 'rooted-shrine.webp');
await resizeCanvas(fromSource('atmosphere-screen-1920x1080.webp'), 'rear-atmosphere.webp');
await resizeCanvas(fromSource('rough-near-atmosphere.webp'), 'near-haze.webp');
await resizeCanvas(fromSource('rough-canopy-arch.webp'), 'canopy-arch.webp');
await resizeCanvas(fromSource('rough-near-sill.webp'), 'near-sill.webp');
await magick('-size', '1920x1080', 'xc:none', '(', join(root, 'storyboard', 'work', 'right-obstruction.png'), '-resize', '1180x1080!', ')', '-geometry', '+300+0', '-compose', 'over', '-composite', ...webp, toOutput('right-obstruction.webp'));
await createSpiritLayers();
await composeSettled();

console.log(`Built ${output}`);
