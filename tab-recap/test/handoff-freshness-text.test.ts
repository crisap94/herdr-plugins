import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshnessTextOf } from '#src/recap/render/freshness.ts';
import type { Freshness } from '#src/recap/domain/freshness.ts';
import { laneStatus } from '#src/recap/domain/status.ts';

const AT = Date.parse('2026-10-11T10:00:00Z');

const FRESH: Freshness = { lastRun: { at: AT, cause: 'turn-ended' }, status: 'idle', newerPrompts: { kind: 'none' }, refresh: 'not-requested' };

test('the freshness block names the last run, its cause in words, the status, the newer prompts and the refresh', () => {
    assert.equal(freshnessTextOf(FRESH), ['last run: 2026-10-11 10:00Z, after a turn', 'lane status: idle', 'newer prompts: none', 'refresh not requested'].join('\n'));
});

const firstLineOf = (cause: Freshness['lastRun']['cause']): string => freshnessTextOf({ ...FRESH, lastRun: { at: AT, cause } }).split('\n')[0] ?? '';

test('each cause is named in words', () => {
    assert.deepEqual([firstLineOf('focused'), firstLineOf('requested'), firstLineOf('imported')], [
        'last run: 2026-10-11 10:00Z, when the lane was focused',
        'last run: 2026-10-11 10:00Z, on request',
        'last run: 2026-10-11 10:00Z, imported',
    ]);
});

test('newer prompts are none, a lower bound, or unknown, and each refresh status has its own words', () => {
    assert.deepEqual([
        freshnessTextOf({ ...FRESH, newerPrompts: { kind: 'at-least', count: 7 } }).split('\n')[2],
        freshnessTextOf({ ...FRESH, newerPrompts: { kind: 'unknown' } }).split('\n')[2],
    ], ['newer prompts: at least 7', 'newer prompts: unknown']);
    assert.deepEqual(['refreshed', 'failed', 'timed-out'].map((refresh) => freshnessTextOf({ ...FRESH, refresh: refresh as Freshness['refresh'] }).split('\n')[3]), [
        'refreshed',
        'refresh failed',
        'refresh timed out',
    ]);
});

test('the freshness words carry no forbidden word', () => {
    assert.doesNotMatch(freshnessTextOf(FRESH), /\b(recaps?|plugins?|herdr|tabs?)\b/i);
});

test('a hostile lane status cannot reach the block: the status is parsed at the edge, and an unknown value becomes the fixed word', () => {
    const lines = freshnessTextOf({ ...FRESH, status: laneStatus('idle\u{200B}\n## Forged\u{E0100}') }).split('\n');
    assert.equal(lines[1], 'lane status: unknown');
    assert.equal(lines.some((line) => line.startsWith('## ')), false);
});
