import assert from 'node:assert/strict';
import test from 'node:test';
import { daemonTranscriptRegistry, modalTranscriptRegistry, replayTranscriptRegistry } from '#src/adapters/transcript-registry.ts';
import type { Screens } from '#src/ports/screens.ts';

test('exact lookup returns the reader for each registered kind', () => {
    const registry = modalTranscriptRegistry();
    assert.equal(registry.exact('claude')?.agent, 'claude');
    assert.equal(registry.exact('codex')?.agent, 'codex');
    assert.equal(registry.exact('opencode')?.agent, 'opencode');
    assert.equal(registry.exact('hermes'), undefined);
});

test('unknown kinds use the screen fallback', () => {
    const screens: Screens = { readScreen: async () => ({ kind: 'screen', text: '', revision: 1, truncated: false }) };
    const registry = daemonTranscriptRegistry(screens, () => true);
    assert.equal(registry.readerFor('gemini')?.agent, '*');
});

test('the expanded modal registry has no screen fallback', () => {
    assert.equal(modalTranscriptRegistry().readerFor('gemini'), undefined);
});

test('replay registers only claude and codex', () => {
    assert.deepEqual(replayTranscriptRegistry().kinds(), ['claude', 'codex']);
});
