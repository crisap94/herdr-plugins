import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Chunk } from '#src/ports/transcripts.ts';
import { inputOf } from '#src/recap/application/recap-input.ts';
import { writerContext } from '#src/recap/application/writer-context.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { FULL_WRITER_VIEW } from '#src/recap/domain/writer-view.ts';
import { NO_REPOS, requestOf } from '#test/support.ts';
import { factOf } from './fakes/facts.ts';

const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' });
const cursor = { pane: 'w1:p1', agent: 'claude', transcript: '/t', cursor: 5, tail: null, title: null, lastPrompt: null, claudeRecap: 'stored' };
const chunk = (notes: Chunk['notes']): Chunk => ({ kind: 'chunk', entries: [], notes, title: null, lastPrompt: null, claudeRecap: null, position: { cursor: 9, tail: null }, grew: true });

test('only the newest note of each kind is sent; a first read adds the stored away summary only when the chunk has none', async () => {
    const notes = [{ kind: 'away_summary' as const, at: 1, text: 'old away' }, { kind: 'compaction' as const, at: 2, text: 'compacted' }, { kind: 'away_summary' as const, at: 3, text: 'new away' }];
    const world = { tab: 'w1:t1', repos: NO_REPOS, now: 10, tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], facts: [] };
    const seen = await inputOf([{ lane, cursor, chunk: chunk(notes), fresh: false }], world);
    assert.deepEqual(seen.input.notes.map((note) => [note.kind, note.text]), [['compaction', 'compacted'], ['away_summary', 'new away']]);
    const first = await inputOf([{ lane, cursor, chunk: chunk([]), fresh: true }], world);
    assert.deepEqual(first.input.notes.map((note) => [note.kind, note.text, note.at]), [['away_summary', 'stored', null]]);
    const covered = await inputOf([{ lane, cursor, chunk: chunk(notes), fresh: true }], world);
    assert.equal(covered.input.notes.filter((note) => note.kind === 'away_summary').length, 1);
});

test('full writer view keeps the default recap input byte-for-byte', async () => {
    const world = { tab: 'w1:t1', repos: NO_REPOS, now: 10, tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], facts: [{ key: 't1', open: [factOf('done', 'A complete fact')], closed: [] }] };
    const seen = [{ lane, cursor, chunk: chunk([]), fresh: false }];
    const regular = await inputOf(seen, world);
    const full = await inputOf(seen, { ...world, writerView: FULL_WRITER_VIEW });
    assert.equal(writerContext({ ...requestOf(), input: regular.input }), writerContext({ ...requestOf(), input: full.input }));
});
