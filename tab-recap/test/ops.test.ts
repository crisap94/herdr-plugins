import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '#src/recap/domain/ops.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { factOf, runAt } from './fakes/facts.ts';

const add = (section: 'next' | 'goal' | 'decisions' | 'done', text: string, over: Partial<Operation & { op: 'add' }> = {}): Operation =>
    ({ op: 'add', section, text, why: null, ref: null, at: null, agent: null, ...over });

test('a fact over time: added at 10:00, updated at 11:00, closed as done at 12:00 — one fact, first 10:00, last 12:00', () => {
    const first = apply([], [add('next', 'Merge !34')], runAt(10));
    const [fact] = first.ledger;
    assert.ok(fact !== undefined);
    assert.equal(fact.firstAt, 10);
    const second = apply(first.ledger, [{ op: 'update', id: fact.id, text: 'Merge !34 after the pipeline', why: null }], runAt(11));
    const third = apply(second.ledger, [{ op: 'close', id: fact.id, why: 'done' }], runAt(12));
    assert.equal(third.ledger.length, 1);
    assert.deepEqual([third.ledger[0]?.firstAt, third.ledger[0]?.lastAt, third.ledger[0]?.state, third.ledger[0]?.closedWhy, third.ledger[0]?.closedAt], [10, 12, 'closed', 'done', 12]);
    assert.equal(third.ledger[0]?.text, 'Merge !34 after the pipeline');
});

test('closes run first, then updates, then adds: a close and an add of the same line are both applied', () => {
    const old = factOf('next', 'Run the tests', { firstAt: 1, lastAt: 1 });
    const result = apply([old], [add('next', 'Run the tests again'), { op: 'close', id: old.id, why: 'done' }], runAt(50));
    assert.deepEqual(result.refused, []);
    assert.deepEqual(result.ledger.map((fact) => [fact.text, fact.state]), [['Run the tests', 'closed'], ['Run the tests again', 'open']]);
    assert.deepEqual(result.changed.map((fact) => fact.text), ['Run the tests', 'Run the tests again']);
});

test('refusals: unknown id, closed fact (update and close), a decision without a why, a close without a reason', () => {
    const shut = factOf('done', 'Wrote the schema', { state: 'closed', closedWhy: 'merged', closedAt: 5 });
    const open = factOf('decisions', 'Keep SQLite');
    const ops: readonly Operation[] = [
        { op: 'close', id: 'f99', why: 'done' }, { op: 'close', id: shut.id, why: 'done' }, { op: 'update', id: shut.id, text: 'x', why: null },
        { op: 'close', id: open.id, why: null }, add('decisions', 'Leave the db tab alone'),
    ];
    const result = apply([shut, open], ops, runAt(60));
    assert.deepEqual(result.refused.map((r) => r.reason), ['unknown-id', 'closed', 'no-why', 'closed', 'no-why']);
    assert.deepEqual(result.changed, [], 'refused operations change nothing');
});

test('a second goal in one answer is refused; a goal add closes the open goal as superseded', () => {
    const goal = factOf('goal', 'Ship 2.0');
    const result = apply([goal], [add('goal', 'Ship 2.0 on Friday'), add('goal', 'Ship 3.0')], runAt(70));
    assert.deepEqual(result.refused.map((r) => r.reason), ['second-goal']);
    assert.deepEqual(result.ledger.map((fact) => [fact.text, fact.state, fact.closedWhy]), [['Ship 2.0', 'closed', 'superseded'], ['Ship 2.0 on Friday', 'open', null]]);
});

test('an add takes the writer\'s time when it is earlier than the run, never later', () => {
    const early = apply([], [add('done', 'Fixed the build', { at: 40 })], runAt(100)).ledger[0];
    const late = apply([], [add('done', 'Fixed the lint', { at: 400 })], runAt(100)).ledger[0];
    assert.deepEqual([early?.firstAt, early?.lastAt, late?.firstAt, late?.lastAt], [40, 100, 100, 100]);
});

test('an update of a decision keeps its why unless a new one is given; the language follows the run', () => {
    const decision = factOf('decisions', 'Keep SQLite', { why: 'one file to back up', language: 'en' });
    const kept = apply([decision], [{ op: 'update', id: decision.id, text: 'Keep SQLite for 2.0', why: null }], runAt(2000, { language: 'es' })).ledger[0];
    assert.deepEqual([kept?.why, kept?.language, kept?.lastAt, kept?.firstAt], ['one file to back up', 'es', 2000, 1000]);
});
