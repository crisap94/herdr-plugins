import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcomeOf, outcomeText } from '#src/recap/domain/ask-outcome.ts';

test('an outcome reads back from its text and is written as the same text: done, off, interrupted, settled and failed-<reason>', () => {
    for (const text of ['done', 'off', 'interrupted', 'settled', 'failed-not-a-lane', 'failed-interrupted']) {
        const outcome = outcomeOf(text);
        assert.notEqual(outcome, null, text);
        assert.equal(outcome === null ? null : outcomeText(outcome), text);
    }
});

test('a text that is not an outcome is refused, and a running stage is not one', () => {
    assert.equal(outcomeOf('running'), null);
    assert.equal(outcomeOf('queued'), null);
    assert.equal(outcomeOf('bogus'), null);
});
