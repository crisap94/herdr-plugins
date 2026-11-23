import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refreshFirstOf } from '../bin/handoff.ts';

test('the handoff CLI queues refresh true as refresh-first and false as as-is', () => {
    assert.deepEqual([refreshFirstOf(true), refreshFirstOf(false)], ['refresh-first', 'as-is']);
});
