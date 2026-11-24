import assert from 'node:assert/strict';
import { test } from 'node:test';
import { harness, key, scope, text } from '@stateforge-labs/session-ledger/testkit';
import { SafePointWatch, type AutocompactDeps } from '@stateforge-labs/session-ledger';
import { policyFrom } from '@stateforge-labs/session-ledger/compaction-timing';
import { instant } from '@stateforge-labs/session-ledger';
import type { SafePointEvent } from '@stateforge-labs/session-ledger/compaction-timing';

type Skipped = Parameters<AutocompactDeps['decisions']['skip']>[0];

const ON = policyFrom((setting) => (setting === 'TAB_RECAP_AUTOCOMPACT' ? text('on') : undefined));

const watchOf = (skips: Skipped[], events: SafePointEvent[]): SafePointWatch => new SafePointWatch({
    policy: () => ON,
    decider: () => null,
    contexts: { of: () => null },
    inFlight: () => Promise.reject(new Error('not read')),
    recent: () => Promise.resolve([]),
    statusOf: () => null,
    ledger: { historyOf: () => [] },
    sessions: { lastBreakAt: () => null },
    activity: { activeFor: () => false, automaticInProgress: () => false },
    decisions: {
        record: () => { throw new Error('not decided'); },
        skip: (row) => { skips.push(row); },
        markRequested: () => undefined,
        pruneSkips: () => undefined,
        lastDecisionAt: () => null,
        lastDecision: () => null,
        unlinkedCompactSince: () => 'none',
        unlinkedCompactAny: () => 'none',
    },
    startedAt: instant(0),
    request: () => { throw new Error('not asked'); },
    recaps: { ensure: () => Promise.resolve() },
    now: () => instant(1_000),
    log: () => undefined,
    emit: (event) => { events.push(event); },
});

test('a session whose context is unknown is skipped as no-context and never asked', async () => {
    const skips: Skipped[] = [];
    const events: SafePointEvent[] = [];
    const watch = watchOf(skips, events);
    await watch.consider({ scope: scope('w1:t1'), key: key('w1:p1'), harness: harness('claude'), ready: true });
    assert.equal(skips.length, 1);
    assert.equal(skips[0]?.gate, 'no-context');
    assert.deepEqual(events, [{ kind: 'session-skipped', key: key('w1:p1'), gate: 'no-context' }]);
});

test('a session that is not ready is not considered at all', async () => {
    const skips: Skipped[] = [];
    const watch = watchOf(skips, []);
    await watch.consider({ scope: scope('w1:t1'), key: key('w1:p1'), harness: harness('claude'), ready: false });
    assert.equal(skips.length, 0);
});
