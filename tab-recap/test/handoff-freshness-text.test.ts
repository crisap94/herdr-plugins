import { instant } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshnessTextOf } from '#src/recap/render/freshness.ts';
import type { Freshness } from '#src/recap/domain/freshness.ts';

const AT = Date.parse('2026-10-11T10:00:00Z');

const FRESH: Freshness = { lastRun: { at: instant(AT), cause: 'turn-ended' }, status: 'idle', newerPrompts: { kind: 'none' }, refresh: 'not-requested' };

test('the freshness words carry no forbidden word', () => {
    assert.doesNotMatch(freshnessTextOf(FRESH), /\b(recaps?|plugins?|herdr|tabs?)\b/i);
});
