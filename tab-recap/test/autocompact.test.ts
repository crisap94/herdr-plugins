import { parseUsd } from '#src/recap/domain/usd.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { must as mustParsed } from '#src/protocol/result.ts';
import { parseCount, countOf } from '#src/recap/domain/count.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS } from '#src/recap/application/autocompact-questions.ts';
import { LaneDispatch } from '#src/recap/application/dispatch.ts';
import { silentClosures } from './fakes/silent-closures.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import { instant } from '#src/recap/domain/time.ts';
import type { ColumnPanes } from '#src/ports/columns.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabViewStore } from '#src/ports/tab-views.ts';
import type { DecidedAnswersResult } from '#src/ports/decider.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { causeOf } from './fakes/cause.ts';
import { must } from './db/support.ts';
import { NOW, SAFE, lane, rows, world } from './autocompact-world.ts';
import { decidedOf } from './fakes/decider-fixtures.ts';
import { SIZING } from './fakes/layout-values.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { reconciliation, seenLane } from '#test/support/seen.ts';

test('on: a safe moment between the limits is recorded, logged with its figures and requested once with origin auto', async () => {
    const w = world();
    await w.service.consider(lane());
    assert.deepEqual(w.requests, [{ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'auto' }]);
    const row = must(rows(w)[0]);
    assert.deepEqual([row.verdict, row.askedVerdict, row.gate, row.mode, row.share, row.decider, row.tookMs, Object.fromEntries(row.answers)], ['compact', 'compact', 'ask', 'on', 62, 'fake · m', 550, SAFE]);
    assert.equal(row.costUsd, 0.00003);
    assert.deepEqual(w.asked, [QUESTIONS.size]);
    assert.deepEqual(w.logs, ['autocompact w1:p1: 62 % · closes 0.95 · continues 0.05 · choice 0.02 · verbatim 0.10 · subject 0.03 · stuck 0.01 → compact (on)']);
});

test('shadow: the decision is recorded and logged with (shadow), and no request is made', async () => {
    const w = world({ mode: 'shadow' });
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, rows(w).length, rows(w)[0]?.mode, rows(w)[0]?.verdict], [0, 1, 'shadow', 'compact']);
    assert.match(w.logs[0] ?? '', /→ compact \(shadow\)$/);
});

test('a done lane is decided, and each decision stores the status its lane had', async () => {
    const done = world();
    done.share = 70;
    await done.service.consider(lane('claude', 'done'));
    const idle = world();
    idle.share = 70;
    await idle.service.consider(lane());
    assert.deepEqual([rows(done)[0]?.verdict, rows(done)[0]?.laneStatus, rows(idle)[0]?.laneStatus], ['compact', 'done', 'idle']);
});

test('off decides nothing; a lane that is working, or an unknown context, is not considered', async () => {
    const off = world({ mode: 'off' });
    await off.service.consider(lane());
    const working = world();
    await working.service.consider(lane('claude', 'working'));
    assert.deepEqual([off.asked.length, off.store.decisions.newest(mustParsed(parseCount(5))).length, working.asked.length, working.store.decisions.newest(mustParsed(parseCount(5))).length], [0, 0, 0, 0]);
});

test('below the minimum (8 %): no model, no decision; the lane keeps one skip, logged once', async () => {
    const w = world();
    w.share = 8;
    await w.service.consider(lane());
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length, w.requests.length, w.store.decisions.skips().map((skip) => [skip.gate, skip.share, skip.detail])], [0, 0, 0, [['below-minimum', 8, 'below 10 %']]]);
    assert.deepEqual(w.logs, ['autocompact w1:p1: 8 % → skip below-minimum (below 10 %)']);
});

test('known and unknown in-flight work block an idle lane: no model, decision or request', async () => {
    for (const inFlight of [1, 'unknown'] as const) {
        const w = world();
        w.inFlight = inFlight;
        await w.service.consider(lane());
        assert.deepEqual([w.asked.length, rows(w).length, w.requests.length], [0, 0, 0], String(inFlight));
        assert.equal(w.store.decisions.skips()[0]?.gate, 'in-flight');
    }
});

test('over the ceiling (81 %): compact with gate ceiling and no decider call; in shadow it is still not requested', async () => {
    const w = world();
    w.share = 81;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.requests.length, rows(w)[0]?.gate, rows(w)[0]?.verdict, rows(w)[0]?.askedVerdict, rows(w)[0]?.decider], [0, 1, 'ceiling', 'compact', 'compact', null]);
    assert.match(w.logs[0] ?? '', /81 % → compact \(ceiling, on\)/);
    const shadow = world({ mode: 'shadow' });
    shadow.share = 90;
    await shadow.service.consider(lane());
    assert.deepEqual([shadow.requests.length, shadow.store.decisions.newest(mustParsed(parseCount(1)))[0]?.gate], [0, 'ceiling']);
});

test('cooldown: a wait four minutes ago stops the next consideration before any model; after ten minutes it asks again', async () => {
    const w = world();
    w.store.decisions.record({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(NOW - 4 * 60_000), mode: 'on', share: countOf(60), tokens: mustParsed(parseCount(1)), window: mustParsed(parseCount(2)), gate: 'ask', verdict: 'wait', askedVerdict: 'wait', answers: new Map(), coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: mustParsed(parseUsd(0)), tookMs: null, why: null });
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length], [0, 1]);
    const later = world();
    later.store.decisions.record({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(NOW - 11 * 60_000), mode: 'on', share: countOf(60), tokens: mustParsed(parseCount(1)), window: mustParsed(parseCount(2)), gate: 'ask', verdict: 'wait', askedVerdict: 'wait', answers: new Map(), coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: mustParsed(parseUsd(0)), tookMs: null, why: null });
    await later.service.consider(lane());
    assert.equal(later.asked.length, 1);
});

