import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutoffOf, DEFAULT_KEEP_DAYS, tabKeepDaysOf } from '#src/recap/domain/retention.ts';

test('TAB_RECAP_KEEP_DAYS: whole days, 0 = for ever, anything else is 30', () => {
    assert.deepEqual([undefined, '', '30', '7', '0', ' 14 '].map((raw) => tabKeepDaysOf(raw)), [30, 30, 30, 7, 0, 14]);
    assert.deepEqual(['-1', '1.5', 'many', 'NaN'].map((raw) => tabKeepDaysOf(raw)), [DEFAULT_KEEP_DAYS, DEFAULT_KEEP_DAYS, DEFAULT_KEEP_DAYS, DEFAULT_KEEP_DAYS]);
});

test('the cutoff is that many days before now; none when nothing expires', () => {
    assert.equal(cutoffOf(10 * 86_400_000, 3), 7 * 86_400_000);
    assert.equal(cutoffOf(10 * 86_400_000, 0), null);
});
