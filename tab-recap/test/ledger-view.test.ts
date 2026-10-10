import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbered, writerFacts } from '#src/recap/application/ledger-input.ts';
import { inputOf } from '#src/recap/application/recap-input.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { keepNewestOf, nextHoursOf, prunedWriterView } from '#src/recap/domain/writer-view.ts';
import { factOf } from './fakes/facts.ts';
import { agentOf, NO_REPOS } from '#test/support.ts';

const view = prunedWriterView(keepNewestOf(2), nextHoursOf(24));
const wide = prunedWriterView(keepNewestOf(10), nextHoursOf(24));
const lane = laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' });
const cursor = { pane: 'w1:p1', agent: 'claude', transcript: '/t', cursor: 5, tail: null, title: null, lastPrompt: null, claudeRecap: null };
const HOUR = 3_600_000;
const NOW = 100 * HOUR;
const facts = [
    factOf('goal', 'goal', { lastAt: 1 }), factOf('now', 'now', { lastAt: 2 }), factOf('needs', 'needs', { lastAt: 3 }),
    factOf('decisions', 'decision', { lastAt: 4 }), factOf('rules', 'rule', { lastAt: 5 }),
    ...Array.from({ length: 4 }, (_, at) => factOf('done', `done-${at}`, { lastAt: 10 + at })),
    ...Array.from({ length: 4 }, (_, at) => factOf('links', `link-${at}`, { lastAt: 20 + at })),
    factOf('next', 'old next', { lastAt: NOW - 25 * HOUR }), factOf('next', 'recent next 1', { lastAt: NOW - 3 * HOUR }), factOf('next', 'recent next 2', { lastAt: NOW - 2 * HOUR }), factOf('next', 'recent next 3', { lastAt: NOW - HOUR }),
];

test('the view keeps every needs, decision, goal and rule fact, and the newest K of done, links and next', () => {
    const result = writerFacts(facts, view, NOW);
    assert.deepEqual(result.shown.filter((fact) => ['goal', 'now', 'needs', 'decisions', 'rules'].includes(fact.section)).map((fact) => fact.text), ['goal', 'now', 'needs', 'decision', 'rule']);
    assert.deepEqual(result.shown.filter((fact) => fact.section === 'done').map((fact) => fact.text), ['done-2', 'done-3']);
    assert.deepEqual(result.shown.filter((fact) => fact.section === 'links').map((fact) => fact.text), ['link-2', 'link-3']);
    assert.deepEqual(result.shown.filter((fact) => fact.section === 'next').map((fact) => fact.text), ['recent next 2', 'recent next 3']);
    assert.deepEqual([...result.hidden].map(([section, count]) => [section, count]), [['done', 2], ['next', 2], ['links', 2]]);
});

test('numbering gives ids only to shown and closed facts', () => {
    const all = facts.filter((fact) => fact.state === 'open');
    const closed = [factOf('done', 'closed', { state: 'closed', closedWhy: 'done' })];
    const result = numbered([{ key: 't1', open: all, closed }], [agentOf('a1')], false, view, NOW);
    const ledger = result.ledgers.at(0);
    assert.ok(ledger);
    assert.equal(ledger.facts.some((fact) => fact.text === 'done-0'), false);
    assert.equal(ledger.facts.find((fact) => fact.text === 'closed')?.id, 'f12');
    assert.equal(result.shown.get('t1')?.size, ledger.facts.length);
});

const nextFacts = [
    factOf('next', 'older than the window', { lastAt: NOW - 25 * HOUR }),
    factOf('next', 'on the boundary', { lastAt: NOW - 24 * HOUR }),
    factOf('next', 'just inside', { lastAt: NOW - 24 * HOUR + 60_000 }),
    factOf('next', 'recent', { lastAt: NOW - HOUR }),
];

test('the next window hides facts older than its hours, keeps a fact exactly at the boundary, and counts the hidden ones', () => {
    const result = writerFacts(nextFacts, wide, NOW);
    assert.deepEqual(result.shown.map((fact) => fact.text), ['on the boundary', 'just inside', 'recent']);
    assert.deepEqual([...result.hidden], [['next', 1]]);
});

test('the writer input applies the next window at the tab clock, so an old next fact is neither shown nor numbered', async () => {
    const built = await inputOf([{ lane, cursor, chunk: null, fresh: false }], {
        tab: 'w1:t1', repos: NO_REPOS, now: NOW, tasks: [{ id: 't1', name: '', lanes: ['w1:p1'] }],
        facts: [{ key: 't1', open: nextFacts, closed: [] }], writerView: wide,
    });
    const ledger = built.input.ledgers.at(0);
    assert.ok(ledger);
    assert.deepEqual(ledger.facts.map((fact) => fact.text), ['on the boundary', 'just inside', 'recent']);
    assert.equal(ledger.hidden?.get('next'), 1);
});
