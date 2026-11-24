import { must } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { createRebind, type RebindMode } from '#src/adapters/hooks/rebind.ts';
import { createReceiver } from '#src/adapters/hooks/receiver.ts';
import { createTurnEnds } from '#src/adapters/hooks/turn-ends.ts';
import { slot } from '#src/daemon/slots/hooks.ts';
import { parseRoot, type Line, type Running, type SlotContext, type StatusEvent } from '#src/daemon/slots.ts';
import type { FleetSnapshotResult } from '#src/ports/fleet-source.ts';
import { unknown } from '@stateforge-labs/session-ledger';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { laneFrom, type SeenLane } from '#src/recap/domain/lane.ts';
import { laneStatus } from '#src/recap/domain/status.ts';
import { instant, type Instant } from '@stateforge-labs/session-ledger';
import type { HookAnswer, HookCall, HookHarness, HookKind } from '#src/wire/hooks/contract.ts';
import { causeOf } from '#test/fakes/cause.ts';
import { readHookCases, postHook, type HookCase, type HookEffect } from '#test/contracts/wire/fakes/fake-harness.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { parseSessionId } from '#src/recap/domain/ids.ts';
import { reconciliation, seenLane, sessionObservation } from '#test/support/seen.ts';

const noop = (): void => {};

const NOTHING: HookAnswer = { kind: 'nothing' };
const TAB = tabId('w1:t1');
const PANE = paneId('w1:p1');
const OTHER = paneId('w1:p2');

const EFFECT_NAMES: Record<HookEffect, string> = {
    'as-status': 'observe',
    direct: 'turnEnded',
    'session-started': 'sessionStarted',
    compacted: 'compacted',
    marker: 'mark',
};

const snapshotOf = (lanes: readonly SeenLane[]): FleetSnapshotResult => ({
    kind: 'snapshot',
    seen: reconciliation({ lanes, panes: [], columns: [], widths: new Map() }),
    focusedTab: null,
    paneTokens: new Map(),
});

const laneAt = (pane: string, agent: string, session: string): SeenLane =>
    seenLane({ paneId: pane, tabId: 'w1:t1', workspaceId: 'w1', agent, status: 'idle', session, cwd: '/work/repo' });

type Fetch = () => Promise<FleetSnapshotResult>;

interface World {
    readonly handle: (call: HookCall) => HookAnswer;
    readonly effects: string[];
    readonly observed: Observation[];
    readonly logged: Line[];
    readonly snapshots: () => number;
    readonly settled: () => Promise<void>;
}

function world(mode: RebindMode, followedCase: HookCase | null, fetch: Fetch): World {
    const effects: string[] = [];
    const observed: Observation[] = [];
    const logged: Line[] = [];
    const pending: Promise<void>[] = [];
    let snapshots = 0;
    let at = 1_000_000;
    const clock = { now: (): Instant => instant(at) };
    const lane = laneFrom(laneAt('w1:p1', 'claude', 's-lane'));
    const base = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: laneStatus(followedCase?.lane?.status ?? 'idle'), session: 's-lane', cwd: '/work/repo' }));
    const real = createRebind({
        snapshot: () => {
            snapshots += 1;
            return fetch();
        },
        observe: (observation) => {
            observed.push(observation);
        },
        log: (line) => {
            logged.push(line);
        },
    });
    const turnEnds = createTurnEnds(clock);
    const ended = followedCase?.lane?.statusEndedMsAgo ?? null;
    if (ended !== null) {
        at = 1_000_000 - ended;
        turnEnds.noteStatus({ pane: PANE, status: laneStatus('idle') }, { ...emptyBoard(), lanes: new Map([[PANE, { ...base, status: laneStatus('working') }]]) });
        at = 1_000_000;
    }
    const preCompacts = createPreCompacts();
    const receiver = createReceiver({
        followed: () => (followedCase === null || !followedCase.followed ? null : { tab: TAB, pane: PANE, lane: base }),
        lanesOf: () => [lane],
        observe: (observation) => {
            effects.push('observe');
            observed.push(observation);
        },
        recaps: { turnEnded: () => { effects.push('turnEnded'); } },
        engine: {
            sessionStarted: () => { effects.push('sessionStarted'); },
            compacted: () => {
                effects.push('compacted');
                return (followedCase !== null && followedCase.answer.kind === 'context' ? followedCase.answer.text : '') as ReturnType<NonNullable<Parameters<typeof createReceiver>[0]['engine']['compacted']>>;
            },
        },
        turnEnds,
        preCompacts: {
            mark: (session, when) => { effects.push('mark'); preCompacts.mark(session, when); },
            markedAt: (session) => preCompacts.markedAt(session),
            offer: (session, text) => { preCompacts.offer(session, text); },
            take: (session) => preCompacts.take(session),
            served: (session) => preCompacts.served(session),
        },
        claimIdle: () => 'declined',
        restoreMode: () => 'on',
        rebindMode: () => mode,
        rebind: {
            rebind: (harness, session) => {
                const started = real.rebind(harness, session);
                pending.push(started);
                return started;
            },
        },
        clock,
        log: (line) => { logged.push(line); },
    });
    return {
        handle: (call) => receiver.handle(call),
        effects,
        observed,
        logged,
        snapshots: () => snapshots,
        settled: async () => { await Promise.all(pending); },
    };
}

