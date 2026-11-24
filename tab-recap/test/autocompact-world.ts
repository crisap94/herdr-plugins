import { parseCount, countOf } from '@stateforge-labs/session-ledger';
import { policyOf } from './fakes/settings-readers.ts';
import { parseText } from '@stateforge-labs/session-ledger';
import { instant, duration } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { SafePointWatch } from '@stateforge-labs/session-ledger';
import type { AutocompactDeps, IdleClaim } from '@stateforge-labs/session-ledger';
import { candidateOf } from '#src/daemon/autocompact.ts';
import { ACTIVE } from '@stateforge-labs/session-ledger';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { parseLaneStatusAtDecision } from '@stateforge-labs/session-ledger';
import type { Policy } from '@stateforge-labs/session-ledger';
import { tuningFrom } from '@stateforge-labs/session-ledger/compaction-timing';

import type { CompactTuning } from '@stateforge-labs/session-ledger';
import type { DecidedAnswersResult, DeciderPort } from '@stateforge-labs/session-ledger';
import type { CompactAsk } from '#src/ports/requests.ts';
import { memoryStore } from './db/support.ts';
import { unknown } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import type { Waiting } from '@stateforge-labs/session-ledger';
import { LaneClaims } from '#src/recap/application/lane-claims.ts';
import { flightReason, observedFrom, runningCount, unreadable } from '@stateforge-labs/session-ledger';
import type { BackgroundItem } from '@stateforge-labs/session-ledger';
import { decidedOf, textOf } from './fakes/decider-fixtures.ts';
import type { Candidate } from '@stateforge-labs/session-ledger/compaction-timing';
import { parseHarnessKind, parseScopeId, parseSessionKey } from '@stateforge-labs/session-ledger';
import type { IdleHold } from '@stateforge-labs/session-ledger';
import { seenLane } from '#test/support/seen.ts';

export const NOW = 10_000_000;
const SCOPE = must(parseScopeId('w1:t1'));
const KEY = must(parseSessionKey('w1:p1'));
const candidateWith = (harness: string): Candidate => ({ scope: SCOPE, key: KEY, harness: must(parseHarnessKind(harness)), ready: true });
const laneOf = (from: Candidate, status: string): Lane => laneFrom(seenLane({ paneId: from.key, tabId: from.scope, workspaceId: 'w1', agent: from.harness, status }));
export const lane = (agent = 'claude', status = 'idle'): Lane => laneOf(candidateWith(agent), status);
export const tuningOfKeys = (keys: Readonly<Record<string, string>>): CompactTuning => tuningFrom((key) => { const value = keys[key]; return value === undefined ? undefined : textOf(value); });
export const SAFE = { closes_request: 0.95, announces_continuation: 0.05, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };

export function candidateFor(found: Lane): Candidate {
    const candidate = candidateOf(found);
    if (candidate === null) throw new Error(`no candidate for lane ${found.pane}`);
    return candidate;
}

export interface LaneService {
    consider(seen: Lane): Promise<void>;
    prune(seen: readonly Lane[]): void;
    claimIdle(seen: Lane): IdleClaim;
}

export interface World { breakAt: number | null; readonly service: LaneService; readonly watch: SafePointWatch; readonly claims: LaneClaims; readonly queued: Set<string>;readonly events: string[]; awaiting: string | null; lateAwaiting: string | null; awaitingUnknown: boolean; known: boolean; gate: Promise<void> | null; byPane: Record<string, number>; readonly store: ReturnType<typeof memoryStore>; readonly requests: CompactAsk[]; readonly logs: string[]; readonly asked: number[]; readonly refreshed: string[]; readonly flushed: string[]; readonly reads: number[]; readonly clock: { at: number }; idleHold: IdleHold; policy: Policy; inFlight: number | 'unknown'; background: readonly BackgroundItem[]; share: number; decide: () => DecidedAnswersResult }

