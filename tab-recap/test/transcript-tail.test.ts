// The newest turns of a task's lanes, through each lane's own reader, with no position moved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CustomHarness } from '#src/adapters/custom-harness.ts';
import { HarnessEnumerator } from '#src/adapters/harness-enumerator.ts';
import { HermesHarness } from '#src/adapters/hermes-harness.ts';
import { ARGV_BYTES } from '#src/adapters/recap-prompt.ts';
import type { LaneCursor } from '#src/ports/recap-records.ts';
import { UNREAD } from '#src/ports/transcripts.ts';
import type { ChunkResult, Entry, Position, Transcripts } from '#src/ports/transcripts.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { tailOf } from '#src/recap/application/transcript-tail.ts';
import { cursor } from '#test/db/support.ts';

const reader = (agent: string, bySource: Readonly<Record<string, readonly Entry[]>>, asked: { source: string; was: Position }[] = []): Transcripts => ({
    agent,
    locate: () => Promise.resolve(unknown({ why: 'not-found', what: 'x' })),
    latestPrompt: () => Promise.resolve({ kind: 'prompt', text: null }),
    read: (source, was): Promise<ChunkResult> => {
        asked.push({ source, was });
        const entries = bySource[source];
        return Promise.resolve(entries === undefined ? unknown({ why: 'unreadable', detail: source }) : { kind: 'chunk', entries, title: null, lastPrompt: null, claudeRecap: null, notes: [], position: { cursor: 9, tail: null }, grew: true });
    },
});
const lane = (pane: string, agent: string, transcript: string): LaneCursor => ({ ...cursor(pane), agent, transcript });
const entry = (text: string, at?: number): Entry => ({ role: 'agent', text, ...(at === undefined ? {} : { at }) });

test('the lanes\' newest turns are read from the start of what each reader keeps (its own budget), merged by time; a lane with no source or an unreadable one adds nothing', async () => {
    const asked: { source: string; was: Position }[] = [];
    const readers = [reader('claude', { '/a.jsonl': [entry('a1', 1), entry('a2', 5)] }, asked), reader('*', { 'screen:p3': [entry('s1', 3)] }, asked)];
    const tail = await tailOf(readers, [lane('p1', 'claude', '/a.jsonl'), lane('p2', 'claude', ''), lane('p3', 'hermes', 'screen:p3'), lane('p4', 'claude', '/gone.jsonl')]);
    assert.deepEqual(tail.map((each) => each.text), ['a1', 's1', 'a2']);
    assert.ok(asked.every((each) => each.was === UNREAD), 'no position is moved');
    assert.deepEqual(await tailOf([], [lane('p1', 'claude', '/a.jsonl')]), []);
    assert.deepEqual((await tailOf([reader('claude', { '/a.jsonl': [entry('x'), entry('y')] })], [lane('p1', 'claude', '/a.jsonl')])).map((each) => each.text), ['x', 'y'], 'one lane keeps its own order');
});

test('the enumeration is a job on a harness: its instructions follow the document, and a document too long for an argument is refused', async () => {
    const echo = new CustomHarness('node -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000);
    const enumerator = new HarnessEnumerator(echo, { model: '', effort: 'low' });
    assert.equal(enumerator.job, 'custom · low');
    const written = await enumerator.write('<enumerate_input version="1"/>');
    assert.ok(written.kind === 'enumerated' && written.text.startsWith('<enumerate_input') && written.text.includes('Copy, never paraphrase.'));
    const refused = await new HarnessEnumerator(new HermesHarness(process.cwd(), 1), { model: '', effort: 'low' }).write('x'.repeat(ARGV_BYTES));
    assert.ok(isUnknown(refused) && refused.why.why === 'unreadable');
});
