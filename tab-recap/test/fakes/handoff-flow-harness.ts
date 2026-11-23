import { instant } from '#src/recap/domain/time.ts';
import { HandoffFlow } from '#src/recap/application/handoff-flow.ts';
import type { HandoffFlowDeps } from '#src/recap/application/handoff-flow.ts';
import { DEFAULT_CLOSED_LANE_DAYS } from '#src/recap/domain/retention.ts';
import type { HandoffRender, HandoffRenderInput, HandoffRenderResult } from '#src/recap/application/handoff-render.ts';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import type { HandoffSender } from '#src/recap/application/handoff-sender.ts';
import type { Ready } from '#src/recap/application/handoff-target.ts';
import type { Waiting } from '#src/recap/application/autocompact.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { RecapRecords, TabRecap } from '#src/ports/recap-records.ts';
import type { HandoffAskRecord } from '#src/ports/requests.ts';
import type { InFlight, InFlightReading } from '#src/ports/in-flight.ts';
import { handoffPlanner } from '#src/adapters/capability/handoff-plans.ts';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { ids } from '#src/adapters/db/uuid7.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import type { HandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import type { RefreshStatus } from '#src/recap/domain/freshness.ts';
import type { RecapTask } from '#src/recap/domain/tasks.ts';
import type { Fact, TaskId } from '#src/recap/domain/fact.ts';
import type { LaneStatus } from '#src/recap/domain/status.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { MemoryLedger } from './memory-ledger.ts';
import { textOf } from '#src/recap/domain/text.ts';
import { paneIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

export const NOW = Date.parse('2026-10-11T10:00:00Z');
export const SOURCE = paneId('w1:p1');
export const TARGET = paneId('w1:p2');
export const TAB = tabId('w1:t1');
export const TARGET_TAB = tabId('w1:t2');
export const T1: TaskId = { tab: TAB, key: textOf('t1') };
export const TEXT = 'Handoff text.';
export const SETTLE_MS = 10_000;

const CLEAR: Waiting = { kind: 'clear' };
const IDLE_FLIGHT: InFlightReading = { kind: 'not-started', why: 'no transcript yet' };

export interface FlowWorld {
    sourceStatus: LaneStatus;
    targetStatus: LaneStatus;
    targetAgent: string;
    targetPresent: boolean;
    targetKeyKnown: boolean;
    peer: boolean;
    recap: TabRecap | null;
    facts: readonly Fact[];
    awaiting: Waiting;
    flight: InFlightReading;
    refreshed: RefreshStatus;
    refreshThrows: boolean;
    renderResult: HandoffRenderResult;
    renderThrows: boolean;
    sendOutcome: HandoffOutcome;
    sendThrows: boolean;
    pauseThrows: boolean;
    recapThrows: boolean;
    onRefresh: () => void;
    onPause: (count: number) => void;
}

export const task = (id: string, lanes: readonly string[]): RecapTask => ({ id: textOf(id), name: textOf(id), lanes: lanes.map((lane) => paneIdOf(lane)), sections: null, markdown: textOf('') });

export const recapOf = (...tasks: readonly RecapTask[]): TabRecap => ({ ...blankRecap(tabId('w1:t1')), tasks });

export const SOURCE_LISTED = (): TabRecap => recapOf(task('t1', ['w1:p1']));

export function worldOf(over: Partial<FlowWorld> = {}): FlowWorld {
    return {
        sourceStatus: 'idle', targetStatus: 'idle', targetAgent: 'claude', targetPresent: true, targetKeyKnown: true, peer: false,
        recap: SOURCE_LISTED(), facts: [], awaiting: CLEAR, flight: IDLE_FLIGHT, refreshed: 'refreshed', refreshThrows: false,
        renderResult: { kind: 'text', text: TEXT, bytes: TEXT.length, omitted: 0, withheld: 0 }, renderThrows: false, sendOutcome: { kind: 'delivered' }, sendThrows: false, pauseThrows: false, recapThrows: false,
        onRefresh: (): void => undefined, onPause: (): void => undefined,
        ...over,
    };
}

export interface Harness {
    readonly flow: HandoffFlow;
    readonly world: FlowWorld;
    readonly claims: LaneClaims;
    readonly calls: string[];
    readonly pauses: number[];
    readonly sent: { readonly target: Ready; readonly text: string }[];
    readonly renders: HandoffRenderInput[];
    readonly logs: string[];
    readonly flushes: string[];
}

export function harness(over: Partial<FlowWorld> = {}, sender: Pick<HandoffSender, 'send'> | null = null): Harness {
    const world = worldOf(over);
    const claims = new LaneClaims();
    const calls: string[] = [];
    const pauses: number[] = [];
    const sent: { readonly target: Ready; readonly text: string }[] = [];
    const renders: HandoffRenderInput[] = [];
    const logs: string[] = [];
    const flushes: string[] = [];
    const targetKey = world.targetKeyKnown ? { session: 'sess-2', cwd: '/other' } : { session: null, cwd: null };
    const lanes = (): readonly Lane[] => [
        laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: world.sourceStatus, session: 'sess-1', cwd: '/repo' }),
        ...(world.targetPresent ? [laneFrom({ paneId: 'w1:p2', tabId: 'w1:t2', workspaceId: 'w1', agent: world.targetAgent, status: world.targetStatus, ...targetKey })] : []),
        ...(world.targetPresent && world.peer ? [laneFrom({ paneId: 'w1:p3', tabId: 'w1:t2', workspaceId: 'w1', agent: world.targetAgent, status: 'idle', session: 'sess-3', cwd: '/other' })] : []),
    ];
    const inFlight: InFlight = { read: async () => { calls.push('flight'); return world.flight; } };
    const render: HandoffRender = async (input) => {
        calls.push('render');
        renders.push(input);
        if (world.renderThrows) {
            throw new Error('render failed');
        }
        return world.renderResult;
    };
    const mock: Pick<HandoffSender, 'send'> = {
        send: async (target, text) => {
            calls.push('send');
            sent.push({ target, text });
            if (world.sendThrows) {
                throw new Error('sender failed');
            }
            return world.sendOutcome;
        },
    };
    const deps: HandoffFlowDeps = {
        lanes,
        records: { readRecap: () => { if (world.recapThrows) { throw new Error('unreadable recap'); } return world.recap; } } satisfies Pick<RecapRecords, 'readRecap'>,
        ledger: new MemoryLedger().seed(...world.facts),
        closed: { closures: { resolve: () => ({ kind: 'absent' }) }, ledger: new MemoryLedger().seed(...world.facts), runs: { runAt: () => null }, closedDays: () => DEFAULT_CLOSED_LANE_DAYS },
        target: { plans: handoffPlanner, inFlight, awaiting: async () => { calls.push('awaiting'); return world.awaiting; } },
        claims,
        flush: (tab, why): Promise<void> => { flushes.push(`${String(tab)} ${why} at ${calls.length}`); return Promise.resolve(); },
        refresh: async (tab) => {
            calls.push(`refresh ${tab}`);
            world.onRefresh();
            if (world.refreshThrows) {
                throw new Error('refresh failed');
            }
            return world.refreshed;
        },
        render,
        sender: sender ?? mock,
        pause: async (ms) => {
            calls.push(`pause ${ms}`);
            pauses.push(ms);
            world.onPause(pauses.length);
            if (world.pauseThrows) {
                throw new Error('clock failed');
            }
        },
        now: () => NOW,
        log: (line) => { logs.push(line); },
    };
    return { flow: new HandoffFlow(deps), world, claims, calls, pauses, sent, renders, logs, flushes };
}

export function request(over: Partial<HandoffAskRecord> = {}): HandoffAskRecord {
    return { id: handoffIdOf(ids.next()), at: instant(NOW), tab: TAB, pane: SOURCE, toPane: TARGET, refresh: 'as-is', note: null, source: { kind: 'live' }, ...over };
}

export const bothFree = (claims: LaneClaims): boolean => !claims.has(SOURCE) && !claims.has(TARGET);
