import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAnswer, WHY_WORDS, type Resolving } from '@stateforge-labs/session-ledger/unstable/recap/application/ops-answer.ts';
import { forTask, judge, keptOf, refusedIn, retryFor, type TaskGround } from '@stateforge-labs/session-ledger/unstable/recap/application/ops-gating.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import type { Fact } from '@stateforge-labs/session-ledger/unstable/recap/domain/fact.ts';
import type { Operation } from '@stateforge-labs/session-ledger/unstable/recap/domain/ops.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { InputFact } from '@stateforge-labs/session-ledger/unstable/ports/recap-input.ts';

const text = brand<string, 'Text'>;
const count = brand<number, 'Count'>;

const resolving: Resolving = { tasks: [text('t1'), text('t2')], agents: [], taskOf: new Map([[text('f1'), text('t2')]]), turns: [], clock: { now: instant(1_700_000_000_000), zone: text('UTC') } };

test('an answer parses adds, updates and closes, routes them to their task and lists what it could not read', () => {
    const raw = JSON.stringify({ ops: [
        { op: 'add', section: 'next', text: 'ship the uploader', why: 'asked', task: 't2' },
        { op: 'update', id: ' f1 ', text: 'ship it now' },
        { op: 'close', id: 'f1', why: 'done' },
        { op: 'add', section: 'nowhere', text: 'x' },
        { op: 'rename' },
        'junk',
    ] });
    const answer = parseAnswer(text(`here: ${raw}`), resolving);
    assert.ok(answer.kind === 'ops');
    assert.deepEqual(answer.ops.map((each) => [each.task, each.op.op]), [['t2', 'add'], ['t1', 'update'], ['t2', 'close']]);
    assert.equal(answer.problems.length, 3);
    assert.match(answer.problems[1] ?? '', /"rename" is not an operation/u);
    assert.equal(WHY_WORDS, 24);
});

test('an answer without a JSON object or an ops list is invalid, and an old-shape answer is named', () => {
    assert.deepEqual(parseAnswer(text('nothing'), resolving), { kind: 'invalid', why: 'the answer holds no JSON object' });
    assert.deepEqual(parseAnswer(text('{"goal":"x"}'), resolving), { kind: 'old-shape' });
    assert.deepEqual(parseAnswer(text('{"other":1}'), resolving), { kind: 'invalid', why: 'the JSON object has no "ops" list' });
});

const fact: Fact = { id: brand<string, 'FactId'>('fact-1'), task: { tab: 'w1:t1', key: 't1' }, section: 'next', text: 'ship the uploader', why: null, ref: null, agent: null, anchor: null, firstAt: 1, lastAt: 1, state: 'open', closedWhy: null, closedAt: null, language: 'en', };

const ground: TaskGround = { key: text('t1'), tab: text('w1:t1'), shown: new Map([[text('f1'), fact]]), open: [fact], closedLately: [], source: text('ship the uploader'), language: text('en'), agents: [] };

const closeUnknown: Operation = { op: 'close', id: 'f9', why: 'done' };
const closeKnown: Operation = { op: 'close', id: 'f1', why: 'done' };

test('judging resolves shown ids to fact ids, refuses what the ledger refuses and counts the refusals', () => {
    const judged = judge([], [closeKnown, closeUnknown], ground, instant(5));
    assert.deepEqual(judged.kept.map((op) => (op.op === 'close' ? op.id : null)), ['fact-1']);
    assert.equal(judged.refused.length, 1);
    assert.match(judged.refused[0]?.reason ?? '', /refused by the ledger/u);
    assert.equal(refusedIn([judged, judged]), 2);
    const tasked = keptOf([judged], [ground]);
    assert.deepEqual(tasked.map((each) => each.task), ['t1']);
    assert.equal(forTask(tasked, text('t1')).length, 1);
    assert.equal(forTask(tasked, text('t2')).length, 0);
});

test('a retry names each refused operation with its reasons and the facts it mentions, in order', () => {
    const judged = judge([], [closeUnknown], ground, instant(5));
    const input: InputFact = { id: 'f1', section: 'next', text: 'ship the uploader', state: 'open', first: 1, last: 1, why: null, ref: null, anchor: null, agent: null, closed: null };
    const retry = retryFor([judged], { tasks: [ground], facts: new Map([[text('f1'), input]]) }, [text('one problem')]);
    assert.deepEqual(retry.refused.map((each) => [each.task, each.operation.op, each.reasons.length]), [['t1', 'close', 1]]);
    assert.deepEqual(retry.problems, ['one problem']);
    assert.equal(retry.tasks, false);
    assert.equal(count(retry.refused.length), 1);
});
