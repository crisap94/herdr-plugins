import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '#src/recap/domain/ops.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { factOf, runAt } from './fakes/facts.ts';

const add = (section: 'next' | 'goal' | 'decisions' | 'done' | 'now', text: string, over: Partial<Operation & { op: 'add' }> = {}): Operation =>
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

test('a now fact the answer did not add, update or close is closed superseded at the run\'s time; the ones it updated or re-added stay; other sections are untouched', () => {
    const [kept, updated, closed, stale] = ['Wiring the client', 'Running CI', 'Reviewing !34', 'Reading the logs'].map((text) => factOf('now', text, { firstAt: 1, lastAt: 1 }));
    const other = factOf('next', 'Canary at 5%', { firstAt: 1, lastAt: 1 });
    const ledger = [kept, updated, closed, stale, other].flatMap((fact) => (fact === undefined ? [] : [fact]));
    const result = apply(ledger, [{ op: 'update', id: updated?.id ?? '', text: 'Running CI on !35', why: null }, { op: 'close', id: closed?.id ?? '', why: 'done' }, add('now', 'Writing the tests')], runAt(60), true);
    const by = (text: string): string => { const fact = result.ledger.find((each) => each.text === text); return `${fact?.state}/${fact?.closedWhy}/${fact?.closedAt}`; };
    assert.equal(by('Wiring the client'), 'closed/superseded/60', 'not carried forward');
    assert.equal(by('Reading the logs'), 'closed/superseded/60');
    assert.equal(by('Running CI on !35'), 'open/null/null', 'updated');
    assert.equal(by('Reviewing !34'), 'closed/done/60', 'closed by the writer, not overwritten');
    assert.equal(by('Writing the tests'), 'open/null/null', 'added by this answer');
    assert.equal(by('Canary at 5%'), 'open/null/null', 'another section');
    assert.ok(result.changed.some((fact) => fact.text === 'Wiring the client'), 'the sweep is a change the store writes');
});

test('an answer with no operations closes nothing, a now fact included', () => {
    const now = factOf('now', 'Wiring the client', { firstAt: 1, lastAt: 1 });
    const result = apply([now], [], runAt(60), true);
    assert.deepEqual([result.ledger, result.changed], [[now], []]);
});

test('a now fact of the ledger is closed even when the only operation is an add in another section', () => {
    const now = factOf('now', 'Wiring the client', { firstAt: 1, lastAt: 1 });
    const result = apply([now], [add('next', 'Canary at 5%')], runAt(60), true);
    assert.equal(result.ledger[0]?.closedWhy, 'superseded');
});

test('without the sweep (the curator\'s merges, the import) a now fact is never closed by an answer that does not name it', () => {
    const now = factOf('now', 'Wiring the client', { firstAt: 1, lastAt: 1 });
    assert.deepEqual(apply([now], [add('next', 'Canary at 5%')], runAt(60)).ledger.map((fact) => fact.state), ['open', 'open']);
});
