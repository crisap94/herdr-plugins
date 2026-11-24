import { textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RestoreText } from '@stateforge-labs/session-ledger';
import { createReceiver } from '#src/adapters/hooks/receiver.ts';
import { createPreCompacts } from '#src/adapters/hooks/pre-compacts.ts';
import { createTurnEnds } from '#src/adapters/hooks/turn-ends.ts';
import type { Line } from '#src/daemon/slots.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Observation } from '#src/recap/domain/fold.ts';
import { type SessionKey } from '#src/recap/domain/ids.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { laneFrom, type Lane } from '#src/recap/domain/lane.ts';
import { laneStatus, type LaneStatus } from '#src/recap/domain/status.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import type { HookAnswer, HookCall, HookSource } from '#src/wire/hooks/contract.ts';
import { hookFixture, readHookCases, type HookCase, type HookEffect } from '#test/contracts/wire/fakes/fake-harness.ts';
import { seenLane } from '#test/support/seen.ts';

const NOW = 1_000_000;
const TAB = tabId('w1:t1');
const PANE: SessionKey = paneId('w1:p1');
const NOTHING: HookAnswer = { kind: 'nothing' };

const isRestoreText = (text: string): text is RestoreText => typeof text === 'string';

const laneWith = (status: LaneStatus): Lane =>
    laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status, session: 's-lane', cwd: '/work/repo' }));

const EFFECT_NAMES: Record<HookEffect, string> = {
    'as-status': 'observe',
    direct: 'turnEnded',
    'session-started': 'sessionStarted',
    compacted: 'compacted',
    marker: 'mark',
};

interface Setup {
    readonly followed: boolean;
    readonly status: LaneStatus;
    readonly endedMsAgo: number | null;
    readonly restore: string;
    readonly restoreOn: boolean;
    readonly failStart: boolean;
}

const idleSetup: Setup = { followed: true, status: laneStatus('idle'), endedMsAgo: null, restore: '', restoreOn: true, failStart: false };

interface World {
    readonly handle: (call: HookCall) => HookAnswer;
    readonly effects: string[];
    readonly observed: Observation[];
    readonly turns: string[];
    readonly started: unknown[];
    readonly lookups: string[];
    readonly logged: Line[];
}

function world(setup: Setup): World {
    const effects: string[] = [];
    const observed: Observation[] = [];
    const turns: string[] = [];
    const started: unknown[] = [];
    const lookups: string[] = [];
    const logged: Line[] = [];
    const lane = laneWith(setup.status);
    let at: number = NOW;
    const clock = { now: (): Instant => instant(at) };
    const turnEnds = createTurnEnds(clock);
    if (setup.endedMsAgo !== null) {
        at = NOW - setup.endedMsAgo;
        turnEnds.noteStatus({ pane: PANE, status: laneStatus('idle') }, { ...emptyBoard(), lanes: new Map([[PANE, laneWith(laneStatus('working'))]]) });
        at = NOW;
    }
    const preCompacts = createPreCompacts();
    const receiver = createReceiver({
        followed: (harness, session) => {
            lookups.push(`${harness}:${session}`);
            return setup.followed ? { tab: TAB, pane: PANE, lane } : null;
        },
        lanesOf: () => [lane],
        observe: (observation) => {
            effects.push('observe');
            observed.push(observation);
        },
        recaps: {
            turnEnded: (tab, scopeLanes, cause) => {
                effects.push('turnEnded');
                turns.push(`${tab}:${scopeLanes.length}:${cause}`);
            },
        },
        engine: {
            sessionStarted: (scope, key, now) => {
                effects.push('sessionStarted');
                started.push({ scope, key, now });
                if (setup.failStart) {
                    throw new Error('the ledger is down');
                }
            },
            compacted: () => {
                effects.push('compacted');
                if (!isRestoreText(setup.restore)) {
                    throw new Error('unreachable: every string is a restore text in the fake');
                }
                return setup.restore;
            },
        },
        turnEnds,
        preCompacts: {
            mark: (session, when) => {
                effects.push('mark');
                preCompacts.mark(session, when);
            },
            markedAt: (session) => preCompacts.markedAt(session),
            offer: (session, text) => { preCompacts.offer(session, text); },
            take: (session) => preCompacts.take(session),
            served: (session) => preCompacts.served(session),
        },
        claimIdle: () => 'declined',
        restoreMode: () => (setup.restoreOn ? 'on' : 'off'),
        rebindMode: () => 'off',
        rebind: { rebind: async () => {} },
        clock,
        log: (line) => {
            logged.push(line);
        },
    });
    return {
        handle: (call: HookCall): HookAnswer => receiver.handle(call),
        effects,
        observed,
        turns,
        started,
        lookups,
        logged,
    };
}

const stopCall = (session: string | null): HookCall => ({ harness: 'claude', kind: 'stop', native: 'Stop', session, source: null, cwd: '/work/repo' });

const sessionStartCall = (session: string, source: HookSource): HookCall => ({
    harness: 'claude',
    kind: 'session-start',
    native: 'SessionStart',
    session,
    source,
    cwd: '/work/repo',
});

