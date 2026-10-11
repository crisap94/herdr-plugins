import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffRequestsOf } from '#src/recap/domain/handoff-requests.ts';

test('the handoff exchange is off unless the setting is exactly on', () => {
    assert.equal(handoffRequestsOf(undefined, 'on'), 'off');
    assert.equal(handoffRequestsOf('on', 'on'), 'on');
    assert.equal(handoffRequestsOf('On', 'on'), 'off');
    assert.equal(handoffRequestsOf('yes', 'on'), 'off');
});

test('the handoff exchange has no effect while sharing on herdr is off', () => {
    assert.equal(handoffRequestsOf('on', 'off'), 'off');
});
