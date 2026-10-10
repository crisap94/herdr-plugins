import { Autocompact } from '#src/recap/application/autocompact.ts';
import type { AutocompactDeps } from '#src/recap/application/autocompact.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { policyOf } from '#src/recap/domain/autocompact.ts';
import type { AutocompactPolicy } from '#src/recap/domain/autocompact.ts';
import { tuningOf } from '#src/recap/domain/autocompact-style.ts';
import type { AutocompactTuning } from '#src/recap/domain/autocompact-style.ts';
import type { Decider, DecidedResult } from '#src/ports/decider.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { memoryStore } from './db/support.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { Waiting } from '#src/recap/application/autocompact.ts';
import { CompactionClaims } from '#src/recap/application/compaction-claims.ts';

export const NOW = 10_000_000;
export const lane = (agent = 'claude', status = 'idle'): Lane => laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, status });
export const SAFE = { closes_request: 0.95, announces_continuation: 0.05, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };

export interface World { breakAt: number | null; readonly service: Autocompact; readonly claims: CompactionClaims; readonly queued: Set<string>;readonly events: string[]; awaiting: string | null; awaitingUnknown: boolean; known: boolean; gate: Promise<void> | null; byPane: Record<string, number>; readonly store: ReturnType<typeof memoryStore>; readonly requests: CompactRequest[]; readonly logs: string[]; readonly asked: number[]; readonly refreshed: string[]; readonly reads: number[]; readonly clock: { at: number }; policy: AutocompactPolicy; inFlight: number | 'unknown'; share: number; decide: () => DecidedResult }

export function world(over: Partial<AutocompactPolicy> = {}, recap = true, startedAt = 0, tuning: Partial<AutocompactTuning> = {}): World {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const [requests, logs, asked, refreshed, reads, events] = [[] as CompactRequest[], [] as string[], [] as number[], [] as string[], [] as number[], [] as string[]];
    const clock = { at: NOW };
    const state = { breakAt: null as number | null, policy: { ...policyOf(() => undefined), mode: 'on' as const, ...over }, tuning: { ...tuningOf(() => undefined), ...tuning }, inFlight: 0 as number | 'unknown', awaiting: null as string | null, awaitingUnknown: false, known: true, gate: null as Promise<void> | null, byPane: {} as Record<string, number>, share: 62, decide: (): DecidedResult => ({ kind: 'decided', answers: SAFE, tokens: 700, costUsd: 0.00003, tookMs: 550, model: 'fake' }) };
    const decider: Decider = { label: 'fake · m', ask: async (_state, questions) => { asked.push(Object.keys(questions).length); if (state.gate !== null) await state.gate; return state.decide(); } };
    const claims = new CompactionClaims();
    const queued = new Set<string>();
    const deps: AutocompactDeps = {
        policy: () => state.policy, tuning: () => state.tuning, decider: () => decider, contexts: { of: (pane) => (state.known ? { tokens: (state.byPane[pane] ?? state.share) * 10_000, window: 1_000_000, source: 'observed' } : null) }, inFlight: () => { reads.push(1); return Promise.resolve({ count: state.inFlight, why: 'test' }); },
        recent: () => Promise.resolve([{ role: 'user', text: 'publish it' }, { role: 'agent', text: 'Published.' }]), ledger: store.ledger, boundaries: { lastBreakAt: (tab: string, pane: string) => state.breakAt ?? store.boundaries.lastBreakAt(tab, pane) }, compactions: store.compactions, decisions: store.autocompact,
        requests: { requestCompact: (request) => { requests.push(request); } }, claims, queue: { compactQueued: (_tab, pane) => queued.has(pane) }, hasRecap: () => recap, refresh: (tab) => { refreshed.push(tab); return Promise.resolve(); },
        lanes: () => [lane()], now: () => clock.at, log: (line) => { logs.push(line); }, startedAt,
        awaiting: () => Promise.resolve(awaitingOf(state)),
        events: { lane: (pane, kind, detail) => { events.push(`${pane} ${kind}${detail === undefined || detail === null ? '' : ` ${detail}`}`); }, inWorkspace: () => undefined },
    };
    const self: World = { get breakAt() { return state.breakAt; }, set breakAt(value: number | null) { state.breakAt = value; }, service: new Autocompact(deps), claims, queued, store, requests, logs, asked, refreshed, reads, clock, events,
        get awaiting() { return state.awaiting; }, set awaiting(value) { state.awaiting = value; }, get awaitingUnknown() { return state.awaitingUnknown; }, set awaitingUnknown(value) { state.awaitingUnknown = value; }, get policy() { return state.policy; }, set policy(value) { state.policy = value; }, get inFlight() { return state.inFlight; }, set inFlight(value) { state.inFlight = value; }, get share() { return state.share; }, set share(value) { state.share = value; }, get known() { return state.known; }, set known(value) { state.known = value; }, get gate() { return state.gate; }, set gate(value) { state.gate = value; }, get byPane() { return state.byPane; }, set byPane(value) { state.byPane = value; }, get decide() { return state.decide; }, set decide(value) { state.decide = value; } };
    return self;
}

function awaitingOf(state: { awaiting: string | null; awaitingUnknown: boolean }): Waiting {
    if (state.awaitingUnknown) return unknown({ why: 'unreachable', detail: 'pane.get' });
    return state.awaiting === null ? { kind: 'clear' } : { kind: 'waiting', value: state.awaiting };
}

export const rows = (w: World): ReturnType<World['store']['autocompact']['newest']> => w.store.autocompact.newest(20);