const startCall = (harness: HookHarness, session: string | null): HookCall => ({ harness, kind: 'session-start', native: 'SessionStart', session, source: 'startup', cwd: '/work/repo' });

const callOfKind = (kind: HookKind): HookCall => ({ harness: 'claude', kind, native: kind, session: 's-new', source: null, cwd: '/work/repo' });

const found = (lanes: readonly SeenLane[]): Fetch => () => Promise.resolve(snapshotOf(lanes));

const never: Fetch = () => Promise.reject(new Error('herdr must not be read'));

const callOf = (c: HookCase): HookCall =>
    c.call ?? { harness: c.harness, kind: 'other', native: c.event, session: typeof c.request['session_id'] === 'string' ? c.request['session_id'] : null, source: null, cwd: null };

for (const c of readHookCases()) {
    test(`with the key unset ${c.name} keeps its answer and effects and never reads herdr`, () => {
        const w = world('off', c, never);
        assert.deepEqual(w.handle(callOf(c)), c.answer);
        assert.deepEqual(w.effects, c.effects.map((effect) => EFFECT_NAMES[effect]));
        assert.equal(w.snapshots(), 0);
    });
}

test('with the key unset an unknown session start answers nothing, observes nothing and never reads herdr', async () => {
    const w = world('off', null, never);
    assert.deepEqual(w.handle(startCall('claude', 's-new')), NOTHING);
    await w.settled();
    assert.deepEqual(w.observed, []);
    assert.equal(w.snapshots(), 0);
});

test('with the key on, a session start herdr reports on one pane answers nothing at once and rebinds that pane once', async () => {
    const w = world('on', null, found([laneAt('w1:p1', 'claude', 's-new')]));
    assert.deepEqual(w.handle(startCall('claude', 's-new')), NOTHING);
    assert.deepEqual(w.observed, []);
    await w.settled();
    assert.deepEqual(w.observed, [sessionObservation({ kind: 'session', pane: PANE, session: 's-new' })]);
    assert.equal(w.snapshots(), 1);
    assert.deepEqual(w.effects, []);
});

test('with the key on, a Codex session start rebinds the codex lane', async () => {
    const w = world('on', null, found([laneAt('w1:p1', 'claude', 'cx-new'), laneAt('w1:p2', 'codex', 'cx-new')]));
    assert.deepEqual(w.handle(startCall('codex', 'cx-new')), NOTHING);
    await w.settled();
    assert.deepEqual(w.observed, [sessionObservation({ kind: 'session', pane: OTHER, session: 'cx-new' })]);
});

const noMatch: readonly (readonly [string, readonly SeenLane[]])[] = [
    ['no lane has the session', [laneAt('w1:p1', 'claude', 's-other')]],
    ['the lane with the session is another agent', [laneAt('w1:p1', 'codex', 's-new')]],
    ['no lanes at all', []],
    ['two panes report the session', [laneAt('w1:p1', 'claude', 's-new'), laneAt('w1:p2', 'claude', 's-new')]],
];

for (const [name, lanes] of noMatch) {
    test(`with the key on, nothing is observed when ${name}`, async () => {
        const w = world('on', null, found(lanes));
        assert.deepEqual(w.handle(startCall('claude', 's-new')), NOTHING);
        await w.settled();
        assert.deepEqual(w.observed, []);
        assert.equal(w.snapshots(), 1);
    });
}

test('with the key on, an unreadable herdr observes nothing', async () => {
    const w = world('on', null, () => Promise.resolve(unknown({ why: 'unreadable', detail: causeOf('locked') })));
    assert.deepEqual(w.handle(startCall('claude', 's-new')), NOTHING);
    await w.settled();
    assert.deepEqual(w.observed, []);
});

test('with the key on, a throwing herdr logs one hook rebind line and does not reject', async () => {
    const w = world('on', null, () => Promise.reject(new Error('socket gone')));
    assert.deepEqual(w.handle(startCall('claude', 's-new')), NOTHING);
    await w.settled();
    assert.deepEqual(w.observed, []);
    assert.deepEqual(w.logged, ['hook rebind: socket gone']);
});

for (const kind of ['stop', 'pre-compact', 'other'] as const) {
    test(`with the key on, a ${kind} call for an unknown session never reads herdr`, async () => {
        const w = world('on', null, never);
        assert.deepEqual(w.handle(callOfKind(kind)), NOTHING);
        await w.settled();
        assert.equal(w.snapshots(), 0);
        assert.deepEqual(w.observed, []);
    });
}

