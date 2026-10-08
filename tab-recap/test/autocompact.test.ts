// The autocompact service with fakes: shadow records and never requests, on requests once, and the gates stop what they must before any model.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Autocompact } from '#src/recap/application/autocompact.ts';
import type { AutocompactDeps } from '#src/recap/application/autocompact.ts';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { Dispatch } from '#src/recap/application/dispatch.ts';
import type { RecapJob } from '#src/recap/application/recap-job.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { Columns } from '#src/ports/columns.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabViews } from '#src/ports/tab-views.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import type { Lane } from '#src/recap/domain/lane.ts';
import { policyOf } from '#src/recap/domain/autocompact.ts';
import type { AutocompactPolicy } from '#src/recap/domain/autocompact.ts';
import type { Decider, DecidedResult } from '#src/ports/decider.ts';
import type { CompactRequest } from '#src/ports/requests.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { memoryStore, must } from './db/support.ts';

const NOW = 10_000_000;
const lane = (agent = 'claude', status = 'idle'): Lane => laneFrom({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent, status });
const SAFE = { closes_request: 0.95, announces_continuation: 0.05, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };

interface World { readonly service: Autocompact; readonly store: ReturnType<typeof memoryStore>; readonly requests: CompactRequest[]; readonly logs: string[]; readonly asked: number[]; readonly refreshed: string[]; policy: AutocompactPolicy; inFlight: number | 'unknown'; share: number; decide: () => DecidedResult }

function world(over: Partial<AutocompactPolicy> = {}, recap = true): World {
    const store = memoryStore();
    store.db.prepare("INSERT INTO tab (id, first_seen, last_seen) VALUES ('w1:t1', 1, 1)").run();
    const [requests, logs, asked, refreshed] = [[] as CompactRequest[], [] as string[], [] as number[], [] as string[]];
    const state = { policy: { ...policyOf(() => undefined), mode: 'on' as const, ...over }, inFlight: 0 as number | 'unknown', share: 62, decide: (): DecidedResult => ({ kind: 'decided', answers: SAFE, tokens: 700, costUsd: 0.00003, tookMs: 550, model: 'fake' }) };
    const decider: Decider = { label: 'fake · m', ask: (_state, questions) => { asked.push(Object.keys(questions).length); return Promise.resolve(state.decide()); } };
    const deps: AutocompactDeps = {
        policy: () => state.policy, decider: () => decider, contexts: { of: () => ({ tokens: state.share * 10_000, window: 1_000_000, source: 'observed' }) }, inFlight: () => Promise.resolve(state.inFlight),
        recent: () => Promise.resolve([{ role: 'user', text: 'publish it' }, { role: 'agent', text: 'Published.' }]), ledger: store.ledger, boundaries: store.boundaries, compactions: store.compactions, decisions: store.autocompact,
        requests: { requestCompact: (request) => { requests.push(request); } }, hasRecap: () => recap, refresh: (tab) => { refreshed.push(tab); return Promise.resolve(); },
        lanes: () => [lane()], now: () => NOW, log: (line) => { logs.push(line); },
    };
    const self: World = { service: new Autocompact(deps), store, requests, logs, asked, refreshed, get policy() { return state.policy; }, set policy(value) { state.policy = value; }, get inFlight() { return state.inFlight; }, set inFlight(value) { state.inFlight = value; }, get share() { return state.share; }, set share(value) { state.share = value; }, get decide() { return state.decide; }, set decide(value) { state.decide = value; } };
    return self;
}

const rows = (w: World): ReturnType<World['store']['autocompact']['newest']> => w.store.autocompact.newest(20);

test('on: a safe moment between the limits is recorded, logged with its figures and requested once with origin auto', async () => {
    const w = world();
    await w.service.consider(lane());
    assert.deepEqual(w.requests, [{ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'auto' }]);
    const row = must(rows(w)[0]);
    assert.deepEqual([row.verdict, row.gate, row.mode, row.share, row.decider, row.tookMs, row.answers], ['compact', 'ask', 'on', 62, 'fake · m', 550, SAFE]);
    assert.equal(row.costUsd, 0.00003);
    assert.deepEqual(w.asked, [Object.keys(QUESTIONS).length]);
    assert.deepEqual(w.logs, ['autocompact w1:p1: 62 % · closes 0.95 · continues 0.05 · choice 0.02 · verbatim 0.10 · subject 0.03 · stuck 0.01 → compact (on)']);
});

test('shadow: the decision is recorded and logged with (shadow), and no request is made', async () => {
    const w = world({ mode: 'shadow' });
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, rows(w).length, rows(w)[0]?.mode, rows(w)[0]?.verdict], [0, 1, 'shadow', 'compact']);
    assert.match(w.logs[0] ?? '', /→ compact \(shadow\)$/);
});

test('off decides nothing; a lane that is working, or an unknown context, is not considered', async () => {
    const off = world({ mode: 'off' });
    await off.service.consider(lane());
    const working = world();
    await working.service.consider(lane('claude', 'working'));
    assert.deepEqual([off.asked.length, off.store.autocompact.newest(5).length, working.asked.length, working.store.autocompact.newest(5).length], [0, 0, 0, 0]);
});

test('below the soft limit (31 %): no model, nothing recorded', async () => {
    const w = world();
    w.share = 31;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length, w.requests.length, w.logs.length], [0, 0, 0, 0]);
});

test('something in flight (or a reader that cannot tell): no model, no decision, no request', async () => {
    for (const inFlight of [1, 'unknown'] as const) {
        const w = world();
        w.inFlight = inFlight;
        await w.service.consider(lane());
        assert.deepEqual([w.asked.length, rows(w).length, w.requests.length], [0, 0, 0], String(inFlight));
    }
});

