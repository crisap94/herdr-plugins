import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Tasked } from '#src/recap/application/ops-answer.ts';
import { judge } from '#src/recap/application/ops-gating.ts';
import { stageFor } from '#src/recap/application/job-kit/stage.ts';
import type { Stage } from '#src/recap/application/job-kit/stage.ts';
import { callOf, submitted } from '#src/recap/application/job-kit/writer-tools.ts';
import type { CallVerdict, KitGround } from '#src/recap/application/job-kit/writer-tools.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { instant } from '#src/recap/domain/time.ts';
import { factOf } from './fakes/facts.ts';

const NOW = 10 * 3_600_000;
const f1 = factOf('next', 'Review the migration test');
const ground: KitGround = {
    gates: LEDGER_GATES,
    at: instant(NOW),
    task: { key: 't1', tab: 'w1:t1', shown: new Map([['f1', f1]]), open: [f1], closedLately: [], source: 'the pipeline went green and the release was tagged', language: 'en', agents: [] },
};
const call = (op: Operation): Tasked => ({ task: 't1', op });
const good = call({ op: 'add', section: 'next', text: 'Write the writer tools', why: null, ref: null, at: null, agent: null, anchor: 'the pipeline went green' });

const refusedBy = (verdict: CallVerdict): readonly string[] => {
    assert.equal(verdict.kind, 'refused');
    return verdict.findings.map((finding) => finding.gate);
};

test('an add with no why on a decision section is refused with gate G3', () => {
    const verdict = callOf(stageFor('writer'), call({ op: 'add', section: 'decisions', text: 'Ship the writer tools', why: null, ref: null, at: null, agent: null, anchor: 'the pipeline went green' }), ground);
    assert.deepEqual(refusedBy(verdict), ['G3']);
});

test('an update of an unknown id is refused G6', () => {
    const verdict = callOf(stageFor('writer'), call({ op: 'update', id: 'f9', text: 'Review the migration test again', why: null }), ground);
    assert.deepEqual(refusedBy(verdict), ['G6']);
});

test('a close with no why is refused G10', () => {
    const verdict = callOf(stageFor('writer'), call({ op: 'close', id: 'f1', why: null }), ground);
    assert.deepEqual(refusedBy(verdict), ['G10']);
});

test('an add that repeats the open fact f1 is refused G2', () => {
    const verdict = callOf(stageFor('writer'), call({ op: 'add', section: 'next', text: 'Review the migration test', why: null, ref: null, at: null, agent: null, anchor: 'the pipeline went green' }), ground);
    assert.deepEqual(refusedBy(verdict), ['G2']);
});

test('a good add is accepted and is live in the stage', () => {
    const verdict = callOf(stageFor('writer'), good, ground);
    assert.equal(verdict.kind, 'accepted');
    assert.deepEqual(verdict.stage.calls, [good]);
});

test('submitted of a stage with ops X equals judge over X with the same ground', () => {
    const ops: readonly Operation[] = [good.op, { op: 'close', id: 'f1', why: 'done' }];
    const stage: Stage = { job: 'writer', calls: ops.map(call), state: 'open' };
    assert.deepEqual(submitted(stage, ground), judge(LEDGER_GATES, ops, ground.task, NOW));
});
