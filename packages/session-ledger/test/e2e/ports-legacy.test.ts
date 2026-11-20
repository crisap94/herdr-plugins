import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capabilityWording, inFlightReason, splitReason } from '@stateforge-labs/session-ledger/unstable/ports/capability-reasons.ts';
import { blankRecap, hasRecap } from '@stateforge-labs/session-ledger/unstable/ports/recap-records.ts';
import { TranscriptRegistry } from '@stateforge-labs/session-ledger/unstable/ports/transcript-registry.ts';
import { isScreenSource, SCREEN_PREFIX } from '@stateforge-labs/session-ledger/unstable/ports/transcript-source.ts';
import type { Transcripts } from '@stateforge-labs/session-ledger/unstable/ports/transcripts.ts';
import { isUnknown, saying, unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';

const readerOf = (agent: string): Transcripts => ({
    agent,
    locate: async () => ({ kind: 'located', source: agent }),
    read: async () => unknown({ why: 'not-found', what: agent }),
    latestPrompt: async () => ({ kind: 'prompt', text: null }),
    inFlight: { kind: 'unsupported', why: 'screen' },
});

test('the capability reasons word each missing capability for its agent', () => {
    assert.equal(capabilityWording('history-unavailable', 'codex'), 'no reader for codex');
    assert.equal(splitReason('codex-cells', 'codex'), 'codex cannot tell background work that survives a compaction');
    assert.equal(inFlightReason('screen', 'claude'), 'screen transcripts do not contain in-flight work');
});

test('a blank recap holds no recap until a task has markdown', () => {
    const blank = blankRecap('tab-1');
    assert.deepEqual(blank, { tab: 'tab-1', lanes: [], tasks: [], at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' });
    assert.equal(hasRecap(blank), false);
});

test('the transcript registry picks the exact reader, then the fallback, and words what is missing', () => {
    const claude = readerOf('claude');
    const screen = readerOf('screen');
    const registry = new TranscriptRegistry({ claude }, screen, (kind) => `no reader for ${kind}`);
    assert.equal(registry.exact('claude'), claude);
    assert.equal(registry.exact('codex'), undefined);
    assert.equal(registry.readerFor('codex'), screen);
    assert.equal(new TranscriptRegistry({}, null, () => '').readerFor('codex'), undefined);
    assert.equal(registry.unavailableReason('codex'), 'no reader for codex');
});

test('a screen source carries the screen prefix', () => {
    assert.equal(isScreenSource(`${SCREEN_PREFIX}pane-1`), true);
    assert.equal(isScreenSource('/tmp/session.jsonl'), false);
});

test('an unknown result is told apart and said in words', () => {
    const missing = unknown({ why: 'not-found', what: 'the transcript' });
    assert.equal(isUnknown(missing), true);
    assert.equal(isUnknown({ kind: 'chunk' }), false);
    assert.equal(saying(missing.why), 'the transcript not found');
});
