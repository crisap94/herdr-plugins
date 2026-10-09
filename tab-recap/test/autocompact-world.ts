// The autocompact service's test world: fakes for every port, one lane on one tab, and the helpers the gate tests share.
import { Autocompact } from '#src/recap/application/autocompact.ts';
import type { AutocompactDeps } from '#src/recap/application/autocompact.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { policyOf } from '#src/recap/domain/autocompact.ts';
import type { AutocompactPolicy } from '#src/recap/domain/autocompact.ts';
import type { Decider, DecidedResult } from '#src/ports/decider.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { memoryStore } from './db/support.ts';

export const NOW = 10_000_000;
export const lane = (agent = 'claude', status = 'idle'): Lane => laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, status });
export const SAFE = { closes_request: 0.95, announces_continuation: 0.05, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };

export interface World { readonly service: Autocompact; readonly events: string[]; awaiting: string | null; known: boolean; gate: Promise<void> | null; byPane: Record<string, number>; readonly store: ReturnType<typeof memoryStore>; readonly requests: CompactRequest[]; readonly logs: string[]; readonly asked: number[]; readonly refreshed: string[]; readonly reads: number[]; readonly clock: { at: number }; policy: AutocompactPolicy; inFlight: number | 'unknown'; share: number; decide: () => DecidedResult }

export function world(over: Partial<AutocompactPolicy> = {}, recap = true, startedAt = 0): World {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const [requests, logs, asked, refreshed, reads, events] = [[] as CompactRequest[], [] as string[], [] as number[], [] as string[], [] as number[], [] as string[]];
    const clock = { at: NOW };
    const state = { policy: { ...policyOf(() => undefined), mode: 'on' as const, ...over }, inFlight: 0 as number | 'unknown', awaiting: null as string | null, known: true, gate: null as Promise<void> | null, byPane: {} as Record<string, number>, share: 62, decide: (): DecidedResult => ({ kind: 'decided', answers: SAFE, tokens: 700, costUsd: 0.00003, tookMs: 550, model: 'fake' }) };
    const decider: Decider = { label: 'fake · m', ask: async (_state, questions) => { asked.push(Object.keys(questions).length); if (state.gate !== null) await state.gate; return state.decide(); } };
    const deps: AutocompactDeps = {
        policy: () => state.policy, decider: () => decider, contexts: { of: (pane) => (state.known ? { tokens: (state.byPane[pane] ?? state.share) * 10_000, window: 1_000_000, source: 'observed' } : null) }, inFlight: () => { reads.push(1); return Promise.resolve({ count: state.inFlight, why: 'test' }); },
        recent: () => Promise.resolve([{ role: 'user', text: 'publish it' }, { role: 'agent', text: 'Published.' }]), ledger: store.ledger, boundaries: store.boundaries, compactions: store.compactions, decisions: store.autocompact,
        requests: { requestCompact: (request) => { requests.push(request); } }, hasRecap: () => recap, refresh: (tab) => { refreshed.push(tab); return Promise.resolve(); },
        lanes: () => [lane()], now: () => clock.at, log: (line) => { logs.push(line); }, startedAt,
        awaiting: () => Promise.resolve(state.awaiting),
        events: { lane: (pane, kind, detail) => { events.push(`${pane} ${kind}${detail === undefined || detail === null ? '' : ` ${detail}`}`); } },
    };
    const self: World = { service: new Autocompact(deps), store, requests, logs, asked, refreshed, reads, clock, events,
        get awaiting() { return state.awaiting; }, set awaiting(value) { state.awaiting = value; }, get policy() { return state.policy; }, set policy(value) { state.policy = value; }, get inFlight() { return state.inFlight; }, set inFlight(value) { state.inFlight = value; }, get share() { return state.share; }, set share(value) { state.share = value; }, get known() { return state.known; }, set known(value) { state.known = value; }, get gate() { return state.gate; }, set gate(value) { state.gate = value; }, get byPane() { return state.byPane; }, set byPane(value) { state.byPane = value; }, get decide() { return state.decide; }, set decide(value) { state.decide = value; } };
    return self;
}

export const rows = (w: World): ReturnType<World['store']['autocompact']['newest']> => w.store.autocompact.newest(20);
