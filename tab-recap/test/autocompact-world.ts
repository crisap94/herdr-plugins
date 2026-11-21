import { parseCount } from '#src/recap/domain/count.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { instant } from '#src/recap/domain/time.ts';
import { must } from '#src/protocol/result.ts';
import { Autocompact } from '#src/recap/application/autocompact.ts';
import type { AutocompactDeps } from '#src/recap/application/autocompact.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { policyOf } from '#src/recap/domain/autocompact.ts';
import type { AutocompactPolicy } from '#src/recap/domain/autocompact.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import type { Decider, DecidedResult } from '#src/ports/decider.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { memoryStore } from './db/support.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { causeOf } from './fakes/cause.ts';
import type { Waiting } from '#src/recap/application/autocompact.ts';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { flightReason, observedFrom, runningCount, unreadable } from '#src/recap/domain/in-flight.ts';
import type { BackgroundItem } from '#src/recap/domain/in-flight.ts';
import { decidedOf, textOf } from './fakes/decider-fixtures.ts';
import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';
import { parseHarnessKind, parseScopeId, parseSessionKey } from '@stateforge-labs/session-ledger';
import type { IdleHold } from '#src/recap/domain/idle-hold.ts';

export const NOW = 10_000_000;
const SCOPE = must(parseScopeId('w1:t1'));
const KEY = must(parseSessionKey('w1:p1'));
const candidate = (harness: string): Candidate => ({ scope: SCOPE, key: KEY, harness: must(parseHarnessKind(harness)), ready: true });
const laneOf = (from: Candidate, status: string): Lane => laneFrom({ paneId: from.key, tabId: from.scope, workspaceId: 'w1', agent: from.harness, status });
export const lane = (agent = 'claude', status = 'idle'): Lane => laneOf(candidate(agent), status);
export const SAFE = { closes_request: 0.95, announces_continuation: 0.05, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };

export interface World { breakAt: number | null; readonly service: Autocompact; readonly claims: LaneClaims; readonly queued: Set<string>;readonly events: string[]; awaiting: string | null; lateAwaiting: string | null; awaitingUnknown: boolean; known: boolean; gate: Promise<void> | null; byPane: Record<string, number>; readonly store: ReturnType<typeof memoryStore>; readonly requests: CompactRequest[]; readonly logs: string[]; readonly asked: number[]; readonly refreshed: string[]; readonly flushed: string[]; readonly reads: number[]; readonly clock: { at: number }; idleHold: IdleHold; policy: AutocompactPolicy; inFlight: number | 'unknown'; background: readonly BackgroundItem[]; share: number; decide: () => DecidedResult }

