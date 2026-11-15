import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { instructions } from '#src/adapters/job/prompts/recap-instructions.ts';
import { positiveCount } from '#src/recap/domain/writer-view.ts';
import { requestOf } from '#test/support.ts';

const MAIN_DIGEST = '9f6881c8ac20bf119018ba96ca42d7f84c5e0a650a9f59f51ec04d58ddbd86bf';
const CLOSE_ANCHOR = 'A close with why "done" or "wrong" carries an "anchor" too: the quote from the input that shows it is done or wrong.';

test('writer instructions are byte-identical to main when close evidence is absent or off', () => {
    assert.equal(createHash('sha256').update(instructions(requestOf())).digest('hex'), MAIN_DIGEST);
    assert.equal(createHash('sha256').update(instructions({ ...requestOf(), closeEvidence: 'off' })).digest('hex'), MAIN_DIGEST);
});

test('writer instructions ask a close as done or wrong for an anchor when close evidence is on', () => {
    const text = instructions({ ...requestOf(), closeEvidence: 'on' });
    assert.equal(text.split(CLOSE_ANCHOR).length - 1, 1);
    assert.equal(text.includes('A close never does.'), false);
});

test('writer instructions explain hidden counts and restrict ids to shown facts', () => {
    const request = requestOf({ ledgers: [{ task: null, facts: [], hidden: new Map([['done', positiveCount(20)]]) }] });
    assert.match(instructions(request), /<hidden section=.*open facts.*cannot see or change.*Never add a fact that repeats one.*ids are only for facts you are shown/);
});

test('writer instructions do not mention hidden counts when the view is full', () => {
    assert.doesNotMatch(instructions(requestOf()), /<hidden section=/);
});