test('over the ceiling (81 %): compact with gate ceiling and no decider call; in shadow it is still not requested', async () => {
    const w = world();
    w.share = 81;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.requests.length, rows(w)[0]?.gate, rows(w)[0]?.verdict, rows(w)[0]?.decider], [0, 1, 'ceiling', 'compact', null]);
    assert.match(w.logs[0] ?? '', /81 % → compact \(ceiling, on\)/);
    const shadow = world({ mode: 'shadow' });
    shadow.share = 90;
    await shadow.service.consider(lane());
    assert.deepEqual([shadow.requests.length, shadow.store.autocompact.newest(1)[0]?.gate], [0, 'ceiling']);
});

test('cooldown: a wait four minutes ago stops the next consideration before any model; after ten minutes it asks again', async () => {
    const w = world();
    w.store.autocompact.record({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: NOW - 4 * 60_000, mode: 'on', share: 60, tokens: 1, window: 2, gate: 'ask', verdict: 'wait', answers: {}, coverage: null, decider: null, costUsd: 0, tookMs: null, why: null });
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length], [0, 1]);
    const later = world();
    later.store.autocompact.record({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: NOW - 11 * 60_000, mode: 'on', share: 60, tokens: 1, window: 2, gate: 'ask', verdict: 'wait', answers: {}, coverage: null, decider: null, costUsd: 0, tookMs: null, why: null });
    await later.service.consider(lane());
    assert.equal(later.asked.length, 1);
});

test('a compaction in progress, or one just requested, stops a second request', async () => {
    const w = world();
    await w.service.consider(lane());
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length], [1, 1], 'the request has not begun yet: busy');
    const going = world();
    going.store.compactions.begin({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', stage: 'compacting', at: NOW });
    await going.service.consider(lane());
    assert.equal(going.asked.length, 0);
});

test('a wait: not safe means wait, an undecided answer is recorded as undecided, and neither requests', async () => {
    const w = world();
    w.decide = (): DecidedResult => ({ kind: 'decided', answers: { ...SAFE, asks_detailed_choice: 0.88 }, tokens: 1, costUsd: 0, tookMs: 1, model: 'x' });
    await w.service.consider(lane());
    const vague = world();
    vague.decide = (): DecidedResult => ({ kind: 'decided', answers: { ...SAFE, needs_verbatim: 0.48 }, tokens: 1, costUsd: 0, tookMs: 1, model: 'x' });
    await vague.service.consider(lane());
    assert.deepEqual([rows(w)[0]?.verdict, vague.store.autocompact.newest(1)[0]?.verdict, w.requests.length + vague.requests.length], ['wait', 'undecided', 0]);
});

test('a kind outside the list is decided and recorded but never requested', async () => {
    const w = world();
    await w.service.consider(lane('codex'));
    assert.deepEqual([rows(w)[0]?.verdict, rows(w)[0]?.agent, w.requests.length], ['compact', 'codex', 0]);
    assert.match(w.logs[0] ?? '', /record-only/);
});

test('three lanes in a row with the decider down: three unknown decisions and one log line about the outage; it logs again after an answer', async () => {
    const w = world({ cooldownMs: 0 });
    w.decide = (): DecidedResult => unknown({ why: 'timeout', after: 10_000 as never });
    for (let i = 0; i < 3; i += 1) await w.service.consider(lane());
    assert.deepEqual(rows(w).map((row) => row.verdict), ['unknown', 'unknown', 'unknown']);
    assert.equal(w.logs.filter((line) => line.includes('the decider is unreachable')).length, 1);
    assert.equal(w.requests.length, 0);
    w.decide = (): DecidedResult => ({ kind: 'decided', answers: { ...SAFE, stuck: 0.9 }, tokens: 1, costUsd: 0, tookMs: 1, model: 'x' });
    await w.service.consider(lane());
    w.decide = (): DecidedResult => unknown({ why: 'unreachable', detail: 'x' });
    await w.service.consider(lane());
    assert.equal(w.logs.filter((line) => line.includes('the decider is unreachable')).length, 2);
});

test('a lane with no recap has one written first, then it is decided', async () => {
    const w = world({}, false);
    await w.service.consider(lane());
    assert.deepEqual([w.refreshed, w.asked.length], [['w1:t1'], 1]);
    const has = world();
    await has.service.consider(lane());
    assert.deepEqual(has.refreshed, []);
});

test('dispatch: a read-prompt of a lane that is idle or done tells the settled hook (not awaited); a working lane does not', async () => {
    const told: string[] = [];
    const board = observe(emptyBoard(), { kind: 'reconciled', seen: { focusedTab: null, lanes: [{ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' }], panes: ['w1:p1'], columns: [], widths: new Map() } }, instant(0), DEFAULT_POLICY).board;
    const dispatch = new Dispatch({
        columns: {} as Columns, views: { writeTab: (): void => undefined } as unknown as TabViews, visibility: {} as ColumnVisibility, recaps: {} as RecapJob,
        prompts: { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) }, webs: { of: (): null => null, refresh: (): Promise<boolean> => Promise.resolve(false) }, log: (): void => undefined,
        board: (): Board => board, sizing: (): Sizing => ({ fraction: 0.3, minCols: 36, maxCols: 64 }), feedback: (): void => undefined, settled: (found): void => { told.push(`${found.pane}:${found.status}`); },
    });
    for (const status of ['idle', 'done', 'working', 'blocked']) await dispatch.send({ kind: 'read-prompt', lane: lane('claude', status) });
    assert.deepEqual(told, ['w1:p1:idle', 'w1:p1:done']);
});
