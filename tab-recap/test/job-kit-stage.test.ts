import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Operation } from '#src/recap/domain/ops.ts';
import type { Tasked } from '#src/recap/application/ops-answer.ts';
import { listedIn, live, stageFor, staged, submittedStage, toolOf } from '#src/recap/application/job-kit/stage.ts';
import type { Stage, Staging } from '#src/recap/application/job-kit/stage.ts';

const add: Tasked = { task: 't1', op: { op: 'add', section: 'next', text: 'Ship it', why: null, ref: null, at: null, agent: null } };
const update: Tasked = { task: 't1', op: { op: 'update', id: 'f1', text: 'Ship it now', why: null } };
const close: Tasked = { task: 't1', op: { op: 'close', id: 'f1', why: 'done' } };

const accepted = (outcome: Staging): Stage => {
    assert.equal(outcome.kind, 'staged');
    return outcome.stage;
};

test('reconcile does not list ledger_add and writer does', () => {
    assert.equal(listedIn('reconcile', 'ledger_add'), 'not-listed');
    assert.equal(listedIn('writer', 'ledger_add'), 'listed');
});

test('a close is a merge for story and a close for reconcile', () => {
    const closeOp: Operation = close.op;
    assert.equal(toolOf('story', closeOp), 'ledger_merge');
    assert.equal(toolOf('reconcile', closeOp), 'ledger_close');
});

test('staging add, update and close on a writer stage keeps them in order and leaves the input stage unchanged', () => {
    const empty = stageFor('writer');
    const one = accepted(staged(empty, add));
    const two = accepted(staged(one, update));
    const three = accepted(staged(two, close));
    assert.deepEqual(live(three), [add, update, close]);
    assert.equal(three.state, 'open');
    assert.deepEqual(live(empty), []);
    assert.deepEqual(live(one), [add]);
});

test('staging an add on a reconcile stage is refused and the stage is unchanged', () => {
    const stage = stageFor('reconcile');
    const outcome = staged(stage, add);
    assert.deepEqual(outcome, { kind: 'refused', stage, reason: 'not-in-catalogue' });
    assert.deepEqual(live(stage), []);
});

test('staging on a submitted stage is refused as stage-closed', () => {
    const submitted = submittedStage(accepted(staged(stageFor('writer'), add)));
    const outcome = staged(submitted, update);
    assert.deepEqual(outcome, { kind: 'refused', stage: submitted, reason: 'stage-closed' });
    assert.deepEqual(live(submitted), [add]);
});
