import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDOFF_OUTCOME_ROWS, storedOutcomeOf } from '#src/recap/domain/handoff-outcome.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { memoryStore } from './db/support.ts';

const storable = HANDOFF_OUTCOME_ROWS.filter((row) => row.storable);

test('every storable row of the outcome table is accepted by the answer repository', () => {
    const answers = memoryStore().handoffs;
    assert.equal(storable.length, 19);
    for (const row of storable) {
        const id = handoffIdOf(ids.next());
        const outcome = storedOutcomeOf(row.outcome, row.reason);
        assert.ok(outcome !== null);
        answers.answerHandoff(id, outcome);
        assert.equal(answers.handoffAnswer(id)?.kind, outcome.kind);
        assert.equal(answers.handoffAnswer(id)?.reason, 'reason' in outcome ? outcome.reason : null);
    }
});
