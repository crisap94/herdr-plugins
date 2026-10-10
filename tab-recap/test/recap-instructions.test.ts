import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '#src/adapters/recap-instructions.ts';
import { positiveCount } from '#src/recap/domain/writer-view.ts';
import { requestOf } from '#test/support.ts';

test('writer instructions explain hidden counts and restrict ids to shown facts', () => {
    const request = requestOf({ ledgers: [{ task: null, facts: [], hidden: new Map([['done', positiveCount(20)]]) }] });
    assert.match(instructions(request), /<hidden section=.*open facts.*cannot see or change.*Never add a fact that repeats one.*ids are only for facts you are shown/);
});

test('writer instructions do not mention hidden counts when the view is full', () => {
    assert.doesNotMatch(instructions(requestOf()), /<hidden section=/);
});
