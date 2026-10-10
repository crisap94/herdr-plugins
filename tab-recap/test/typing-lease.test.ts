import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import { LEASE, LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import { saying, unknown } from '#src/ports/unknowable.ts';
import type { Done } from '#src/ports/columns.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import { FakePanes } from './fakes/herdr-panes.ts';

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
    const lease = new TypingLease({ tokens, panes, now: (): number => clock.at, pause: async (ms: number): Promise<void> => { clock.at += ms; }, log: (): void => undefined });
    return { herdr, lease };
};

test('an earlier live lease of another tool: tab-recap clears its own and does not type; it takes the lease once the other one is gone', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': '500' }, LEASE_TTL_MS);
    assert.equal(await lease.acquire('w1:p1', 0), 'busy');
    assert.equal(herdr.read('w1:p1')[LEASE], undefined, 'our own lease is cleared when it is held back');
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': null }, LEASE_TTL_MS);
    assert.equal(await lease.acquire('w1:p1', 0), 'taken');
});

test('a later lease of another tool does not hold tab-recap back', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': '5000' }, LEASE_TTL_MS);
    assert.equal(await lease.acquire('w1:p1', 0), 'taken');
    assert.equal(herdr.read('w1:p1')[LEASE], '1000');
});

test('a crashed writer\'s lease expires on its own: acquire waits for it, then takes the pane', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': '500' }, LEASE_TTL_MS);
    assert.equal(await lease.acquire('w1:p1', 3 * LEASE_TTL_MS), 'taken', 'the stale lease ends after its time to live');
    assert.ok(clock.at >= 500 + LEASE_TTL_MS, 'it waited until the lease was gone');
});

test('acquire gives up when the other lease does not go within the wait', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    herdr.report('w1:p1', 'coordinator', { 'typing-coordinator': '500' }, 10 * LEASE_TTL_MS);
    assert.equal(await lease.acquire('w1:p1', 5000), 'busy');
});

test('after typing, tab-recap clears its lease', async () => {
    const clock = { at: 1000 };
    const { herdr, lease } = leaseAt(clock);
    assert.equal(await lease.acquire('w1:p1', 0), 'taken');
    assert.equal(herdr.read('w1:p1')[LEASE], '1000');
    await lease.release('w1:p1');
    assert.equal(herdr.read('w1:p1')[LEASE], undefined);
});

test('herdr cannot take or read tokens: the lease is unavailable at once, typing goes on without it, and one line says so per outage', async () => {
    const clock = { at: 1000 };
    const logged: string[] = [];
    const broken: LaneTokens = { report: async (): Promise<Done> => unknown({ why: 'unreachable', detail: 'no pane.report_metadata' }) };
    const panes: PaneTokens = { read: async (): Promise<PaneTokensResult> => unknown({ why: 'unreachable', detail: 'no pane.get' }) };
    const lease = new TypingLease({ tokens: broken, panes, now: (): number => clock.at, pause: async (ms: number): Promise<void> => { clock.at += ms; }, log: (line: string): void => { logged.push(line); } });
    assert.equal(await lease.acquire('w1:p1'), 'unavailable');
    assert.equal(await lease.acquire('w1:p1'), 'unavailable');
    assert.equal(logged.length, 1, 'once per outage');
});

test('a lease held by another tool, past the wait, says so as its own reason', () => {
    assert.equal(saying({ why: 'lease', after: 60_000 as never }), 'another tool is typing into the pane (waited 60000 ms for its lease)');
});
