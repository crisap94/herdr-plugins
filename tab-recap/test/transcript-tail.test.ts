import { choice, customHarness } from '#test/fakes/harness-runtime.ts';
import { test } from 'node:test';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import assert from 'node:assert/strict';
import { HarnessEnumerator } from '#src/adapters/job/enumerator.ts';
import type { SessionCursor } from '@stateforge-labs/session-ledger';
import { UNREAD, cursorOf, grewOf, sourcePathOf } from '@stateforge-labs/session-ledger';
import type { ChunkResult, Entry, Position } from '@stateforge-labs/session-ledger';
import type { LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { unknown } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import { tailOf } from '#src/recap/application/transcript-tail.ts';
import { SCREEN_READER_ID } from '#src/adapters/transcripts/screen.ts';
import { cursor } from '#test/db/support.ts';
import { must } from '@stateforge-labs/session-ledger';
import { parseText, textOf } from '@stateforge-labs/session-ledger';
import { agentKind } from '#test/support/ids.ts';
import { instant } from '@stateforge-labs/session-ledger';

const reader = (agent: string, bySource: Readonly<Record<string, readonly Entry[]>>, asked: { source: string; was: Position }[] = []): SessionReader => ({
    agent: agentKind(agent),
    inFlight: { kind: 'unsupported', why: 'unregistered-reader' },
    locate: () => Promise.resolve(unknown({ why: 'not-found', what: textOf('x') })),
    latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source, was): Promise<ChunkResult> => {
        asked.push({ source, was });
        const entries = bySource[source];
        return Promise.resolve(entries === undefined ? unknown({ why: 'unreadable', detail: causeOf(source) }) : { kind: 'chunk', entries, title: null, lastPrompt: null, harnessRecap: null, notes: [], position: { cursor: cursorOf(9), tail: null }, grew: grewOf(true) });
    },
});
const lane = (pane: string, agent: string, transcript: string): SessionCursor => ({ ...cursor(pane), agent: agentKind(agent), transcript: sourcePathOf(transcript) });
const entry = (text: string, at?: number): Entry => ({ role: 'agent', text: textOf(text), ...(at === undefined ? {} : { at: instant(at) }) });

test('the lanes\' newest turns are read from the start of what each reader keeps (its own budget), merged by time; a lane with no source or an unreadable one adds nothing', async () => {
    const asked: { source: string; was: Position }[] = [];
    const readers = registryWith({ claude: reader('claude', { '/a.jsonl': [entry('a1', 1), entry('a2', 5)] }, asked) }, reader(SCREEN_READER_ID, { 'screen:p3': [entry('s1', 3)] }, asked));
    const tail = await tailOf(readers, [lane('p1', 'claude', '/a.jsonl'), lane('p2', 'claude', ''), lane('p3', 'gemini', 'screen:p3'), lane('p4', 'claude', '/gone.jsonl')]);
    assert.deepEqual(tail.map((each) => each.text), ['a1', 's1', 'a2']);
    assert.ok(asked.every((each) => each.was === UNREAD), 'no position is moved');
    assert.deepEqual(await tailOf(registryWith({}), [lane('p1', 'claude', '/a.jsonl')]), []);
    assert.deepEqual((await tailOf(registryWith({ claude: reader('claude', { '/a.jsonl': [entry('x'), entry('y')] }) }), [lane('p1', 'claude', '/a.jsonl')])).map((each) => each.text), ['x', 'y'], 'one lane keeps its own order');
});

test('the enumeration is a job on a harness: its instructions follow the document', async () => {
    const echo = customHarness('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000);
    const enumerator = new HarnessEnumerator(echo, choice('', 'low'));
    assert.equal(enumerator.job, 'custom · low');
    const written = await enumerator.write(must(parseText('<enumerate_input version="1"/>')));
    assert.ok(written.kind === 'enumerated' && written.text.startsWith('<enumerate_input') && written.text.includes('Copy, never paraphrase.'));
});
