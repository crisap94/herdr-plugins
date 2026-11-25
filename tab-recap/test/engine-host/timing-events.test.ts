import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LedgerEvent } from '@stateforge-labs/session-ledger';
import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';
import { candidatesOf } from '#src/daemon/autocompact.ts';
import { AutocompactSweep } from '@stateforge-labs/session-ledger';
import { SLOT_TABLE } from '#src/daemon/slot-table.ts';
import { parseSwitch, startSlots, taps, type Line, type SlotContext, type SlotKey, type Slots, type Switch } from '#src/daemon/slots.ts';
import { emptyBoard, type Board } from '#src/recap/domain/board.ts';
import { laneFrom, type Lane } from '#src/recap/domain/lane.ts';
import type { SafePointWatch } from '@stateforge-labs/session-ledger';
import { rows, world, type World } from '../autocompact-world.ts';
import { seenLane } from '#test/support/seen.ts';

const at = (pane: string, tab: string): Lane => laneFrom(seenLane({ paneId: pane, tabId: tab, workspaceId: 'w1', agent: 'claude', status: 'idle' }));
const boardOf = (lanes: readonly Lane[]): Board => ({ ...emptyBoard(), lanes: new Map(lanes.map((found) => [found.pane, found])) });
const settle = (): Promise<void> => new Promise<void>((resolve) => { setImmediate(resolve); });
const accomplished = (scope: string): LedgerEvent => ({ kind: 'accomplishment-established', scope, task: { id: 't' }, sessions: [], fact: {}, at: 0 }) as unknown as LedgerEvent;

interface Daemon {
    readonly w: World;
    readonly emit: (event: LedgerEvent) => void;
    readonly slots: Slots;
    readonly sweep: AutocompactSweep;
}

const LANES: readonly Lane[] = [at('w1:p1', 'w1:t1'), at('w1:p2', 'w1:t1'), at('w1:p3', 'w1:t2')];

const candidates = (): readonly Candidate[] => candidatesOf(boardOf(LANES), (): void => undefined);

async function daemon(key: Switch): Promise<Daemon> {
    const w = world({ mode: 'shadow' });
    w.store.db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run('w1:t2');
    const ledger = taps<LedgerEvent>((): void => undefined);
    const context = {
        setting: (asked: SlotKey): Switch => (asked === 'TAB_RECAP_TIMING_EVENTS' ? parseSwitch(key) : 'off'),
        log: (line: Line): void => { w.logs.push(line); },
        ledger: ledger.tap,
        candidates,
        consider: (candidate: Candidate): Promise<void> => w.watch.consider(candidate),
    } as unknown as SlotContext;
    const slots = await startSlots(SLOT_TABLE.filter((entry) => entry.key === 'TAB_RECAP_TIMING_EVENTS'), context);
    const sweep = new AutocompactSweep({ candidates, autocompact: (): SafePointWatch => w.watch, log: (): void => undefined });
    return { w, emit: ledger.emit, slots, sweep };
}

test('EVT-5: with the key off an accomplishment causes no consideration', async () => {
    const d = await daemon('off');
    d.emit(accomplished('w1:t1'));
    await settle();
    assert.deepEqual([d.w.asked.length, rows(d.w).length], [0, 0]);
    await d.slots.stop();
});

test('EVT-5: with the key unset the slot is on', async () => {
    const d = await daemon('unset');
    d.emit(accomplished('w1:t1'));
    await settle();
    assert.equal(d.w.asked.length, 2);
    await d.slots.stop();
});

test('EVT-6: with the key on, one consideration per candidate of the event scope, none for other scopes', async () => {
    const d = await daemon('on');
    d.emit(accomplished('w1:t1'));
    await settle();
    assert.deepEqual(rows(d.w).map((row) => row.key).toSorted(), ['w1:p1', 'w1:p2']);
    assert.equal(d.w.asked.length, 2);
    await d.slots.stop();
    d.emit(accomplished('w1:t2'));
    await settle();
    assert.equal(d.w.asked.length, 2, 'after stop the event is not heard');
});

test('EVT-7: with the key on, the sweep still considers every ready lane', async () => {
    const d = await daemon('on');
    d.emit(accomplished('w1:t2'));
    await settle();
    await d.sweep.sweep();
    assert.deepEqual(rows(d.w).map((row) => row.key).toSorted(), ['w1:p1', 'w1:p2', 'w1:p3']);
    await d.slots.stop();
});

test('EVT-8: with a consideration already in flight for the lane, an event asks nothing more', async () => {
    const d = await daemon('on');
    const held: { release: () => void } = { release: (): void => undefined };
    d.w.gate = new Promise<void>((resolve) => { held.release = resolve; });
    d.emit(accomplished('w1:t2'));
    await settle();
    assert.equal(d.w.asked.length, 1);
    d.emit(accomplished('w1:t2'));
    const sweeping = d.sweep.sweep();
    await settle();
    assert.equal(d.w.asked.length, 2, 'the sweep reaches its first lane; the held lane is not asked again');
    held.release();
    await sweeping;
    assert.equal(d.w.asked.length, 3);
    assert.equal(rows(d.w).filter((row) => row.key === 'w1:p3').length, 1);
    await d.slots.stop();
});
