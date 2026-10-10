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
const at = (clock: string): number => Date.parse(`2026-10-06T${clock}:00Z`);

test('only the newest note of each kind is sent; a first read adds the stored away summary only when the chunk has none', async () => {
    const notes = [{ kind: 'away_summary' as const, at: 1, text: 'old away' }, { kind: 'compaction' as const, at: 2, text: 'compacted' }, { kind: 'away_summary' as const, at: 3, text: 'new away' }];
    const world = { tab: 'w1:t1', repos: NO_REPOS, now: 10, tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], facts: [], writerView: FULL_WRITER_VIEW };
    const seen = await inputOf([{ lane, cursor, chunk: chunk(notes), fresh: false }], world);
    assert.deepEqual(seen.input.notes.map((note) => [note.kind, note.text]), [['compaction', 'compacted'], ['away_summary', 'new away']]);
    const first = await inputOf([{ lane, cursor, chunk: chunk([]), fresh: true }], world);
    assert.deepEqual(first.input.notes.map((note) => [note.kind, note.text, note.at]), [['away_summary', 'stored', null]]);
    const covered = await inputOf([{ lane, cursor, chunk: chunk(notes), fresh: true }], world);
    assert.equal(covered.input.notes.filter((note) => note.kind === 'away_summary').length, 1);
});

test('full writer view matches the stored ledger output for a fixture with several sections and closed facts', async () => {
    const world = {
        tab: 'w1:t1', repos: NO_REPOS, now: at('03:05'), tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], writerView: FULL_WRITER_VIEW,
        facts: [{ key: 't1', open: [
            factOf('goal', 'Ship the release', { firstAt: at('02:40'), lastAt: at('03:00') }),
            factOf('decisions', 'Keep SQLite', { why: 'one file to back up', firstAt: at('02:42'), lastAt: at('03:02') }),
            factOf('done', 'Run the checks', { firstAt: at('02:45'), lastAt: at('02:55') }),
        ], closed: [factOf('done', 'Old test passed', { state: 'closed', closedWhy: 'done', closedAt: at('02:50'), firstAt: at('02:46'), lastAt: at('02:50') })] }],
    };
    const seen = [{ lane, cursor, chunk: chunk([]), fresh: false }];
    const full = await inputOf(seen, world);
    const request = { ...requestOf(), input: { ...full.input, tab: { ...full.input.tab, zone: 'UTC' } } };
    assert.equal(writerContext(request), `<recap_input version="2">
<tab id="w1:t1" now="2026-10-06T03:05:00Z" zone="UTC">
<agent id="a1" kind="claude" label="" pane="w1:p1"/>
</tab>
<ledger>
 <fact id="f1" section="done" first="02:45" last="02:55">Run the checks</fact>
 <fact id="f2" section="goal" first="02:40" last="03:00">Ship the release</fact>
 <fact id="f3" section="decisions" first="02:42" last="03:02" why="one file to back up">Keep SQLite</fact>
 <fact id="f4" section="done" state="closed" first="02:46" last="02:50" closed="done">Old test passed</fact>
</ledger>
<transcript agent="a1"/>
</recap_input>`);
});

test('full writer view sends forty open done facts without a hidden element', async () => {
    const open = Array.from({ length: 40 }, (_, index) => factOf('done', `Completed change ${index + 1}`, { firstAt: index + 1, lastAt: index + 1 }));
    const built = await inputOf([{ lane, cursor, chunk: chunk([]), fresh: false }], {
        tab: 'w1:t1', repos: NO_REPOS, now: 10, tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }], facts: [{ key: 't1', open, closed: [] }], writerView: FULL_WRITER_VIEW,
    });
    const document = writerContext({ ...requestOf(), input: built.input });
    assert.equal((document.match(/<fact /gu) ?? []).length, 40);
    assert.doesNotMatch(document, /<hidden /u);
});