test('with the key on, a session start for a followed session still starts the session and never reads herdr', async () => {
    const followed = readHookCases().find((c) => c.followed && c.call?.kind === 'session-start' && c.call.source !== 'compact');
    assert.ok(followed !== undefined, 'the fixture has a followed session start');
    const w = world('on', followed, never);
    assert.deepEqual(w.handle(callOf(followed)), followed.answer);
    assert.deepEqual(w.effects, followed.effects.map((effect) => EFFECT_NAMES[effect]));
    assert.ok(w.effects.includes('sessionStarted'));
    assert.equal(w.snapshots(), 0);
});

interface Slot {
    readonly socket: string;
    readonly observed: Observation[];
    readonly snapshots: () => number;
    readonly seen: () => Promise<void>;
    readonly start: (setting: string) => Promise<Running>;
    readonly dispose: () => void;
}

function slotWorld(lanes: readonly SeenLane[]): Slot {
    const root = mkdtempSync(join(tmpdir(), 'hooks-rebind-'));
    const observed: Observation[] = [];
    let snapshots = 0;
    let arrived: () => void = noop;
    const seen = new Promise<void>((resolve) => { arrived = resolve; });
    const start = (setting: string): Promise<Running> =>
        Promise.resolve(slot.start({
            root: parseRoot(root),
            clock: { now: () => instant(0) },
            board: () => emptyBoard(),
            observe: (observation: Observation): void => {
                observed.push(observation);
                arrived();
            },
            statuses: (_listener: (event: StatusEvent) => void): (() => void) => () => {},
            engine: {},
            recaps: {},
            fleet: {
                snapshot: () => {
                    snapshots += 1;
                    return Promise.resolve(snapshotOf(lanes));
                },
            },
            setting: (key: string): string => (key === 'TAB_RECAP_HOOKS_REBIND' ? setting : 'unset'),
            log: (): void => {},
        } as unknown as SlotContext));
    return {
        socket: join(root, 'hooks', 'hooks.sock'),
        observed,
        snapshots: () => snapshots,
        seen: () => seen,
        start,
        dispose: () => { rmSync(root, { recursive: true, force: true }); },
    };
}

for (const harness of ['claude', 'codex'] as const) {
    test(`over the socket, with the key on a ${harness} session start for an unknown session replies {} and rebinds once`, async () => {
        const w = slotWorld([laneAt('w1:p1', harness, 's-sock')]);
        const running = await w.start('on');
        try {
            const response = await postHook(w.socket, harness, { session_id: 's-sock', hook_event_name: 'SessionStart', source: 'startup', cwd: '/work/repo' });
            assert.equal(response.status, 200);
            assert.deepEqual(JSON.parse(response.body), {});
            await w.seen();
            assert.deepEqual(w.observed, [sessionObservation({ kind: 'session', pane: PANE, session: 's-sock' })]);
            assert.equal(w.snapshots(), 1);
        } finally {
            await running.stop();
            w.dispose();
        }
    });

    test(`over the socket, with the key unset a ${harness} session start for an unknown session replies {} and never reads herdr`, async () => {
        const w = slotWorld([laneAt('w1:p1', harness, 's-sock')]);
        const running = await w.start('unset');
        try {
            const response = await postHook(w.socket, harness, { session_id: 's-sock', hook_event_name: 'SessionStart', source: 'startup', cwd: '/work/repo' });
            assert.equal(response.status, 200);
            assert.deepEqual(JSON.parse(response.body), {});
            assert.equal(w.snapshots(), 0);
            assert.deepEqual(w.observed, []);
        } finally {
            await running.stop();
            w.dispose();
        }
    });
}

test('two session starts on one pane rebind in the order they arrived, even when the first snapshot answers last', async () => {
    const observed: Observation[] = [];
    const answers: Array<(result: FleetSnapshotResult) => void> = [];
    const rebind = createRebind({
        snapshot: () => new Promise((resolve) => { answers.push(resolve); }),
        observe: (observation) => { observed.push(observation); },
        log: noop,
    });
    const first = rebind.rebind('claude', must(parseSessionId('session-a')));
    const second = rebind.rebind('claude', must(parseSessionId('session-b')));
    await Promise.resolve();
    assert.equal(answers.length, 1);
    answers[0]?.(snapshotOf([laneAt('w1:p1', 'claude', 'session-a')]));
    await first;
    assert.equal(answers.length, 1 + 1);
    answers[1]?.(snapshotOf([laneAt('w1:p1', 'claude', 'session-b')]));
    await second;
    assert.deepEqual(observed.map((observation) => observation.kind === 'session' ? String(observation.session) : observation.kind), ['session-a', 'session-b']);
});
