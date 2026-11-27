import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffStageOf } from '#src/recap/application/handoff-mirror.ts';
import { handoff } from '#src/protocol/exchanges/handoff.ts';
import { terminalsOf, terminalStage } from '#src/protocol/exchange.ts';
import { HANDOFF_OUTCOME_ROWS } from '#src/recap/domain/handoff-outcome.ts';
import { handoffOutcomeOf } from './fakes/handoff-outcome-readers.ts';

test('every storable outcome maps to the stage the descriptor names, and that stage fits 80 characters with a 16-character id', () => {
    for (const row of HANDOFF_OUTCOME_ROWS.filter((each) => each.storable)) {
        const outcome = handoffOutcomeOf(row.outcome, row.reason);
        assert.ok(outcome !== null);
        const stage = handoffStageOf(outcome);
        const expected = row.reason === null ? 'delivered' : `${row.outcome}-${row.reason}`;
        assert.equal(stage, expected);
        assert.ok(stage === 'delivered' || terminalsOf(handoff).some((terminal) => terminalStage(terminal) === stage), `${stage} is a declared stage`);
        assert.ok(`${'x'.repeat(16)}:${stage}`.length <= 80);
    }
    assert.equal(handoffStageOf({ kind: 'printed' }), 'failed-internal-error', 'a non-storable outcome is an internal failure, never a silent stage');
});
