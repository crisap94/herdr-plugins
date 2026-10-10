import { test } from 'node:test';
import assert from 'node:assert/strict';
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
import type { DecidedResult } from '#src/ports/decider.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { must } from './db/support.ts';
import { NOW, SAFE, lane, rows, world } from './autocompact-world.ts';

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

test('below the minimum (8 %): no model, no decision; the lane keeps one skip, logged once', async () => {
    const w = world();
    w.share = 8;
    await w.service.consider(lane());
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length, w.requests.length, w.store.autocompact.skips().map((skip) => [skip.gate, skip.share, skip.detail])], [0, 0, 0, [['below-minimum', 8, 'below 10 %']]]);
    assert.deepEqual(w.logs, ['autocompact w1:p1: 8 % → skip below-minimum (below 10 %)']);
});

test('known and unknown in-flight work block an idle lane: no model, decision or request', async () => {
    for (const inFlight of [1, 'unknown'] as const) {
        const w = world();
        w.inFlight = inFlight;
        await w.service.consider(lane());
        assert.deepEqual([w.asked.length, rows(w).length, w.requests.length], [0, 0, 0], String(inFlight));
        assert.equal(w.store.autocompact.skips()[0]?.gate, 'in-flight');
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

test('a request still waiting to begin after 70 s (no compaction record yet) stops the second idle: no second request, and no second decision', async () => {
    const w = world({ cooldownMs: 0 });
    await w.service.consider(lane());
    w.clock.at += 70_000;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length, rows(w).length], [1, 1, 1], 'the unlinked compact decision keeps the lane busy');
    w.clock.at += 6 * 60_000;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length], [1, 1], 'the same tokens: unchanged, nothing is asked again');
    w.share = 63;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length], [2, 2], 'changed tokens, and the five-minute window has passed: a request may be made again');
});

test('shadow: a second idle within the cooldown after a decision asks no decider and records no second row', async () => {
    const w = world({ mode: 'shadow' });
    await w.service.consider(lane());
    w.clock.at += 70_000;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length, w.requests.length], [1, 1, 0]);
});

test('a lane below the minimum (8 %), or within the cooldown, never reads the in-flight count', async () => {
    const below = world();
    below.share = 8;
    await below.service.consider(lane());
    const cooling = world();
    cooling.store.autocompact.record({ tab: 'w1:t1', pane: 'w1:p1', agent: 'claude', at: NOW - 4 * 60_000, mode: 'on', share: 60, tokens: 1, window: 2, gate: 'ask', verdict: 'wait', answers: {}, coverage: null, decider: null, costUsd: 0, tookMs: null, why: null });
    await cooling.service.consider(lane());
    const asking = world();
    await asking.service.consider(lane());
    assert.deepEqual([below.reads.length, cooling.reads.length, asking.reads.length], [0, 0, 1], 'the reader runs only when the lane would otherwise be asked');
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
    for (let i = 0; i < 3; i += 1) {
        w.share = 62 + i;
        await w.service.consider(lane());
    }
    assert.deepEqual(rows(w).map((row) => row.verdict), ['unknown', 'unknown', 'unknown']);
    assert.equal(w.logs.filter((line) => line.includes('the decider is unreachable')).length, 1);
    assert.equal(w.requests.length, 0);
    w.decide = (): DecidedResult => ({ kind: 'decided', answers: { ...SAFE, stuck: 0.9 }, tokens: 1, costUsd: 0, tookMs: 1, model: 'x' });
    w.share = 63;
    await w.service.consider(lane());
    w.decide = (): DecidedResult => unknown({ why: 'unreachable', detail: 'x' });
    w.share = 64;
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
