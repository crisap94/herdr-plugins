import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Tasked } from '@stateforge-labs/session-ledger';
import { judge } from '@stateforge-labs/session-ledger';
import { stageFor } from '@stateforge-labs/session-ledger';
import type { Stage } from '@stateforge-labs/session-ledger';
import { callOf, submitted } from '@stateforge-labs/session-ledger';
import type { CallVerdict, KitGround } from '@stateforge-labs/session-ledger';
import { LEDGER_GATES } from '@stateforge-labs/session-ledger';
import type { Operation } from '@stateforge-labs/session-ledger';
import { brand } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { factOf } from './fakes/facts.ts';
import { factIdOf } from '@stateforge-labs/session-ledger';

const textOf = brand<string, 'Text'>;
const NOW = 10 * 3_600_000;
const f1 = factOf('next', 'Review the migration test');
const ground: KitGround = {
    gates: LEDGER_GATES,
    at: instant(NOW),
    task: { key: textOf('t1'), tab: textOf('w1:t1'), shown: new Map([[textOf('f1'), f1]]), open: [f1], closedLately: [], source: textOf('the pipeline went green and the release was tagged'), language: textOf('en'), agents: [] },
};
const call = (op: Operation): Tasked => ({ task: textOf('t1'), op });
const good = call({ op: 'add', section: 'next', text: textOf('Write the writer tools'), why: null, ref: null, at: null, agent: null, anchor: textOf('the pipeline went green') });

const refusedBy = (verdict: CallVerdict): readonly string[] => {
    assert.equal(verdict.kind, 'refused');
    return verdict.findings.map((finding) => finding.gate);
};

test('an add with no why on a decision section is refused with gate G3', () => {
    const verdict = callOf(stageFor('writer'), call({ op: 'add', section: 'decisions', text: textOf('Ship the writer tools'), why: null, ref: null, at: null, agent: null, anchor: textOf('the pipeline went green') }), ground);
    assert.deepEqual(refusedBy(verdict), ['G3']);
});

test('an update of an unknown id is refused G6', () => {
    const verdict = callOf(stageFor('writer'), call({ op: 'update', id: factIdOf('f9'), text: textOf('Review the migration test again'), why: null }), ground);
    assert.deepEqual(refusedBy(verdict), ['G6']);
});

test('a close with no why is refused G10', () => {
    const verdict = callOf(stageFor('writer'), call({ op: 'close', id: factIdOf('f1'), why: null }), ground);
    assert.deepEqual(refusedBy(verdict), ['G10']);
});

test('an add that repeats the open fact f1 is refused G2', () => {
    const verdict = callOf(stageFor('writer'), call({ op: 'add', section: 'next', text: textOf('Review the migration test'), why: null, ref: null, at: null, agent: null, anchor: textOf('the pipeline went green') }), ground);
    assert.deepEqual(refusedBy(verdict), ['G2']);
});

test('a good add is accepted and is live in the stage', () => {
    const verdict = callOf(stageFor('writer'), good, ground);
    assert.equal(verdict.kind, 'accepted');
    assert.deepEqual(verdict.stage.calls, [good]);
});

test('submitted of a stage with ops X equals judge over X with the same ground', () => {
    const ops: readonly Operation[] = [good.op, { op: 'close', id: factIdOf('f1'), why: 'done' }];
    const stage: Stage = { job: 'writer', calls: ops.map(call), state: 'open' };
    assert.deepEqual(submitted(stage, ground), judge(LEDGER_GATES, ops, ground.task, instant(NOW)));
});
