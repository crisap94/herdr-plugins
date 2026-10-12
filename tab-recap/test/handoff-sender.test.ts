import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HANDOFF_OBSERVATIONS } from '#src/recap/application/handoff-limits.ts';
import { TypingLease } from '#src/recap/application/typing-lease.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { Ready } from '#src/recap/application/handoff-target.ts';
import { LEASE, LEASE_TTL_MS } from '#src/recap/domain/typing-lease.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import type { PaneTokens, PaneTokensResult } from '#src/ports/pane-tokens.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Done } from '#src/ports/columns.ts';
import { FakePanes } from './fakes/herdr-panes.ts';
import { echoing, laneWith, leaseSpy, PANE, planWith, readyOf, senderOf, worldOf } from './fakes/handoff-delivery.ts';

const TEXT = 'Handoff of the parser refactor.\n\nNext steps: finish the lexer.';
const DELIVERED: HandoffOutcome = { kind: 'delivered' };
const UNCONFIRMED: HandoffOutcome = { kind: 'failed', reason: 'unconfirmed' };
const TRANSPORT: HandoffOutcome = { kind: 'failed', reason: 'transport' };
const BLOCKED: HandoffOutcome = { kind: 'refused', reason: 'status-not-ready' };
const LEASE_BUSY: HandoffOutcome = { kind: 'refused', reason: 'typing-lease-busy' };

const readyClaude = (): Ready => readyOf(laneWith(), planWith('either'));

test('an available lease is taken without waiting, the plan runs once and the lease is released after confirmation', async () => {
    const world = echoing(worldOf({ latest: 'older' }));
    const spy = leaseSpy('taken');
    assert.deepEqual(await senderOf(world, spy.port).send(readyClaude(), TEXT), DELIVERED);
    assert.deepEqual(spy.acquired, [[PANE, 0]]);
    assert.deepEqual(spy.released, [PANE]);
    assert.deepEqual(world.sent, [{ pane: PANE, text: TEXT, wait: undefined, behavior: { acceptsStall: false } }]);
    assert.equal(world.pauses.length, 1, 'confirmation observes after the send, nothing else');
});

test('an earlier live lease of another tool returns typing-lease-busy without pausing and types nothing', async () => {
    const clock = { at: 1000 };
    const herdr = new FakePanes(() => clock.at);
    const tokens: LaneTokens = {
        report: async (pane, values, ttlMs): Promise<Done> => (herdr.report(pane, 'tab-recap', values, ttlMs).ok ? { kind: 'done' } : unknown({ why: 'unreachable', detail: 'fake' })),
    };
    const panes: PaneTokens = { read: async (pane): Promise<PaneTokensResult> => ({ kind: 'tokens', tokens: herdr.read(pane) }) };
    const leasePauses: number[] = [];
    const lease = new TypingLease({ tokens, panes, now: (): number => clock.at, pause: async (ms: number): Promise<void> => { leasePauses.push(ms); clock.at += ms; }, log: (): void => undefined });
    herdr.report(PANE, 'coordinator', { 'typing-coordinator': '500' }, LEASE_TTL_MS);
    const world = echoing(worldOf({ latest: 'older' }));
    assert.deepEqual(await senderOf(world, lease).send(readyClaude(), TEXT), LEASE_BUSY);
    assert.deepEqual(leasePauses, []);
    assert.deepEqual(world.sent, []);
    assert.equal(world.pauses.length, 0);
    assert.equal(herdr.read(PANE)[LEASE], undefined, 'our own lease is cleared when it is held back');
});

test('an unavailable lease proceeds without a lease and releases nothing', async () => {
    const world = echoing(worldOf({ latest: 'older' }));
    const spy = leaseSpy('unavailable');
    assert.deepEqual(await senderOf(world, spy.port).send(readyClaude(), TEXT), DELIVERED);
    assert.deepEqual(spy.released, []);
    assert.equal(world.sent.length, 1);
});

test('a blocked target releases the lease and is refused as status-not-ready without confirming', async () => {
    const world = worldOf({ latest: 'older', sendReply: { kind: 'blocked' } });
    const spy = leaseSpy('taken');
    assert.deepEqual(await senderOf(world, spy.port).send(readyClaude(), TEXT), BLOCKED);
    assert.deepEqual(spy.released, [PANE]);
    assert.equal(world.sent.length, 1);
    assert.equal(world.pauses.length, 0);
});

test('a send that throws is a transport failure, logged once with its name and no text, releases the lease and is never retried', async () => {
    const world = worldOf({ latest: 'older', faults: { prompt: true } });
    const spy = leaseSpy('taken');
    assert.deepEqual(await senderOf(world, spy.port).send(readyClaude(), TEXT), TRANSPORT);
    assert.deepEqual(spy.released, [PANE]);
    assert.equal(world.sent.length, 1);
    assert.equal(world.pauses.length, 0);
    assert.deepEqual(world.logs, [`handoff prompt ${PANE}: Error`]);
    assert.equal(world.logs.some((line) => line.includes(TEXT)), false);
});

test('a send that reports an unknown reading is a transport failure and releases the lease', async () => {
    const world = worldOf({ latest: 'older', sendReply: unknown({ why: 'unreachable', detail: 'socket closed' }) });
    const spy = leaseSpy('taken');
    assert.deepEqual(await senderOf(world, spy.port).send(readyClaude(), TEXT), TRANSPORT);
    assert.deepEqual(spy.released, [PANE]);
});

test('an unconfirmed send releases the lease after the bound and is not sent a second time', async () => {
    const world = worldOf({ latest: 'older' });
    const spy = leaseSpy('taken');
    assert.deepEqual(await senderOf(world, spy.port).send(readyClaude(), TEXT), UNCONFIRMED);
    assert.deepEqual(spy.released, [PANE]);
    assert.equal(world.sent.length, 1);
    assert.equal(world.pauses.length, HANDOFF_OBSERVATIONS);
});

test('a throw while reading confirmation evidence is unconfirmed, not transport, and the lease is released', async () => {
    const world = worldOf({ latest: 'older' });
    world.onSend = (): void => {
        world.faults = { latest: true };
    };
    const spy = leaseSpy('taken');
    assert.deepEqual(await senderOf(world, spy.port).send(readyClaude(), TEXT), UNCONFIRMED);
    assert.equal(world.sent.length, 1, 'the send already happened');
    assert.deepEqual(spy.released, [PANE]);
    assert.deepEqual(world.logs, [`handoff observe ${PANE}: Error`]);
});

test('a throw while reading the baseline propagates before any send, and the lease is still released', async () => {
    const world = worldOf({ latest: 'older', faults: { latest: true } });
    const spy = leaseSpy('taken');
    await assert.rejects(senderOf(world, spy.port).send(readyClaude(), TEXT), /latest failed/);
    assert.equal(world.sent.length, 0);
    assert.deepEqual(spy.released, [PANE]);
});
