import assert from 'node:assert/strict';
import test from 'node:test';
import { daemonTranscriptRegistry, modalTranscriptRegistry, replayTranscriptRegistry } from '#src/adapters/transcripts/registry.ts';
import { SCREEN_READER_ID } from '#src/adapters/transcripts/screen.ts';
import type { ScreenReader } from '#src/ports/screens.ts';
import { countOf } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { agentKind } from '#test/support/ids.ts';
import { readerKindOf } from './fakes/transcript-lines.ts';

test('exact lookup returns the reader for each registered kind', () => {
    const registry = modalTranscriptRegistry();
    assert.equal(registry.exact(agentKind('claude'))?.agent, 'claude');
    assert.equal(registry.exact(agentKind('codex'))?.agent, 'codex');
    assert.equal(registry.exact(agentKind('opencode'))?.agent, 'opencode');
    assert.equal(registry.exact(agentKind('gemini')), undefined);
    assert.equal(readerKindOf('gemini'), null);
});

test('exact lookup never falls back and readerFor prefers an exact reader', () => {
    const screens: ScreenReader = { readScreen: async () => ({ kind: 'screen', text: textOf(''), revision: countOf(1), truncated: 'absent' }) };
    const registry = daemonTranscriptRegistry(screens, () => 'present');
    assert.equal(registry.exact(agentKind('gemini')), undefined);
    assert.equal(registry.readerFor(agentKind('gemini'))?.agent, SCREEN_READER_ID);
    assert.equal(registry.readerFor(agentKind('claude'))?.agent, 'claude');
});

test('prototype-key kinds are unknown and use only the configured fallback', () => {
    const screens: ScreenReader = { readScreen: async () => ({ kind: 'screen', text: textOf(''), revision: countOf(1), truncated: 'absent' }) };
    const registry = daemonTranscriptRegistry(screens, () => 'present');
    for (const kind of ['constructor', 'toString', '__proto__']) {
        assert.equal(readerKindOf(kind), null);
        assert.equal(registry.exact(agentKind(kind)), undefined);
        assert.equal(registry.readerFor(agentKind(kind))?.agent, SCREEN_READER_ID);
    }
});

test('the expanded modal registry has no screen fallback', () => {
    assert.equal(modalTranscriptRegistry().readerFor(agentKind('gemini')), undefined);
});

test('replay registers only claude and codex', () => {
    const registry = replayTranscriptRegistry();
    assert.ok(registry.exact(agentKind('claude')));
    assert.ok(registry.exact(agentKind('codex')));
    assert.equal(registry.exact(agentKind('opencode')), undefined);
});
