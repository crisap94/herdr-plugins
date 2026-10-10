import assert from 'node:assert/strict';
import test from 'node:test';
import { readerKindOf, daemonTranscriptRegistry, modalTranscriptRegistry, replayTranscriptRegistry } from '#src/adapters/transcript-registry.ts';
import { SCREEN_READER_ID } from '#src/adapters/screen-transcripts.ts';
import type { Screens } from '#src/ports/screens.ts';

test('exact lookup returns the reader for each registered kind', () => {
    const registry = modalTranscriptRegistry();
    assert.equal(registry.exact('claude')?.agent, 'claude');
    assert.equal(registry.exact('codex')?.agent, 'codex');
    assert.equal(registry.exact('opencode')?.agent, 'opencode');
    assert.equal(registry.exact('hermes'), undefined);
    assert.equal(readerKindOf('hermes'), 'hermes');
});

test('exact lookup never falls back and readerFor prefers an exact reader', () => {
    const screens: Screens = { readScreen: async () => ({ kind: 'screen', text: '', revision: 1, truncated: false }) };
    const registry = daemonTranscriptRegistry(screens, () => true);
    assert.equal(registry.exact('gemini'), undefined);
    assert.equal(registry.readerFor('gemini')?.agent, SCREEN_READER_ID);
    assert.equal(registry.readerFor('claude')?.agent, 'claude');
});

test('prototype-key kinds are unknown and use only the configured fallback', () => {
    const screens: Screens = { readScreen: async () => ({ kind: 'screen', text: '', revision: 1, truncated: false }) };
    const registry = daemonTranscriptRegistry(screens, () => true);
    for (const kind of ['constructor', 'toString', '__proto__']) {
        assert.equal(readerKindOf(kind), null);
        assert.equal(registry.exact(kind), undefined);
        assert.equal(registry.readerFor(kind)?.agent, SCREEN_READER_ID);
    }
});

test('the expanded modal registry has no screen fallback', () => {
    assert.equal(modalTranscriptRegistry().readerFor('gemini'), undefined);
});

test('replay registers only claude and codex', () => {
    const registry = replayTranscriptRegistry();
    assert.ok(registry.exact('claude'));
    assert.ok(registry.exact('codex'));
    assert.equal(registry.exact('opencode'), undefined);
});
