// The typing lease against herdr's measured token rules (FakePanes): an earlier live lease holds tab-recap back, an expired one does not, and tab-recap's is cleared after typing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import { LEASE, LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Done } from '#src/ports/columns.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import { FakePanes } from './fakes/herdr-panes.ts';

/** One fake herdr, seen through the two ports: tab-recap's writes under its own source, and reads of the merged map. */
function herdrAt(clock: { at: number }): { herdr: FakePanes; tokens: LaneTokens; panes: PaneTokens } {
    const herdr = new FakePanes(() => clock.at);
    const tokens: LaneTokens = {
        report: async (pane, values, ttlMs): Promise<Done> => (herdr.report(pane, 'tab-recap', values, ttlMs).ok ? { kind: 'done' } : unknown({ why: 'unreachable', detail: 'fake' })),
    };
    const panes: PaneTokens = {
        read: async (pane): Promise<PaneTokensResult> => ({ kind: 'tokens', tokens: herdr.read(pane) }),
    };
    return { herdr, tokens, panes };
}

const leaseAt = (clock: { at: number }): { herdr: FakePanes; lease: TypingLease } => {
    const { herdr, tokens, panes } = herdrAt(clock);
    const lease = new TypingLease({ tokens, panes, now: (): number => clock.at, pause: async (ms: number): Promise<void> => { clock.at += ms; } });
    return { herdr, lease };
};

test('an earlier live lease of another tool: tab-recap clears its own and does not type; it takes the lease once the other one is gone', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': '500' }, LEASE_TTL_MS);
    assert.equal(await lease.take('w1:p1'), false);
    assert.equal(herdr.read('w1:p1')[LEASE], undefined, 'our own lease is cleared when it is held back');
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': null }, LEASE_TTL_MS);
    assert.equal(await lease.take('w1:p1'), true);
});

test('a later lease of another tool does not hold tab-recap back', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': '5000' }, LEASE_TTL_MS);
    assert.equal(await lease.take('w1:p1'), true);
    assert.equal(herdr.read('w1:p1')[LEASE], '1000');
});

test('a crashed writer\'s lease expires on its own: acquire waits for it, then takes the pane', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': '500' }, LEASE_TTL_MS);
    assert.equal(await lease.acquire('w1:p1', 3 * LEASE_TTL_MS), true, 'the stale lease ends after its time to live');
    assert.ok(clock.at >= 500 + LEASE_TTL_MS, 'it waited until the lease was gone');
});

test('acquire gives up when the other lease does not go within the wait', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': '500' }, 10 * LEASE_TTL_MS);
    assert.equal(await lease.acquire('w1:p1', 5000), false);
});

test('after typing, tab-recap clears its lease', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    assert.equal(await lease.take('w1:p1'), true);
    assert.equal(herdr.read('w1:p1')[LEASE], '1000');
    await lease.release('w1:p1');
    assert.equal(herdr.read('w1:p1')[LEASE], undefined);
});