const sessionOf = (request: Readonly<Record<string, unknown>>): string | null => {
    const raw = request['session_id'];
    return typeof raw === 'string' ? raw : null;
};

const callOf = (c: HookCase): HookCall =>
    c.call ?? { harness: c.harness, kind: 'other', native: c.event, session: sessionOf(c.request), source: null, cwd: null };

const setupOf = (c: HookCase): Setup => ({
    followed: c.followed,
    status: laneStatus(c.lane?.status ?? 'idle'),
    endedMsAgo: c.lane?.statusEndedMsAgo ?? null,
    restore: c.answer.kind === 'context' ? c.answer.text : '',
    restoreOn: true,
    failStart: false,
});

for (const c of readHookCases()) {
    test(`${c.name} gives its answer and its effects`, () => {
        const w = world(setupOf(c));
        assert.deepEqual(w.handle(callOf(c)), c.answer);
        assert.deepEqual(w.effects, c.effects.map((effect) => EFFECT_NAMES[effect]));
    });
}

const SIGNAL_EFFECTS: Readonly<Record<string, readonly string[]>> = { 'as-status': ['observe'], direct: ['turnEnded'], none: [] };

const turnSignalRows = hookFixture('turn-signal.tsv')
    .split('\n')
    .filter((line) => line.length > 0)
    .slice(1)
    .map((line) => {
        const [status = '', ago = '', signal = ''] = line.split('\t');
        return { status: laneStatus(textOf(status)), endedMsAgo: ago === '-' ? null : Number(ago), signal };
    });

for (const row of turnSignalRows) {
    test(`turn signal ${row.signal} for a ${row.status} lane ended ${row.endedMsAgo ?? 'never'} ms ago`, () => {
        const w = world({ ...idleSetup, status: row.status, endedMsAgo: row.endedMsAgo });
        assert.deepEqual(w.handle(stopCall('s-row')), NOTHING);
        assert.deepEqual(w.effects, SIGNAL_EFFECTS[row.signal]);
    });
}

test('K2 touches no dependency when the session is not followed', () => {
    const w = world({ ...idleSetup, followed: false });
    assert.deepEqual(w.handle(stopCall('s-unfollowed')), NOTHING);
    assert.deepEqual(w.effects, []);
    assert.deepEqual(w.logged, []);
    assert.deepEqual(w.lookups, ['claude:s-unfollowed']);
});

test('K1 answers nothing for a call with no session, without a lookup', () => {
    const w = world(idleSetup);
    assert.deepEqual(w.handle(stopCall(null)), NOTHING);
    assert.deepEqual(w.lookups, []);
    assert.deepEqual(w.effects, []);
});

test('K8 answers nothing for an event the receiver does not handle, without a lookup', () => {
    const w = world(idleSetup);
    const other: HookCall = { harness: 'claude', kind: 'other', native: 'UserPromptSubmit', session: 's-other', source: null, cwd: null };
    assert.deepEqual(w.handle(other), NOTHING);
    assert.deepEqual(w.lookups, []);
    assert.deepEqual(w.effects, []);
});

test('K3 with a status covering the turn observes the pane idle', () => {
    const w = world({ ...idleSetup, status: laneStatus('working') });
    assert.deepEqual(w.handle(stopCall('s-working')), NOTHING);
    assert.deepEqual(w.observed, [{ kind: 'status', pane: PANE, status: 'idle' }]);
});

test('K3 with no covering status ends the turn of the tab with the lanes of the tab', () => {
    const w = world(idleSetup);
    assert.deepEqual(w.handle(stopCall('s-missed')), NOTHING);
    assert.deepEqual(w.turns, ['w1:t1:1:turn-ended']);
});

test('K4 starts a session that is not a compaction with its session and cwd, and answers nothing', () => {
    const w = world(idleSetup);
    assert.deepEqual(w.handle(sessionStartCall('s-startup', 'startup')), NOTHING);
    assert.deepEqual(w.started, [
        { scope: 'w1:t1', key: 'w1:p1', now: { session: 's-startup', cwd: '/work/repo' } },
    ]);
});

test('K5 with restore off still asks the engine for the restore text and answers nothing', () => {
    const w = world({ ...idleSetup, restore: 'RESTORE', restoreOn: false });
    assert.deepEqual(w.handle(sessionStartCall('s-restore', 'compact')), NOTHING);
    assert.deepEqual(w.effects, ['compacted']);
});

test('K7 marks a followed session before compaction', () => {
    const w = world(idleSetup);
    const preCompact: HookCall = { harness: 'claude', kind: 'pre-compact', native: 'PreCompact', session: 's-pre-compact', source: null, cwd: '/work/repo' };
    assert.deepEqual(w.handle(preCompact), NOTHING);
    assert.deepEqual(w.effects, ['mark']);
});

test('an internal throw is logged once and answers nothing', () => {
    const w = world({ ...idleSetup, failStart: true });
    assert.deepEqual(w.handle(sessionStartCall('s-startup', 'startup')), NOTHING);
    assert.equal(w.logged.length, 1);
    assert.match(String(w.logged[0]), /the ledger is down/);
});
