import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Routing tests for the grammar set.
 *
 * Nineteen diagram grammars include deliberate near-neighbours (the step-and-role trio,
 * the platform-overview quartet, the hierarchy family). Set-inequality on `when:` would
 * not catch two grammars sharing nine of ten triggers, so these tests check the property
 * that actually matters: a brief resolves to exactly one grammar.
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const GRAMMAR_DIR = join(REPO_ROOT, 'knowledge', 'diagram-grammars');
const CRAFT = readFileSync(join(REPO_ROOT, 'knowledge', 'diagram-craft.md'), 'utf8');

interface Grammar {
  name: string;
  id: string;
  when: string[];
  body: string;
}

/** Words too ambiguous to discriminate; they belong in the precedence prose, not in `when:`. */
const BANNED_TRIGGER_WORDS = [
  'flow', 'chart', 'graph', 'map', 'lane', 'lanes',
  'timeline', 'diagram', 'structure', 'overview', 'system',
];

function parseGrammar(file: string): Grammar {
  const raw = readFileSync(join(GRAMMAR_DIR, file), 'utf8');
  const front = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (front === null) throw new Error(`${file}: missing front-matter`);
  const block = front[1]!;
  const id = /^id:\s*(.+)$/m.exec(block)?.[1]?.trim() ?? '';

  // `when:` is either an inline [a, b] list or a block sequence of `- item` lines.
  const inline = /^when:\s*\[(.*?)\]/ms.exec(block);
  const when = inline
    ? inline[1]!.split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
    : [...(/^when:\s*\n((?:\s*-\s.*\n?)+)/m.exec(block)?.[1] ?? '').matchAll(/^\s*-\s*(.+)$/gm)]
        .map((m) => m[1]!.trim().replace(/^["']|["']$/g, ''));

  return { name: file.replace(/\.md$/, ''), id, when, body: raw.slice(front[0].length) };
}

const grammars = readdirSync(GRAMMAR_DIR)
  .filter((f) => f.endsWith('.md'))
  .map(parseGrammar);

describe('grammar front-matter', () => {
  it('ships nineteen diagram grammars', () => {
    expect(grammars).toHaveLength(19);
  });

  it.each(grammars.map((g) => [g.name, g] as const))('%s declares an id and triggers', (_name, g) => {
    expect(g.id).toMatch(/^diagram-[a-z-]+$/);
    expect(g.when.length).toBeGreaterThanOrEqual(2);
  });

  it('gives every grammar a distinct id', () => {
    const ids = grammars.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('trigger tokens are pairwise disjoint', () => {
  // The core property: no token may point at two grammars, or routing is undecidable.
  it('never repeats a trigger token across grammars', () => {
    const owner = new Map<string, string>();
    const collisions: string[] = [];
    for (const g of grammars) {
      for (const token of g.when) {
        const previous = owner.get(token);
        if (previous !== undefined) collisions.push(`"${token}" claimed by both ${previous} and ${g.name}`);
        else owner.set(token, g.name);
      }
    }
    expect(collisions).toEqual([]);
  });

  it('keeps ambiguous words out of trigger tokens', () => {
    const offenders: string[] = [];
    for (const g of grammars) {
      for (const token of g.when) {
        for (const word of BANNED_TRIGGER_WORDS) {
          // Token words are hyphen-separated; match whole words only.
          if (token.toLowerCase().split('-').includes(word)) {
            offenders.push(`${g.name}: "${token}" contains ambiguous word "${word}"`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('collision families cross-name their neighbours', () => {
  // Each near-neighbour set must say, in each member, what the others are — otherwise a
  // router that lands on one has no signal that a better fit exists next door.
  const FAMILIES: Record<string, string[]> = {
    'step-and-role': ['swimlane', 'data-flow', 'process'],
    'platform-overview': ['high-level', 'dp-integration', 'medallion', 'it-state'],
    hierarchy: ['org-chart', 'tree', 'nested', 'layers'],
  };

  for (const [family, members] of Object.entries(FAMILIES)) {
    it(`${family}: each member names the others by filename`, () => {
      const missing: string[] = [];
      for (const member of members) {
        const g = grammars.find((x) => x.name === member);
        expect(g, `missing grammar ${member}`).toBeDefined();
        for (const sibling of members.filter((m) => m !== member)) {
          if (!g!.body.includes(`${sibling}.md`)) missing.push(`${member} does not name ${sibling}.md`);
        }
      }
      expect(missing).toEqual([]);
    });

    it(`${family}: the shared contract states its precedence`, () => {
      for (const member of members) expect(CRAFT).toContain(member);
    });
  }
});

describe('golden routing corpus', () => {
  /**
   * Each brief must match exactly one grammar's trigger tokens. A brief matching zero
   * means the vocabulary has a hole; matching two means the trigger sets have drifted
   * back into ambiguity. Deterministic substring matching — no model involved.
   */
  const CORPUS: ReadonlyArray<readonly [string, string]> = [
    ['show the service-topology and what-talks-to-what for checkout', 'architecture'],
    ['draw the component-boundary-set of the billing platform', 'architecture'],
    ['trace the participant-exchange for a failed payment', 'sequence'],
    ['show message-ordering across the auth protocol-handshake', 'sequence'],
    ['render the flowjson-projection for onboarding', 'product-flow'],
    ['draw the screen-state-transition set we linted', 'product-flow'],
    ['show role-partitioned-steps for claims intake', 'swimlane'],
    ['who-does-which-step in the refund path', 'swimlane'],
    ['draw the payload-typed-handoff between ingest and reporting', 'data-flow'],
    ['show in-out-payload-chips for each stage', 'data-flow'],
    ['render the role-badged-procedure for incident response', 'process'],
    ['show the operational-runbook-steps with owners', 'process'],
    ['draw the phase-chevron-banner for the platform', 'high-level'],
    ['show the platform-capability-sweep end to end', 'high-level'],
    ['which sources attach: source-to-consumer-topology', 'dp-integration'],
    ['draw the integration-hub-spoke layout', 'dp-integration'],
    ['show storage-tier-promotion from raw to curated', 'medallion'],
    ['draw the quality-layer-ascent', 'medallion'],
    ['document the current-state-landscape before migration', 'it-state'],
    ['inventory the pain-point-inventory of the estate', 'it-state'],
    ['build the role-permission-grid for the platform', 'dp-security-matrix'],
    ['show each rbac-access-cell', 'dp-security-matrix'],
    ['draw the closed-cycle-ring of our operating model', 'loop'],
    ['show the flywheel-station feeding the hub', 'loop'],
    ['model entity-relationship-cardinality for orders', 'er'],
    ['show the table-key-relation between customer and invoice', 'er'],
    ['draw the branching-decision-path for eligibility', 'flowchart'],
    ['show the yes-no-gate sequence', 'flowchart'],
    ['render the stacked-tier-band of the runtime', 'layers'],
    ['show abstraction-strata from hardware up', 'layers'],
    ['draw the containment-enclosure of each trust zone', 'nested'],
    ['show boundary-within-boundary scoping', 'nested'],
    ['draw the reporting-line for the engineering org', 'org-chart'],
    ['show the personnel-hierarchy under the CTO', 'org-chart'],
    ['model the state-machine-transition for a subscription', 'state'],
    ['show lifecycle-status-change for an order', 'state'],
    ['draw the parent-child-branching of the catalogue', 'tree'],
    ['show taxonomy-descent for product categories', 'tree'],
  ];

  it.each(CORPUS)('routes %s', (brief, expected) => {
    const matches = grammars
      .filter((g) => g.when.some((token) => brief.includes(token)))
      .map((g) => g.name);
    expect(matches).toEqual([expected]);
  });

  it('covers every grammar at least once', () => {
    const covered = new Set(CORPUS.map(([, g]) => g));
    const uncovered = grammars.map((g) => g.name).filter((n) => !covered.has(n));
    expect(uncovered).toEqual([]);
  });
});
