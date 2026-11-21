import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sectionOf } from '@stateforge-labs/session-ledger/unstable/i18n/legacy.ts';
import { anchorSource, candidatesOf, clipHead, clipTurn, extractPiped, groundOf, idOf, marksOf, newest, notesOf, parseHidden, serializeHidden, touchedFiles } from '@stateforge-labs/session-ledger/unstable/recap/application/legacy.ts';
import { numbered } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-input.ts';
import { FULL_WRITER_VIEW, positiveCount } from '@stateforge-labs/session-ledger/unstable/recap/domain/writer-view.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { Entry, RecapInput } from '@stateforge-labs/session-ledger/unstable/ports/legacy.ts';

const NOW = 1_000_000;
const ZONE = 'UTC';

const input: RecapInput = {
    tab: { id: 'tab-1', now: NOW, zone: ZONE },
    agents: [],
    tasks: [],
    ledgers: [],
    notes: [{ agent: 'claude', kind: 'compaction', at: null, text: 'Build is green' }],
    transcripts: [{ agent: 'claude', entries: [{ role: 'user', text: 'Fix the CI' }] }],
};

test('the anchor source folds the transcript and notes into one searchable text', () => {
    assert.equal(anchorSource(input), 'Fix the CI Build is green');
});

test('candidates render as a candidates element, and none renders as empty', () => {
    assert.equal(candidatesOf(input), '');
    const withCandidate: RecapInput = {
        ...input,
        candidates: [{ section: 'next', text: 'bump to v2', why: 'asked', ref: 'src/a.ts', at: null, anchor: 'anchor', agent: 'claude', flagged: false }],
    };
    assert.match(candidatesOf(withCandidate), /<candidates>[\s\S]*bump to v2[\s\S]*<\/candidates>/u);
});

const edit = (text: string): Entry => ({ role: 'tool', kind: 'edit', text });

test('the touched files keep the last five distinct edits, newest last', () => {
    const entries = [edit('a.ts'), edit('b.ts'), edit('a.ts'), edit('c.ts'), edit('d.ts'), edit('e.ts'), edit('f.ts')];
    assert.deepEqual(touchedFiles(entries), ['a.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']);
    assert.deepEqual(touchedFiles([{ role: 'user', text: 'hello' }]), []);
});

test('the newest entries fit the budget and always keep at least one entry', () => {
    const lane = { agent: 'claude', entries: [{ role: 'user', text: 'old one' }, { role: 'agent', text: 'new' }] as const };
    assert.deepEqual(newest({ ...lane, entries: [...lane.entries] }, 4).entries.map((entry) => entry.text), ['new']);
    assert.deepEqual(newest({ ...lane, entries: [...lane.entries] }, 1000).entries.length, 2);
    assert.equal(newest({ ...lane, entries: [...lane.entries] }, 0).entries.length, 1);
});

test('the clip helpers keep the head and tail of a long turn and the head of a long value', () => {
    assert.deepEqual(clipTurn('agent', 'short'), { text: 'short', clipped: false });
    const long = `${'a'.repeat(900)}${'b'.repeat(900)}`;
    const clipped = clipTurn('agent', long);
    assert.equal(clipped.clipped, true);
    assert.ok(clipped.text.includes('[…]'));
    assert.deepEqual(clipHead('abcdef', 3), { text: 'abc', clipped: true });
    assert.deepEqual(clipHead('ab', 3), { text: 'ab', clipped: false });
});

test('the hidden counts serialize in section order and parse back', () => {
    const counts = new Map([['next', positiveCount(2)], ['goal', positiveCount(1)]] as const);
    const document = serializeHidden(new Map(counts));
    assert.equal(document, '\n <hidden section="goal" count="1"/>\n <hidden section="next" count="2"/>');
    assert.deepEqual([...parseHidden(document).entries()].map(([section, count]) => [section, Number(count)]), [['goal', 1], ['next', 2]]);
    assert.throws(() => parseHidden('<hidden section="goal" count="0"/>'));
});

test('a compacted mark becomes a lane mark, and an unknown time waits for the lane to advance', () => {
    const chunk = {
        kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], grew: false,
        position: { cursor: 4, tail: null },
        marks: [{ kind: 'compacted', at: null, tokensBefore: 10 }, { kind: 'compaction-failed', at: 5 }],
    } as const;
    const lane = { pane: brand<string, 'PaneId'>('p1') };
    assert.deepEqual(marksOf([{ lane, chunk }], NOW, true), [{ pane: 'p1', at: NOW, cursor: 4, tokensBefore: 10 }]);
    assert.deepEqual(marksOf([{ lane, chunk }], NOW, false), []);
});

test('the lane note helpers give ids by index and keep the newest note of each kind', () => {
    assert.equal(idOf(0), 'a1');
    assert.equal(idOf(2), 'a3');
    const lane = { pane: brand<string, 'PaneId'>('p1'), tab: brand<string, 'TabId'>('tab-1'), workspace: brand<string, 'WorkspaceId'>('w1'), agent: brand<string, 'AgentKind'>('claude'), status: 'working', session: null, cwd: null, title: null, since: null } as const;
    const cursor = { pane: 'p1', agent: 'claude', transcript: 't', cursor: 0, tail: null, title: null, lastPrompt: null, claudeRecap: 'Recap text' } as const;
    const chunk = { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, grew: false, position: { cursor: 0, tail: null }, notes: [
        { kind: 'compaction', at: 1, text: 'first' }, { kind: 'compaction', at: 2, text: 'second' },
    ] } as const;
    const notes = notesOf({ lane, cursor, chunk, fresh: true }, 'claude');
    assert.deepEqual(notes.map((note) => [note.kind, note.text]), [['away_summary', 'Recap text'], ['compaction', 'second']]);
});

test('the section headings map to section ids in English and Spanish, and unknown headings map to null', () => {
    assert.equal(sectionOf('## Waiting on you'), 'needs');
    assert.equal(sectionOf('## Próximos pasos'), 'next');
    assert.equal(sectionOf('## Goals'), 'goal');
    assert.equal(sectionOf('## Random'), null);
});

test('the ground of a recap names each task and extracting over it returns an outcome', async () => {
    const numbering = numbered([], [], false, FULL_WRITER_VIEW, NOW);
    const ground = groundOf({
        tab: 'tab-1', tasks: [{ id: 'task-1', name: 'CI', lanes: [] }], built: { input, numbering }, entries: [],
        ledger: { openOf: () => [], recentlyClosed: () => [], allOf: () => [] } as never, now: NOW, language: 'en',
    });
    assert.equal(ground.now, NOW);
    assert.deepEqual(ground.grounds.map((one) => one.key), ['task-1']);
    const summarizer = { backend: 'test', contract: { contract: 'free-text', enumerates: false, envScrub: [] }, write: async () => ({ kind: 'written', text: '', costUsd: 0 }) } as never;
    const request = { input, language: 'en', previousLanguage: 'en' };
    const result = await extractPiped(summarizer, request, ground, { pipeline: 'one', enumerator: null, log: () => {} });
    assert.ok(['ops', 'failed'].includes(result.kind));
});
