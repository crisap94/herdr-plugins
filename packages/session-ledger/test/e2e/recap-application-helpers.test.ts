import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sectionOf } from '@stateforge-labs/session-ledger/unstable/i18n/sections.ts';
import { textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { anchorSource } from '@stateforge-labs/session-ledger/unstable/recap/application/anchor-source.ts';
import { ADVANCED, marksOf, NOT_ADVANCED } from '@stateforge-labs/session-ledger/unstable/recap/application/boundaries.ts';
import { groundOf } from '@stateforge-labs/session-ledger/unstable/recap/application/extract-ground.ts';
import { extractPiped } from '@stateforge-labs/session-ledger/unstable/recap/application/extract-pipeline.ts';
import { parseHidden, serializeHidden } from '@stateforge-labs/session-ledger/unstable/recap/application/hidden-codec.ts';
import { touchedFiles } from '@stateforge-labs/session-ledger/unstable/recap/application/lane-hints.ts';
import { FRESH, inputOf, SEEN_BEFORE } from '@stateforge-labs/session-ledger/unstable/recap/application/recap-input.ts';
import { CONTEXT_CHARS, reconcileRequest } from '@stateforge-labs/session-ledger/unstable/recap/application/reconcile.ts';
import { candidatesOf } from '@stateforge-labs/session-ledger/unstable/recap/application/writer-candidates.ts';
import { numbered, severalOf } from '@stateforge-labs/session-ledger/unstable/recap/application/ledger-input.ts';
import { FULL_WRITER_VIEW, positiveCount } from '@stateforge-labs/session-ledger/unstable/recap/domain/writer-view.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { Lane } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';
import type { Entry, RecapInput } from '@stateforge-labs/session-ledger/unstable/ports/legacy.ts';

const NOW = instant(1_000_000);
const text = brand<string, 'Text'>;
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

const edit = (path: string): Entry => ({ role: 'tool', kind: 'edit', text: path });

test('the touched files keep the last five distinct edits, newest last', () => {
    const entries = [edit('a.ts'), edit('b.ts'), edit('a.ts'), edit('c.ts'), edit('d.ts'), edit('e.ts'), edit('f.ts')];
    assert.deepEqual(touchedFiles(entries), ['a.ts', 'c.ts', 'd.ts', 'e.ts', 'f.ts']);
    assert.deepEqual(touchedFiles([{ role: 'user', text: 'hello' }]), []);
});

const big = (word: string): Entry => ({ role: 'agent', text: word.repeat(Math.floor(Number(CONTEXT_CHARS) * 2 / 3)) });

const kept = (entries: readonly Entry[]): readonly string[] =>
    reconcileRequest({ input: { ...input, transcripts: [{ agent: 'claude', entries }] }, language: 'en', previousLanguage: 'en' }, []).input.transcripts.flatMap((lane) => lane.entries.map((entry) => entry.text.slice(0, 1)));

test('the reconcile request keeps the newest entries within the context budget and always at least one entry', () => {
    assert.deepEqual(kept([big('x'), big('y')]), ['y']);
    assert.deepEqual(kept([{ role: 'user', text: 'old' }, { role: 'agent', text: 'new' }]), ['o', 'n']);
    assert.equal(kept([big('z')]).length, 1);
});

test('the hidden counts serialize in section order and parse back', () => {
    const counts = new Map([['next', positiveCount(2)], ['goal', positiveCount(1)]] as const);
    const document = serializeHidden(new Map(counts));
    assert.equal(document, '\n <hidden section="goal" count="1"/>\n <hidden section="next" count="2"/>');
    assert.deepEqual([...parseHidden(document).entries()].map(([section, count]) => [section, Number(count)]), [['goal', 1], ['next', 2]]);
    assert.throws(() => parseHidden(text('<hidden section="goal" count="0"/>')));
});

test('a compacted mark becomes a lane mark, and an unknown time waits for the lane to advance', () => {
    const chunk = {
        kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, notes: [], grew: false,
        position: { cursor: 4, tail: null },
        marks: [{ kind: 'compacted', at: null, tokensBefore: 10 }, { kind: 'compaction-failed', at: 5 }],
    } as const;
    const lane = { pane: brand<string, 'PaneId'>('p1') };
    assert.deepEqual(marksOf([{ lane, chunk }], NOW, ADVANCED), [{ pane: 'p1', at: NOW, cursor: 4, tokensBefore: 10 }]);
    assert.deepEqual(marksOf([{ lane, chunk }], NOW, NOT_ADVANCED), []);
});

const laneOf = (pane: string): Lane => ({ pane: brand<string, 'PaneId'>(pane), tab: brand<string, 'TabId'>('tab-1'), workspace: brand<string, 'WorkspaceId'>('w1'), agent: brand<string, 'AgentKind'>('claude'), status: 'working', session: null, cwd: null, title: null, since: null });

test('the recap input numbers agents by index and keeps the newest note of each kind', async () => {
    const cursor = { pane: 'p1', agent: 'claude', transcript: 't', cursor: 0, tail: null, title: null, lastPrompt: null, claudeRecap: 'Recap text' } as const;
    const chunk = { kind: 'chunk', entries: [], title: null, lastPrompt: null, claudeRecap: null, grew: false, position: { cursor: 0, tail: null }, notes: [
        { kind: 'compaction', at: 1, text: 'first' }, { kind: 'compaction', at: 2, text: 'second' },
    ] } as const;
    const world = { tab: text('tab-1'), repos: {} as never, now: NOW, tasks: [], facts: [], writerView: FULL_WRITER_VIEW };
    const built = await inputOf([{ lane: laneOf('p1'), cursor, chunk, fresh: FRESH }, { lane: laneOf('p2'), cursor, chunk, fresh: SEEN_BEFORE }], world);
    assert.deepEqual(built.input.agents.map((agent) => agent.id), ['a1', 'a2']);
    assert.deepEqual(built.input.transcripts.map((one) => one.agent), ['a1', 'a2']);
    assert.deepEqual(built.input.notes.filter((note) => note.agent === 'a1').map((note) => [note.kind, note.text]), [['away_summary', 'Recap text'], ['compaction', 'second']]);
    assert.deepEqual(built.input.notes.filter((note) => note.agent === 'a2').map((note) => [note.kind, note.text]), [['compaction', 'second']]);
});

test('the section headings map to section ids in English and Spanish, and unknown headings map to null', () => {
    assert.equal(sectionOf(textOf('## Waiting on you')), 'needs');
    assert.equal(sectionOf(textOf('## Próximos pasos')), 'next');
    assert.equal(sectionOf(textOf('## Goals')), 'goal');
    assert.equal(sectionOf(textOf('## Random')), null);
});

test('the ground of a recap names each task and extracting over it returns an outcome', async () => {
    const numbering = numbered([], [], severalOf(false), FULL_WRITER_VIEW, NOW);
    const ground = groundOf({
        tab: text('tab-1'), tasks: [{ id: 'task-1', name: 'CI', lanes: [] }], built: { input, numbering }, entries: [],
        ledger: { openOf: () => [], recentlyClosed: () => [], allOf: () => [] } as never, now: NOW, language: text('en'),
    });
    assert.equal(ground.now, NOW);
    assert.deepEqual(ground.grounds.map((one) => one.key), ['task-1']);
    const summarizer = { backend: 'test', contract: { contract: 'free-text', enumerates: false, envScrub: [] }, write: async () => ({ kind: 'written', text: '', costUsd: 0 }) } as never;
    const request = { input, language: 'en', previousLanguage: 'en' };
    const result = await extractPiped(summarizer, request, ground, { pipeline: 'one', enumerator: null, log: () => {} });
    assert.ok(['ops', 'failed'].includes(result.kind));
});
