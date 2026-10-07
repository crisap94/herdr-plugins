import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeWhyGate } from '#src/recap/domain/gates/g10-close-why.ts';
import { duplicateGate } from '#src/recap/domain/gates/g2-ledger-duplicate.ts';
import { unknownIdGate } from '#src/recap/domain/gates/g6-unknown-id.ts';
import { correctionOf, gatekeeper } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateContext } from '#src/recap/domain/gates/gate.ts';
import { jaccard } from '#src/recap/domain/gates/jaccard.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { factOf } from './fakes/facts.ts';

const NOW = 10 * 3_600_000;
const f4 = factOf('done', 'Released tab-recap 1.10.0 through the pipeline');
const f5 = factOf('next', 'Review the migration test');
const shut = factOf('done', 'Fixed the flaky lint job on main', { state: 'closed', closedWhy: 'done', closedAt: NOW - 3 * 3_600_000 });
const context: GateContext = { now: NOW, language: 'en', agents: [], shown: new Map([['f4', f4], ['f5', f5]]), closedLately: [shut] };
const add = (text: string, section: 'done' | 'next' = 'done'): Operation => ({ op: 'add', section, text, why: null, ref: null, at: null, agent: null });
const gates = [duplicateGate, unknownIdGate, closeWhyGate];

test('jaccard counts words of three letters or more, lower-cased', () => {
    assert.equal(jaccard('Ship the 2.0 engine', 'ship THE 2.0 engine'), 1);
    assert.equal(jaccard('a b', 'c d'), 0);
    assert.ok(jaccard('Released tab-recap 1.10.0 through CI', 'Released tab-recap 1.10.0 through the pipeline') > 0.5);
});

test('G2 refuses an add that repeats an open fact and names the one to update', () => {
    const found = gatekeeper(gates, [add('Released tab-recap 1.10.0 through the pipeline today')], context);
    assert.deepEqual(found.kept, []);
    assert.match(correctionOf([add('Released tab-recap 1.10.0 through the pipeline today')], found.refused), /G2: add done "Released[^"]*" — it repeats f4 .*update f4 instead/);
});

test('G2 against facts closed in the last day needs 0.8, and the fact itself is not named by an id', () => {
    const near = gatekeeper(gates, [add('Fixed the flaky lint job on main branch')], context);
    assert.equal(near.refused.length, 1);
    assert.match(near.refused[0]?.reason ?? '', /closed 3 h ago as done/);
    assert.equal(gatekeeper(gates, [add('Fixed the lint job')], context).refused.length, 0, 'a looser match to a closed fact passes');
});

test('G2: a close and an add of the same line in one answer is not a duplicate, and two alike adds are', () => {
    const pair: readonly Operation[] = [{ op: 'close', id: 'f5', why: 'done' }, add('Review the migration test again', 'next')];
    assert.equal(gatekeeper(gates, pair, context).refused.length, 0);
    const twins = gatekeeper(gates, [add('Wrote the ledger gates'), add('Wrote the ledger gates and tests')], context);
    assert.deepEqual(twins.refused.map((f) => f.at), [1]);
});

test('G6 refuses an unknown id and G10 a close without a why; the rest of the answer is kept', () => {
    const ops: readonly Operation[] = [{ op: 'close', id: 'f99', why: 'done' }, { op: 'close', id: 'f5', why: null }, { op: 'update', id: 'f4', text: 'Released 1.10.1', why: null }];
    const found = gatekeeper(gates, ops, context);
    assert.deepEqual(found.refused.map((f) => [f.gate, f.at]), [['G6', 0], ['G10', 1]]);
    assert.deepEqual(found.kept, [ops[2]]);
    assert.match(correctionOf(ops, found.refused), /G6: close f99 — f99 is not in the ledger\nG10: close f5 — closing f5 needs a why/);
});