export function world(over: Partial<Policy> = {}, recap = true, startedAt = 0, tuning: Partial<CompactTuning> = {}): World {
    const store = memoryStore();
    store.db.prepare('INSERT INTO tab (id, first_seen, last_seen) VALUES (?, 1, 1)').run(SCOPE);
    const [requests, logs, asked, refreshed, reads, events] = [[] as CompactAsk[], [] as string[], [] as number[], [] as string[], [] as number[], [] as string[]];
    const flushed: string[] = [];
    const clock = { at: NOW };
    const state = { breakAt: null as number | null, policy: { ...policyOf(() => undefined), mode: 'on' as const, ...over }, tuning: { ...tuningFrom(() => undefined), ...tuning }, inFlight: 0 as number | 'unknown', background: [] as readonly BackgroundItem[], awaiting: null as string | null, lateAwaiting: null as string | null, awaitingReads: 0, awaitingUnknown: false, known: true, gate: null as Promise<void> | null, byPane: {} as Record<string, number>, share: 62, idleHold: 'on' as IdleHold, decide: (): DecidedAnswersResult => decidedOf(SAFE, { tokens: 700, costUsd: 0.00003, tookMs: duration(550) }) };
    const decider: DeciderPort = { label: textOf('fake · m'), ask: async (_state, questions) => { asked.push(questions.size); if (state.gate !== null) await state.gate; return state.decide(); } };
    const claims = new LaneClaims();
    const statuses = new WeakMap<Candidate, string>();
    const queued = new Set<string>();
    const deps: AutocompactDeps = {
        policy: () => state.policy, tuning: () => state.tuning, decider: () => decider, contexts: { of: (pane) => (state.known ? { tokens: countOf((state.byPane[pane] ?? state.share) * 10_000), window: countOf(1_000_000), source: 'observed' } : null) }, inFlight: () => { reads.push(1); return Promise.resolve(state.inFlight === 'unknown' ? unreadable(flightReason(textOf('test'))) : observedFrom(runningCount(countOf(state.inFlight)), state.background, flightReason(textOf(`${state.inFlight} running`)))); },
        recent: () => Promise.resolve([{ role: 'user', text: textOf('publish it') }, { role: 'agent', text: textOf('Published.') }]), ledger: store.ledger, sessions: { lastBreakAt: (scope, key) => state.breakAt ?? store.boundaries.lastBreakAt(tabId(scope), paneId(key)) }, activity: { activeFor: (scope, key) => store.compactions.shownFor(tabId(scope)).some((record) => record.pane === paneId(key) && ACTIVE.has(record.stage)) || claims.has(paneId(key)) === 'held' || queued.has(key), automaticInProgress: () => store.compactions.autoInProgress() === 'auto-in-progress' }, decisions: store.decisions,
        request: (ask) => { requests.push({ tab: tabId(ask.scope), pane: paneId(ask.key), note: ask.note === null ? null : textOf(ask.note), origin: 'auto' }); }, statusOf: (found) => parseLaneStatusAtDecision(statuses.get(found)), recaps: { ensure: (scope): Promise<void> => { flushed.push(`${String(scope)} autocompact asked ${asked.length}`); if (!recap) refreshed.push(scope); return Promise.resolve(); } }, idleHold: () => state.idleHold, now: () => instant(clock.at), log: (line) => { logs.push(line); }, startedAt: instant(startedAt),
        awaiting: () => { state.awaitingReads += 1; return Promise.resolve(awaitingOf(state)); },
        emit: (event) => { if (event.kind === 'session-skipped') events.push(`${event.key} autocompact-skipped ${event.gate}`); else if (event.kind === 'safe-point-decided') events.push(`${event.key} autocompact-decided ${event.verdict}-${event.share}`); },
    };
    const watch = new SafePointWatch(deps);
    const seen = (found: Lane): Candidate => { const candidate = candidateFor(found); statuses.set(candidate, found.status); return candidate; };
    const service: LaneService = { consider: (found) => watch.consider(seen(found)), prune: (found) => { watch.prune(found.map(seen)); }, claimIdle: (found) => watch.claimIdle(seen(found)) };
    const self: World = { get breakAt() { return state.breakAt; }, set breakAt(value: number | null) { state.breakAt = value; }, service, watch, claims, queued, store, requests, logs, asked, refreshed, flushed, reads, clock, events,
        get awaiting() { return state.awaiting; }, set awaiting(value) { state.awaiting = value; }, get lateAwaiting() { return state.lateAwaiting; }, set lateAwaiting(value) { state.lateAwaiting = value; },get awaitingUnknown() { return state.awaitingUnknown; }, set awaitingUnknown(value) { state.awaitingUnknown = value; }, get policy() { return state.policy; }, set policy(value) { state.policy = value; }, get inFlight() { return state.inFlight; }, set inFlight(value) { state.inFlight = value; }, get background() { return state.background; }, set background(value) { state.background = value; }, get share() { return state.share; }, set share(value) { state.share = value; }, get known() { return state.known; }, set known(value) { state.known = value; }, get gate() { return state.gate; }, set gate(value) { state.gate = value; }, get byPane() { return state.byPane; }, set byPane(value) { state.byPane = value; }, get decide() { return state.decide; }, set decide(value) { state.decide = value; }, get idleHold() { return state.idleHold; }, set idleHold(value: IdleHold) { state.idleHold = value; } };
    return self;
}

function awaitingOf(state: { awaiting: string | null; lateAwaiting: string | null; awaitingReads: number; awaitingUnknown: boolean }): Waiting {
    if (state.awaitingUnknown) return unknown({ why: 'unreachable', detail: causeOf('pane.get') });
    const value = state.awaitingReads > 1 && state.lateAwaiting !== null ? state.lateAwaiting : state.awaiting;
    return value === null ? { kind: 'clear' } : { kind: 'waiting', value: must(parseText(value)) };
}

export const rows = (w: World): ReturnType<World['store']['decisions']['newest']> => w.store.decisions.newest(must(parseCount(20)));
