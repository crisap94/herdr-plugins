import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capabilityWording, inFlightReason, splitReason } from '@stateforge-labs/session-ledger/unstable/ports/capability-reasons.ts';
import { textOf, parseTextOrNull } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { usdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/usd.ts';
import { blankRecap, hasRecap, recappedOf, recapRunningOf } from '@stateforge-labs/session-ledger/unstable/ports/recap-records.ts';
import { TranscriptRegistry } from '@stateforge-labs/session-ledger/unstable/ports/transcript-registry.ts';
import { isScreenSource, SCREEN_PREFIX } from '@stateforge-labs/session-ledger/unstable/ports/transcript-source.ts';
import { countOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/count.ts';
import { NO_RUNNING, runningOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/in-flight.ts';
import { sourcePathOf, type Transcripts } from '@stateforge-labs/session-ledger/unstable/ports/transcripts.ts';
import { agentKindOf, paneIdOf, tabIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';
import { causeOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/failure-cause.ts';
import { exitCodeOf, isUnknown, saying, unknown } from '@stateforge-labs/session-ledger/unstable/ports/unknowable.ts';
import { text, tabId, paneId, running } from '@stateforge-labs/session-ledger/testkit';

const readerOf = (agent: string): Transcripts => ({
    agent: agentKindOf(agent),
    locate: async () => ({ kind: 'located', source: sourcePathOf(agent) }),
    read: async () => unknown({ why: 'not-found', what: text(agent) }),
    latestPrompt: async () => ({ kind: 'prompt', text: null }),
    inFlight: { kind: 'unsupported', why: 'screen' },
});

test('the capability reasons word each missing capability for its agent', () => {
    assert.equal(capabilityWording('history-unavailable', textOf('codex')), 'no reader for codex');
    assert.equal(splitReason('codex-cells', textOf('codex')), 'codex cannot tell background work that survives a compaction');
    assert.equal(inFlightReason('screen', textOf('claude')), 'screen transcripts do not contain in-flight work');
});

test('a blank recap holds no recap until a task has markdown', () => {
    const blank = blankRecap(tabId('tab-1'));
    assert.deepEqual(blank, { tab: 'tab-1', lanes: [], tasks: [], at: null, running: false, backend: null, error: null, costUsd: 0, language: 'en' });
    assert.equal(hasRecap(blank), recappedOf(false));
    assert.equal(blank.running, recapRunningOf(false));
    assert.equal(blank.running, running(false));
    assert.equal(blank.tab, tabIdOf('tab-1'));
});

test('a pane id and a tab id keep the text they are made of', () => {
    assert.equal(paneIdOf('w1:p1'), paneId('w1:p1'));
    assert.equal(tabIdOf('w1:t1'), tabId('w1:t1'));
});

test('the transcript registry picks the exact reader, then the fallback, and words what is missing', () => {
    const claude = readerOf('claude');
    const screen = readerOf('screen');
    const registry = new TranscriptRegistry(new Map([[agentKindOf('claude'), claude]]), screen, (kind) => textOf(`no reader for ${kind}`));
    assert.equal(registry.exact(agentKindOf('claude')), claude);
    assert.equal(registry.exact(agentKindOf('codex')), undefined);
    assert.equal(registry.readerFor(agentKindOf('codex')), screen);
    assert.equal(new TranscriptRegistry(new Map(), null, () => textOf('')).readerFor(agentKindOf('codex')), undefined);
    assert.equal(registry.unavailableReason(agentKindOf('codex')), 'no reader for codex');
});

test('a screen source carries the screen prefix', () => {
    assert.equal(isScreenSource(sourcePathOf(`${SCREEN_PREFIX}pane-1`)), true);
    assert.equal(isScreenSource(sourcePathOf('/tmp/session.jsonl')), false);
});

test('an unknown result is told apart and said in words', () => {
    const missing = unknown({ why: 'not-found', what: text('the transcript') });
    assert.equal(isUnknown(missing), true);
    assert.equal(isUnknown({ kind: 'chunk' }), false);
    assert.equal(saying(missing.why), 'the transcript not found');
    assert.equal(saying({ why: 'failed', code: exitCodeOf(2), detail: causeOf(textOf('boom')) }), 'exited 2: boom');
});

test('an in-flight capability answers with a running count read from a source within a budget', async () => {
    const reader: Transcripts = {
        ...readerOf('claude'),
        inFlight: { kind: 'supported', split: { kind: 'separates' }, read: async (_source, budget) => ({ kind: 'in-flight', count: budget > countOf(0) ? runningOf(2) : NO_RUNNING, background: [] }) },
    };
    
    const answer = reader.inFlight.kind === 'supported' ? await reader.inFlight.read(sourcePathOf('/a.jsonl'), countOf(10)) : null;
    assert.deepEqual(answer, { kind: 'in-flight', count: 2, background: [] });
});

test('parseTextOrNull keeps null and text, and takes any stored value to text or nothing; usdOf brands an amount unchanged', () => {
    assert.equal(parseTextOrNull(null), null);
    assert.equal(parseTextOrNull('a'), textOf('a'));
    assert.equal(parseTextOrNull(undefined), null);
    assert.equal(usdOf(0.25), 0.25);
});
