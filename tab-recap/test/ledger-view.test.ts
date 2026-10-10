import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numbered, writerFacts } from '#src/recap/application/ledger-input.ts';
import { factOf } from './fakes/facts.ts';
import { agentOf } from '#test/support.ts';

const view = { kind: 'pruned', keepNewest: 2, nextHours: 24 } as const;
const HOUR = 3_600_000;
const NOW = 100 * HOUR;
const facts = [
    factOf('goal', 'goal', { lastAt: 1 }), factOf('now', 'now', { lastAt: 2 }), factOf('needs', 'needs', { lastAt: 3 }),
    factOf('decisions', 'decision', { lastAt: 4 }), factOf('rules', 'rule', { lastAt: 5 }),
    ...Array.from({ length: 4 }, (_, at) => factOf('done', `done-${at}`, { lastAt: 10 + at })),
    ...Array.from({ length: 4 }, (_, at) => factOf('links', `link-${at}`, { lastAt: 20 + at })),
    factOf('next', 'old next', { lastAt: NOW - 25 * HOUR }), factOf('next', 'recent next 1', { lastAt: NOW - 3 * HOUR }), factOf('next', 'recent next 2', { lastAt: NOW - 2 * HOUR }), factOf('next', 'recent next 3', { lastAt: NOW - HOUR }),
];

test('pruned writer view keeps all protected sections and newest limited facts, with section hidden counts', () => {
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
