import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_KINDS } from '#src/recap/domain/event-token.ts';
import type { EventKind } from '#src/recap/domain/event-token.ts';

const TODAYS_KINDS: readonly string[] = [
    'recap-written', 'needs-raised', 'needs-cleared', 'compact-queued', 'compact-running', 'compact-done', 'compact-failed',
    'autocompact-decided', 'autocompact-skipped', 'lane-closed', 'daemon-started', 'daemon-stopping',
];

test('the event kinds are the lane events and the compaction kinds the descriptor declares: the same twelve as before the protocol', () => {
    assert.deepEqual([...EVENT_KINDS].toSorted(), [...TODAYS_KINDS].toSorted());
});

test('an event kind is one of the literal kinds, not any string', () => {
    // @ts-expect-error 'not-an-event' is not an event kind
    const unknownKind: EventKind = 'not-an-event';
    assert.equal(unknownKind, 'not-an-event');
});
