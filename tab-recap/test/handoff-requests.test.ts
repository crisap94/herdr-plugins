import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHandoffRequests } from '#src/recap/domain/handoff-requests.ts';

test('the handoff exchange is off unless the setting is exactly on', () => {
    assert.equal(parseHandoffRequests(undefined, 'on'), 'off');
    assert.equal(parseHandoffRequests('on', 'on'), 'on');
    assert.equal(parseHandoffRequests('On', 'on'), 'off');
    assert.equal(parseHandoffRequests('yes', 'on'), 'off');
});

test('the handoff exchange has no effect while sharing on herdr is off', () => {
    assert.equal(parseHandoffRequests('on', 'off'), 'off');
});
