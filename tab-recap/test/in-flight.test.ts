import { flightReason, observedFrom, runningCount, unreadable, runningOf } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptInFlight } from '#src/adapters/transcripts/in-flight.ts';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { flightOf } from '#src/recap/application/in-flight.ts';
import type { InFlightReader, InFlightRead } from '#src/ports/in-flight.ts';
import type { Located, InFlightResult } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { agentKind } from '#test/support/ids.ts';
import { sourcePathOf } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { seenLane } from '#test/support/seen.ts';

const claude = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 'sess-1', cwd: '/repo' }));
const codex = laneFrom(seenLane({ paneId: 'w1:p2', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex', cwd: '/repo' }));
const sessionless = laneFrom(seenLane({ paneId: 'w1:p3', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' }));

function fakeReader(agent: string, located: Located, flight: InFlightResult): SessionReader {
    return {
        agent: agentKind(agent),
        locate: () => Promise.resolve(located),
        read: () => Promise.reject(new Error('unused')),
        latestPrompt: () => Promise.reject(new Error('unused')),
        inFlight: { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: () => Promise.resolve(flight) },
    };
}

const adapterFor = (reader: SessionReader): InFlightReader => new TranscriptInFlight(registryWith({ [reader.agent]: reader }));

test('a transcript that does not exist yet is not-started for a lane whose locating key is known', async () => {
    const reader = fakeReader('claude', unknown({ why: 'not-found', what: textOf('the transcript of sess-1') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.deepEqual(await adapterFor(reader).read(claude), { kind: 'not-started', why: 'the transcript of sess-1 not found' });
});

test('a lane without its locating key cannot tell, so it is unknown and not not-started', async () => {
    const reader = fakeReader('claude', unknown({ why: 'not-found', what: textOf('a session id for w1:p3') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.deepEqual(await adapterFor(reader).read(sessionless), { kind: 'unknown', why: 'a session id for w1:p3 not found' });
});

test('a claude lane locates by its session, not its working directory', async () => {
    const cwdOnly = laneFrom(seenLane({ paneId: 'w1:p6', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', cwd: '/repo' }));
    const reader = fakeReader('claude', unknown({ why: 'not-found', what: textOf('a session id for w1:p6') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.equal((await adapterFor(reader).read(cwdOnly)).kind, 'unknown');
});

test('a codex lane locates by its working directory, and a missing rollout is not-started', async () => {
    const reader = fakeReader('codex', unknown({ why: 'not-found', what: textOf('a codex rollout started in /repo') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.deepEqual(await adapterFor(reader).read(codex), { kind: 'not-started', why: 'a codex rollout started in /repo not found' });
});

test('a transcript that cannot be read is unknown, never not-started', async () => {
    const reader = fakeReader('claude', unknown({ why: 'unreadable', detail: causeOf('/projects') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.deepEqual(await adapterFor(reader).read(claude), { kind: 'unknown', why: 'unreadable: /projects' });
});

test('a located transcript reports its count of unfinished work', async () => {
    const reader = fakeReader('claude', { kind: 'located', source: sourcePathOf('/t/sess-1.jsonl') }, { kind: 'in-flight', count: runningOf(2), background: [] });
    assert.deepEqual(await adapterFor(reader).read(claude), { kind: 'count', count: countOf(2), background: [] });
});

test('a read that fails is unknown', async () => {
    const reader = fakeReader('claude', { kind: 'located', source: sourcePathOf('/t/sess-1.jsonl') }, unknown({ why: 'unreadable', detail: causeOf('tail') }));
    assert.deepEqual(await adapterFor(reader).read(claude), { kind: 'unknown', why: 'unreadable: tail' });
});

test('an agent with no reader of its own is unknown', async () => {
    const gemini = laneFrom(seenLane({ paneId: 'w1:p5', tabId: 'w1:t1', workspaceId: 'w1', agent: 'gemini', session: 's', cwd: '/repo' }));
    const reading = await new TranscriptInFlight(registryWith({})).read(gemini);
    assert.equal(reading.kind, 'unknown');
});

test('autocompact folds a not-started reading into unknown with the same words', async () => {
    const port: InFlightReader = { read: (): Promise<InFlightRead> => Promise.resolve({ kind: 'not-started', why: textOf('the transcript of sess-1 not found') }) };
    assert.deepEqual(await flightOf(port, claude), unreadable(flightReason(textOf('the transcript of sess-1 not found'))));
});

test('autocompact states a count as running', async () => {
    const port: InFlightReader = { read: (): Promise<InFlightRead> => Promise.resolve({ kind: 'count', count: countOf(3), background: [] }) };
    assert.deepEqual(await flightOf(port, claude), observedFrom(runningCount(countOf(3)), [], flightReason(textOf('3 running'))));
});