test('a compaction in progress, or one just requested, stops a second request', async () => {
    const w = world();
    await w.service.consider(lane());
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length], [1, 1], 'the request has not begun yet: busy');
    const going = world();
    going.store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'compacting', at: instant(NOW) });
    await going.service.consider(lane());
    assert.equal(going.asked.length, 0);
});

test('a request still waiting to begin after 70 s (no compaction record yet) stops the second idle: no second request, and no second decision', async () => {
    const w = world({ cooldownMs: brand<number, 'Milliseconds'>(0) });
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
    cooling.store.decisions.record({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), at: instant(NOW - 4 * 60_000), mode: 'on', share: countOf(60), tokens: mustParsed(parseCount(1)), window: mustParsed(parseCount(2)), gate: 'ask', verdict: 'wait', askedVerdict: 'wait', answers: new Map(), coverage: null, coverageOutcome: null, coverageMs: null, coverageCostUsd: null, laneStatus: null, decider: null, costUsd: mustParsed(parseUsd(0)), tookMs: null, why: null });
    await cooling.service.consider(lane());
    const asking = world();
    await asking.service.consider(lane());
    assert.deepEqual([below.reads.length, cooling.reads.length, asking.reads.length], [0, 0, 1], 'the reader runs only when the lane would otherwise be asked');
});

test('a wait: not safe means wait, an undecided answer is recorded as undecided, and neither requests', async () => {
    const w = world();
    w.decide = (): DecidedAnswersResult => (decidedOf({ ...SAFE, asks_detailed_choice: 0.88 }));
    await w.service.consider(lane());
    const vague = world();
    vague.decide = (): DecidedAnswersResult => (decidedOf({ ...SAFE, needs_verbatim: 0.48 }));
    await vague.service.consider(lane());
    assert.deepEqual([rows(w)[0]?.verdict, rows(w)[0]?.askedVerdict, vague.store.decisions.newest(mustParsed(parseCount(1)))[0]?.verdict, w.requests.length + vague.requests.length], ['wait', 'wait', 'undecided', 0]);
});

test('a kind outside the list is decided and recorded but never requested', async () => {
    const w = world();
    await w.service.consider(lane('codex'));
    assert.deepEqual([rows(w)[0]?.verdict, rows(w)[0]?.agent, w.requests.length], ['compact', 'codex', 0]);
    assert.match(w.logs[0] ?? '', /record-only/);
});

test('three lanes in a row with the decider down: three unknown decisions and one log line about the outage; it logs again after an answer', async () => {
    const w = world({ cooldownMs: brand<number, 'Milliseconds'>(0) });
    w.decide = (): DecidedAnswersResult => unknown({ why: 'timeout', after: 10_000 as never });
    for (let i = 0; i < 3; i += 1) {
        w.share = 62 + i;
        await w.service.consider(lane());
    }
    assert.deepEqual(rows(w).map((row) => row.verdict), ['unknown', 'unknown', 'unknown']);
    assert.equal(w.logs.filter((line) => line.includes('the decider is unreachable')).length, 1);
    assert.equal(w.requests.length, 0);
    w.decide = (): DecidedAnswersResult => (decidedOf({ ...SAFE, stuck: 0.9 }));
    w.share = 63;
    await w.service.consider(lane());
    w.decide = (): DecidedAnswersResult => unknown({ why: 'unreachable', detail: causeOf('x') });
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
    const board = observe(emptyBoard(), { kind: 'reconciled', seen: reconciliation({ focusedTab: null, lanes: [seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', status: 'idle' })], panes: ['w1:p1'], columns: [], widths: new Map() }) }, instant(0), DEFAULT_POLICY).board;
    const dispatch = new LaneDispatch({
        columns: {} as ColumnPanes, views: { writeTab: (): void => undefined } as unknown as TabViewStore, visibility: {} as ColumnVisibility, recaps: { turnEnded: (): void => undefined, flush: (): Promise<void> => Promise.resolve() },
        prompts: { of: (): null => null, refresh: (): Promise<Presence> => Promise.resolve('absent') }, webs: { of: (): null => null, refresh: (): Promise<Presence> => Promise.resolve('absent') }, log: (): void => undefined,
        board: (): Board => board, sizing: (): Sizing => SIZING, feedback: (): void => undefined, settled: (found): void => { told.push(`${found.pane}:${found.status}`); },
        ...silentClosures,
    });
    for (const status of ['idle', 'done', 'working', 'blocked']) await dispatch.send({ kind: 'read-prompt', lane: lane('claude', status) });
    assert.deepEqual(told, ['w1:p1:idle', 'w1:p1:done']);
});

test('autocompact flushes the lane\'s pending recap after its gates pass and before it asks the decider (asked 0 at the flush)', async () => {
    const w = world();
    await w.service.consider(lane());
    assert.deepEqual([w.flushed, w.asked.length], [['w1:t1 autocompact asked 0'], 1]);
});

test('a lane that autocompact skips (below the minimum) does not flush its pending recap, so a paced tab keeps waiting', async () => {
    const w = world();
    w.share = 8;
    await w.service.consider(lane());
    assert.deepEqual([w.flushed, w.asked.length], [[], 0]);
});
