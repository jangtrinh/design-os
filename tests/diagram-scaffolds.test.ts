import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintDiagram } from '../src/core/diagram-lint.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCAFFOLD_DIR = join(REPO_ROOT, 'templates', 'diagram-scaffolds');

// Static scaffolds only. The motion variant lives in motion/ and is deliberately
// ungated by diagram lint — see the paired-artifact tests at the bottom of this file.
const scaffolds = readdirSync(SCAFFOLD_DIR).filter((name) => name.endsWith('.html'));
const MOTION_DIR = join(SCAFFOLD_DIR, 'motion');
const motionScaffolds = readdirSync(MOTION_DIR).filter((name) => name.endsWith('.html'));

describe('diagram scaffolds', () => {
  it('ships at least one scaffold', () => {
    expect(scaffolds.length).toBeGreaterThan(0);
  });

  // A scaffold that cannot pass the gate it is meant to demonstrate teaches the wrong
  // shape to every diagram authored from it.
  it.each(scaffolds)('%s passes ui diagram lint', (name) => {
    const html = readFileSync(join(SCAFFOLD_DIR, name), 'utf8');
    expect(lintDiagram(html)).toEqual({ findings: [], errorCount: 0, warningCount: 0 });
  });

  it.each(scaffolds)('%s carries no network dependency', (name) => {
    const html = readFileSync(join(SCAFFOLD_DIR, name), 'utf8');
    expect(html).not.toMatch(/fonts\.googleapis|cdn\.|https?:\/\/(?!www\.w3\.org)/);
  });

  // Scaffolds are adapted, not filled in — an unresolved placeholder would ship as-is.
  it.each(scaffolds)('%s is a fully resolved instance, not a slot template', (name) => {
    const html = readFileSync(join(SCAFFOLD_DIR, name), 'utf8');
    expect(html).not.toMatch(/\{\{|\[diagram-slug\]|\[Diagram title\]/);
  });
});

/**
 * Motion ships as a PAIR: a gated static artifact plus a motion variant.
 *
 * `ui diagram lint`'s `no-script` check is absolute, and the motion controller is an
 * inline script — so rather than weakening the gate, the motion variant is governed by
 * these checks instead. What they enforce is the property that actually matters: the
 * diagram is complete and readable before any script runs.
 */
describe('diagram motion scaffolds (paired artifact)', () => {
  it('ships a motion variant alongside the static scaffolds', () => {
    expect(motionScaffolds.length).toBeGreaterThan(0);
    expect(scaffolds.length).toBeGreaterThan(0);
  });

  it.each(motionScaffolds)('%s carries no network dependency', (name) => {
    const html = readFileSync(join(MOTION_DIR, name), 'utf8');
    expect(html).not.toMatch(/fonts\.googleapis|cdn\.|https?:\/\/(?!www\.w3\.org)/);
  });

  it.each(motionScaffolds)('%s uses only inline script, never an external one', (name) => {
    const html = readFileSync(join(MOTION_DIR, name), 'utf8');
    expect(html).not.toMatch(/<script[^>]+src=/i);
  });

  it.each(motionScaffolds)('%s honours prefers-reduced-motion in both CSS and script', (name) => {
    const html = readFileSync(join(MOTION_DIR, name), 'utf8');
    expect(html).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(html).toMatch(/matchMedia\(\s*['"]\(prefers-reduced-motion: reduce\)['"]\s*\)/);
  });

  it.each(motionScaffolds)('%s is complete before enhancement — motion is opt-in, not opt-out', (name) => {
    const html = readFileSync(join(MOTION_DIR, name), 'utf8');
    // Hiding is scoped behind the controller-set attribute, so a no-JS reader sees
    // everything. An unscoped `.step { opacity: 0 }` would hide content permanently.
    expect(html).toMatch(/\[data-motion="on"\]\s*\.step\s*\{\s*opacity:\s*0/);
    expect(html).not.toMatch(/^\s*\.step\s*\{\s*opacity:\s*0/m);
  });

  it.each(motionScaffolds)('%s keeps the artifact readable when printed', (name) => {
    const html = readFileSync(join(MOTION_DIR, name), 'utf8');
    expect(html).toMatch(/@media print/);
  });

  it.each(motionScaffolds)('%s still binds colour to design tokens', (name) => {
    const html = readFileSync(join(MOTION_DIR, name), 'utf8');
    const literalColorAttr = /(?:fill|stroke)="(?!currentColor|none|url\(#|var\()[^"]+"/i;
    expect(html).not.toMatch(literalColorAttr);
  });
});
