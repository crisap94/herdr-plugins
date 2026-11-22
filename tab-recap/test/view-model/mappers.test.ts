import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messagesFor } from '#src/i18n/index.ts';
import type { CompactionRecord } from '#src/ports/compaction-records.ts';
import { recapRunningOf, type LaneCursor, type TabRecap } from '#src/ports/recap-records.ts';
import type { TabLane } from '#src/ports/tab-views.ts';
import type { ColumnView } from '#src/recap/render/present.ts';
import { sessionFactsOf } from '#src/recap/domain/session-facts.ts';
import { columnTaskOf, columnViewOf, compactionRowOf, recapColumnOf, rowOf, webOf, wordingOf } from '#src/view-model/column.ts';
import { sessionRecapOf } from '#src/view-model/expanded.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { agentKind, paneId, tabId } from '#src/recap/domain/ids.ts';
import { instant } from '#src/recap/domain/time.ts';
import { sourcePathOf, cursorOf } from '#src/ports/transcripts.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import { paneIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

const lane = (pane: string, status: string): TabLane => ({ pane, agent: 'claude', status, title: `title ${pane}`, cwd: '/repo', web: { base: 'https://gitlab.example/repo', forge: 'gitlab', branch: 'main' } });

const cursor = (pane: string, transcript: string): LaneCursor => ({ pane: paneId(pane), agent: agentKind('claude'), transcript: sourcePathOf(transcript), cursor: cursorOf(4), tail: null, title: null, lastPrompt: textOf('ship it'), claudeRecap: textOf('harness words') });

const recap: TabRecap = {
    tab: tabId('t1'),
    lanes: [cursor('p1', '/logs/p1.jsonl'), cursor('p2', 'screen:p2')],
    tasks: [{ id: textOf('k1'), name: textOf('build'), lanes: [paneIdOf('p1'), paneIdOf('p2')], sections: null, markdown: textOf('# build') }],
    at: instant(100),
    running: recapRunningOf(true),
    backend: textOf('claude'),
    error: null,
    costUsd: usdOf(0.5),
    language: textOf('en'),
};

const record: CompactionRecord = {
    id: 'cmp_1', tab: 't1', pane: 'p1', agent: 'claude', stage: 'compacting', brief: 'written', writer: 'claude', templateWhy: null,
    startedAt: 10, stageAt: 20, finishedAt: null, tokensBefore: countOf(900), tokensAfter: null, tookMs: null, retried: false, queued: false, why: null, origin: 'auto',
};

test('rowOf: the lane fields, its state, and the harness recap from the cursor', () => {
    const row = rowOf(lane('p1', 'working'), cursor('p1', '/logs/p1.jsonl'));
    assert.deepEqual(row, {
        id: 'p1', agent: 'claude', state: 'working', title: 'title p1', cwd: '/repo',
        web: { base: 'https://gitlab.example/repo', forge: 'gitlab', branch: 'main' },
        fromScreen: false, harnessRecap: 'harness words',
    });
});

test('rowOf: idle and done stay distinct states', () => {
    assert.equal(rowOf(lane('p1', 'idle'), undefined).state, 'idle');
    assert.equal(rowOf(lane('p1', 'done'), undefined).state, 'done');
});

test('rowOf: a screen-source cursor gives fromScreen true; no cursor gives false and no harness recap', () => {
    assert.equal(rowOf(lane('p2', 'idle'), cursor('p2', 'screen:p2')).fromScreen, true);
    const bare = rowOf(lane('p2', 'idle'), undefined);
    assert.equal(bare.fromScreen, false);
    assert.equal(bare.harnessRecap, null);
});

test('webOf: copies base, forge and branch', () => {
    assert.deepEqual(webOf({ base: 'https://github.example/r', forge: 'github', branch: null }), { base: 'https://github.example/r', forge: 'github', branch: null });
});

test('columnTaskOf and recapColumnOf: task lanes become members, the run fields are copied', () => {
    const task = recap.tasks[0];
    assert.ok(task !== undefined);
    assert.deepEqual(columnTaskOf(task), { name: 'build', members: ['p1', 'p2'], sections: null, markdown: '# build' });
    assert.deepEqual(recapColumnOf(recap), { tasks: [{ name: 'build', members: ['p1', 'p2'], sections: null, markdown: '# build' }], at: 100, running: true, backend: 'claude', error: null });
});

test('compactionRowOf: copies the fields the column reads', () => {
    assert.deepEqual(compactionRowOf(record), { pane: 'p1', stage: 'compacting', brief: 'written', writer: 'claude', why: null, stageAt: 20, queued: false, tokensBefore: countOf(900), tokensAfter: null, tookMs: null });
});

test('wordingOf: hands back the same messages', () => {
    const messages = messagesFor('en');
    assert.equal(wordingOf(messages), messages);
});

test('columnViewOf: rows matched to cursors by pane, the recap mapped, messages become the wording', () => {
    const messages = messagesFor('es');
    const view: ColumnView = {
        tab: { tab: 't1', column: null, lanes: [lane('p2', 'blocked'), lane('p3', 'done')], at: 5, daemonVersion: '1.2.0' },
        recap, notes: new Map(), warnings: ['careful'], now: 200, messages, version: '1.3.0', compactions: [record],
    };
    const mapped = columnViewOf(view, view.messages);
    assert.deepEqual(mapped.rows?.map((row) => [row.id, row.state, row.fromScreen, row.harnessRecap]), [['p2', 'blocked', true, 'harness words'], ['p3', 'done', false, null]]);
    assert.equal(mapped.daemonVersion, '1.2.0');
    assert.deepEqual(mapped.recap, recapColumnOf(recap));
    assert.equal(mapped.wording, messages);
    assert.equal(mapped.version, '1.3.0');
    assert.deepEqual(mapped.compactions, [compactionRowOf(record)]);
    assert.deepEqual(mapped.warnings, ['careful']);
    assert.equal(mapped.now, 200);
    assert.equal('style' in mapped, false);
});

test('columnViewOf: no tab gives no rows, no recap gives no column recap', () => {
    const mapped = columnViewOf({ tab: null, recap: null, notes: new Map(), warnings: [], now: 0, messages: messagesFor('en') }, messagesFor('en'));
    assert.equal(mapped.rows, null);
    assert.equal(mapped.recap, null);
    assert.equal(mapped.daemonVersion, null);
});

test('sessionRecapOf: copies every session fact', () => {
    const facts = sessionFactsOf({ firstSeen: 1000, now: 4000, runs: { focused: 2 }, compactions: [{ tokensBefore: countOf(10), tokensAfter: countOf(4), origin: 'auto' }], lanes: [], webs: [{ base: 'https://gitlab.example/g/repo', branch: 'dev' }], edits: [{ path: 'a.ts', count: 3 }] });
    assert.deepEqual(sessionRecapOf(facts), facts);
});
