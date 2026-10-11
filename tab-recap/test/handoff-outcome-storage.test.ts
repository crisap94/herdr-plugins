import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDOFF_OUTCOME_ROWS } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffOutcomeRow } from '#src/recap/domain/handoff-outcome.ts';
import type { HandoffVerdict } from '#src/ports/handoff-answers.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { memoryStore } from './db/support.ts';

const verdictOf = (row: HandoffOutcomeRow): HandoffVerdict | null => {
    if (row.outcome === 'printed') return null;
    if (row.outcome === 'delivered') return { outcome: 'delivered', reason: null };
    return { outcome: row.outcome, reason: row.reason };
};

const answerable = HANDOFF_OUTCOME_ROWS.flatMap((row) => {
    const verdict = verdictOf(row);
    return verdict === null ? [] : [{ verdict, storable: row.storable }];
});

test('every storable row of the outcome table is accepted by the answer repository', () => {
    const answers = memoryStore().handoffs;
    const stored = answerable.filter((each) => each.storable);
    assert.equal(stored.length, 19);
    for (const { verdict } of stored) {
        const id = handoffIdOf(ids.next());
        answers.answerHandoff(id, verdict);
        assert.equal(answers.handoffAnswer(id)?.outcome, verdict.outcome);
        assert.equal(answers.handoffAnswer(id)?.reason, verdict.reason);
    }
});

test('every non-storable row of the outcome table is refused and nothing is written', () => {
    const answers = memoryStore().handoffs;
    const refused = answerable.filter((each) => !each.storable);
    assert.equal(refused.length, 4);
    for (const { verdict } of refused) {
        const id = handoffIdOf(ids.next());
        assert.throws(() => { answers.answerHandoff(id, verdict); }, /not storable/);
        assert.equal(answers.handoffAnswer(id), null);
    }
});

test('a reason the outcome table does not know is refused', () => {
    const answers = memoryStore().handoffs;
    const id = handoffIdOf(ids.next());
    assert.throws(() => { answers.answerHandoff(id, { outcome: 'failed', reason: 'made-up' }); }, /not storable/);
    assert.equal(answers.handoffAnswer(id), null);
});

test('a reason paired with an outcome it does not belong to is refused', () => {
    const answers = memoryStore().handoffs;
    const id = handoffIdOf(ids.next());
    assert.throws(() => { answers.answerHandoff(id, { outcome: 'refused', reason: 'interrupted' }); }, /not storable/);
    assert.throws(() => { answers.answerHandoff(id, { outcome: 'failed', reason: 'lane-busy' }); }, /not storable/);
    assert.equal(answers.handoffAnswer(id), null);
});