export function world(over: Partial<AutocompactPolicy> = {}, recap = true, startedAt = 0, tuning: Partial<AutocompactTuning> = {}): World {
    const store = memoryStore();
    store.db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run(SCOPE);
    const [requests, logs, asked, refreshed, reads, events] = [[] as CompactRequest[], [] as string[], [] as number[], [] as string[], [] as number[], [] as string[]];
    const flushed: string[] = [];
    const clock = { at: NOW };
    const state = { breakAt: null as number | null, policy: { ...policyOf(() => undefined), mode: 'on' as const, ...over }, tuning: { ...tuningOf(() => undefined), ...tuning }, inFlight: 0 as number | 'unknown', background: [] as readonly BackgroundItem[], awaiting: null as string | null, lateAwaiting: null as string | null, awaitingReads: 0, awaitingUnknown: false, known: true, gate: null as Promise<void> | null, byPane: {} as Record<string, number>, share: 62, idleHold: 'on' as IdleHold, decide: (): DecidedResult => decidedOf(SAFE, { tokens: 700, costUsd: 0.00003, tookMs: 550 }) };
    const decider: Decider = { label: textOf('fake · m'), ask: async (_state, questions) => { asked.push(questions.size); if (state.gate !== null) await state.gate; return state.decide(); } };
    const claims = new LaneClaims();
    const queued = new Set<string>();
    const deps: AutocompactDeps = {
        policy: () => state.policy, tuning: () => state.tuning, decider: () => decider, contexts: { of: (pane) => (state.known ? { tokens: (state.byPane[pane] ?? state.share) * 10_000, window: 1_000_000, source: 'observed' } : null) }, inFlight: () => { reads.push(1); return Promise.resolve(state.inFlight === 'unknown' ? unreadable(flightReason('test')) : observedFrom(runningCount(state.inFlight), state.background, flightReason(`${state.inFlight} running`))); },
        recent: () => Promise.resolve([{ role: 'user', text: 'publish it' }, { role: 'agent', text: 'Published.' }]), ledger: store.ledger, boundaries: { lastBreakAt: (tab: string, pane: string) => state.breakAt ?? store.boundaries.lastBreakAt(tabId(tab), pane) }, compactions: store.compactions, decisions: store.autocompact,
        requests: { requestCompact: (request) => { requests.push(request); } }, claims, queue: { compactQueued: (_tab, pane) => queued.has(pane) }, hasRecap: () => (recap ? 'recapped' : 'unrecapped'), refresh: (tab) => { refreshed.push(tab); return Promise.resolve('refreshed'); }, flush: (tab, why): Promise<void> => { flushed.push(`${String(tab)} ${why} asked ${asked.length}`); return Promise.resolve(); },
        lanes: () => [lane()], idleHold: () => state.idleHold, now: () => instant(clock.at), log: (line) => { logs.push(line); }, startedAt: instant(startedAt),
        awaiting: () => { state.awaitingReads += 1; return Promise.resolve(awaitingOf(state)); },
        events: { lane: (pane, kind, detail) => { events.push(`${pane} ${kind}${detail === undefined || detail === null ? '' : ` ${detail}`}`); }, inWorkspace: () => undefined },
    };
    const self: World = { get breakAt() { return state.breakAt; }, set breakAt(value: number | null) { state.breakAt = value; }, service: new Autocompact(deps), claims, queued, store, requests, logs, asked, refreshed, flushed, reads, clock, events,
        get awaiting() { return state.awaiting; }, set awaiting(value) { state.awaiting = value; }, get lateAwaiting() { return state.lateAwaiting; }, set lateAwaiting(value) { state.lateAwaiting = value; },get awaitingUnknown() { return state.awaitingUnknown; }, set awaitingUnknown(value) { state.awaitingUnknown = value; }, get policy() { return state.policy; }, set policy(value) { state.policy = value; }, get inFlight() { return state.inFlight; }, set inFlight(value) { state.inFlight = value; }, get background() { return state.background; }, set background(value) { state.background = value; }, get share() { return state.share; }, set share(value) { state.share = value; }, get known() { return state.known; }, set known(value) { state.known = value; }, get gate() { return state.gate; }, set gate(value) { state.gate = value; }, get byPane() { return state.byPane; }, set byPane(value) { state.byPane = value; }, get decide() { return state.decide; }, set decide(value) { state.decide = value; }, get idleHold() { return state.idleHold; }, set idleHold(value: IdleHold) { state.idleHold = value; } };
    return self;
}

function awaitingOf(state: { awaiting: string | null; lateAwaiting: string | null; awaitingReads: number; awaitingUnknown: boolean }): Waiting {
    if (state.awaitingUnknown) return unknown({ why: 'unreachable', detail: causeOf('pane.get') });
    const value = state.awaitingReads > 1 && state.lateAwaiting !== null ? state.lateAwaiting : state.awaiting;
    return value === null ? { kind: 'clear' } : { kind: 'waiting', value: must(parseText(value)) };
}

export const rows = (w: World): ReturnType<World['store']['autocompact']['newest']> => w.store.autocompact.newest(must(parseCount(20)));
