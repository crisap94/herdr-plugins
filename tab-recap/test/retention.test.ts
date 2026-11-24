import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cutoffAt, DEFAULT_CLOSED_LANE_DAYS, DEFAULT_KEEP_DAYS, inWindow, tabKeepCountOf } from '#src/recap/domain/retention.ts';
import { parseCount } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { closedDaysOf as closedLaneDaysOf } from './fakes/closed-days.ts';

const DAY = 86_400_000;

const keepDays = (raw: string | undefined): number => tabKeepCountOf(raw === undefined ? undefined : must(parseText(raw)));

test('TAB_RECAP_KEEP_DAYS: whole days, 0 = for ever, anything else is 30', () => {
    assert.deepEqual([undefined, '', '30', '7', '0', ' 14 '].map((raw) => keepDays(raw)), [30, 30, 30, 7, 0, 14]);
    assert.deepEqual(['-1', '1.5', 'many', 'NaN'].map((raw) => keepDays(raw)), [DEFAULT_KEEP_DAYS, DEFAULT_KEEP_DAYS, DEFAULT_KEEP_DAYS, DEFAULT_KEEP_DAYS]);
});

test('the cutoff is that many days before now; none when nothing expires', () => {
    assert.equal(cutoffAt(instant(10 * DAY), must(parseCount(3))), 7 * DAY);
    assert.equal(cutoffAt(instant(10 * DAY), must(parseCount(0))), null);
});

test('TAB_RECAP_CLOSED_LANE_DAYS: whole days of up to nine digits, 0 = record nothing, anything else is 14', () => {
    assert.deepEqual([undefined, '', '  ', '0', '7', ' 21 ', '007', '999999999'].map((raw) => closedLaneDaysOf(raw)), [14, 14, 14, 0, 7, 21, 7, 999_999_999]);
    assert.deepEqual(['-1', '1.5', '1e1', '0x10', '+5', '1234567890', 'many', 'NaN'].map((raw) => closedLaneDaysOf(raw)), Array(8).fill(DEFAULT_CLOSED_LANE_DAYS));
});

test('a closure is inside the window up to the cutoff, never one millisecond earlier, and days = 0 keeps none', () => {
    const now = instant(10 * DAY);
    const days = closedLaneDaysOf('1');
    assert.equal(inWindow(instant(9 * DAY), now, days), 'inside', 'exactly at the cutoff');
    assert.equal(inWindow(instant(9 * DAY - 1), now, days), 'outside', 'one millisecond before the cutoff');
    assert.equal(inWindow(now, now, closedLaneDaysOf('0')), 'outside', 'days = 0');
});
