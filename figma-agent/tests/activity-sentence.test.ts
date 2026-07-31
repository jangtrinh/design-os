// Panel IA v2, Block 3 — one English sentence per activity row. Every branch of the
// contract: pending (present continuous), success with/without a name, success with a
// count, failure (reason, never a code), and the unknown-tool fallback.
import { describe, it, expect } from 'vitest';
import { activitySentence, humanizeTool, type SentenceInput } from '../plugin/src/ui/activity-sentence.ts';

const base = (over: Partial<SentenceInput> = {}): SentenceInput => ({
  tool: 'EXEC_JS', pending: false, ok: true, ...over,
});

describe('humanizeTool', () => {
  it('lowercases and de-snakes the wire command', () => {
    expect(humanizeTool('CREATE_VARIANT_SET')).toBe('create variant set');
    expect(humanizeTool('STATUS')).toBe('status');
  });
});

describe('activitySentence — pending: present continuous', () => {
  it('names known tools', () => {
    // No trailing ellipsis (judge ruling): the continuous stem alone reads fine, and
    // the spinning circle-notch icon already carries "in progress" visually.
    expect(activitySentence(base({ tool: 'CREATE_FRAME', pending: true }))).toBe('Creating a frame');
    expect(activitySentence(base({ tool: 'EXEC_JS', pending: true }))).toBe('Running a script');
    expect(activitySentence(base({ tool: 'IMPORT_PAYLOAD', pending: true }))).toBe('Importing a design');
  });
  it('falls back to the humanized tool for an unknown command', () => {
    expect(activitySentence(base({ tool: 'CREATE_VARIANT_SET', pending: true }))).toBe('Running create variant set');
  });
});

describe('activitySentence — success WITH a name on the reply', () => {
  it('CREATE_FRAME / CREATE_INSTANCE / SET_TEXT are now reachable via the additive `name` field', () => {
    expect(activitySentence(base({ tool: 'CREATE_FRAME', nodeName: 'Hero card' }))).toBe('Created frame "Hero card"');
    expect(activitySentence(base({ tool: 'CREATE_INSTANCE', nodeName: 'Button' }))).toBe('Created instance "Button"');
    expect(activitySentence(base({ tool: 'SET_TEXT', nodeName: 'Title' }))).toBe('Set text on "Title"');
  });
  it('IMPORT_PAYLOAD / HTML_TO_FIGMA quote the imported root\'s name', () => {
    expect(activitySentence(base({ tool: 'IMPORT_PAYLOAD', nodeName: 'Hero card' }))).toBe('Imported "Hero card"');
    expect(activitySentence(base({ tool: 'HTML_TO_FIGMA', nodeName: 'Landing' }))).toBe('Imported "Landing"');
  });
  it('an unmapped tool with a name still quotes it, off the plain stem', () => {
    expect(activitySentence(base({ tool: 'CLONE_TRAITS', nodeName: 'Card' }))).toBe('Cloned traits "Card"');
  });
});

describe('activitySentence — success WITHOUT one: plain past tense, never a fabricated name', () => {
  it('EXEC_JS with no name and no count', () => {
    expect(activitySentence(base({ tool: 'EXEC_JS' }))).toBe('Ran a script');
  });
  it('BATCH never gets a name', () => {
    expect(activitySentence(base({ tool: 'BATCH' }))).toBe('Ran a batch');
  });
  it('an unknown command uses the humanized fallback, never a bare cmd', () => {
    expect(activitySentence(base({ tool: 'CREATE_VARIANT_SET' }))).toBe('Ran create variant set');
  });
});

describe('activitySentence — success carrying a count', () => {
  it('EXEC_JS scan result "→ 42 nodes" → "Scanned 42 nodes"', () => {
    expect(activitySentence(base({ tool: 'EXEC_JS', result: '→ 42 nodes' }))).toBe('Scanned 42 nodes');
  });
  it('a count on a tool with countVerb "Imported" reads as a count sentence', () => {
    expect(activitySentence(base({ tool: 'IMPORT_PAYLOAD', result: '→ 3 components' }))).toBe('Imported 3 components');
  });
  it('a name on the SAME reply still wins over a count (more specific)', () => {
    expect(activitySentence(base({ tool: 'IMPORT_PAYLOAD', nodeName: 'Hero card', result: '→ 3 components' })))
      .toBe('Imported "Hero card"');
  });
  it('a non-count result (e.g. "→ Hero card") does not get misread as a count', () => {
    expect(activitySentence(base({ tool: 'IMPORT_PAYLOAD', result: '→ Hero card' }))).toBe('Imported a design');
  });
});

describe('activitySentence — failure: the reason, never a code', () => {
  it('E_WRONG_FILE and E_NO_PLUGIN are fixed sentences, no message appended', () => {
    expect(activitySentence(base({ tool: 'EXEC_JS', ok: false, errorCode: 'E_WRONG_FILE', errorMessage: 'ignored' })))
      .toBe('That command was meant for another file');
    expect(activitySentence(base({ tool: 'EXEC_JS', ok: false, errorCode: 'E_NO_PLUGIN', errorMessage: 'ignored' })))
      .toBe('The plugin was not connected');
  });
  it('E_EVAL leads with "The script stopped:"', () => {
    expect(activitySentence(base({ tool: 'EXEC_JS', ok: false, errorCode: 'E_EVAL', errorMessage: 'boom' })))
      .toBe('The script stopped: boom');
  });
  it('E_INVALID_ARGS is just the plugin\'s own message', () => {
    expect(activitySentence(base({
      tool: 'BIND_VARIABLE', ok: false, errorCode: 'E_INVALID_ARGS',
      errorMessage: 'variable "brand/primary" does not exist',
    }))).toBe('variable "brand/primary" does not exist');
  });
  it('any other code falls back to the humanized tool + the message', () => {
    expect(activitySentence(base({
      tool: 'BIND_VARIABLE', ok: false, errorCode: 'E_PLUGIN_ERROR',
      errorMessage: 'variable "brand/primary" does not exist',
    }))).toBe('Bind variable failed — variable "brand/primary" does not exist');
  });
  it('a failure with no message at all still reads as a sentence', () => {
    expect(activitySentence(base({ tool: 'EXEC_JS', ok: false, errorCode: 'E_PLUGIN_ERROR' })))
      .toBe('Exec js failed');
  });
});
