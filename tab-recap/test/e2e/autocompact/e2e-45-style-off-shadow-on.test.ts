import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backgroundItem, backgroundLabel, backgroundTool, brand, countOf, duration, instant, must, parseCount, textOf, unknown } from '@stateforge-labs/session-ledger';
import type { DecidedAnswersResult, DecisionMode, WatchMode } from '@stateforge-labs/session-ledger';
import { QUESTIONS } from '@stateforge-labs/session-ledger/compaction-timing';
import { LaneDispatch } from '#src/recap/application/dispatch.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import { observe } from '#src/recap/domain/fold.ts';
import type { Sizing } from '#src/recap/domain/layout.ts';
import { DEFAULT_POLICY } from '#src/recap/domain/policy.ts';
import type { ColumnPanes } from '#src/ports/columns.ts';
import type { ColumnVisibility } from '#src/ports/column-visibility.ts';
import type { TabViewStore } from '#src/ports/tab-views.ts';
import type { Presence } from '#src/recap/domain/presence.ts';
import { silentClosures } from '#test/fakes/silent-closures.ts';
import { SIZING } from '#test/fakes/layout-values.ts';
import { causeOf } from '#test/fakes/cause.ts';
import { decidedOf } from '#test/fakes/decider-fixtures.ts';
import { policyOf } from '#test/fakes/settings-readers.ts';
import { reconciliation, seenLane } from '#test/support/seen.ts';
import { NOW, SAFE, lane, rows, tuningOfKeys, world } from '#test/autocompact-world.ts';
import type { World } from '#test/autocompact-world.ts';
import { MINUTE, draftOf, laneAt } from '../support/autocompact-drafts.ts';

const env = (keys: Readonly<Record<string, string>>) => (key: string): string | undefined => keys[key];

function styled(keys: Readonly<Record<string, string>>, mode: WatchMode = 'on'): World {
    return world({ ...policyOf(env(keys)), mode }, true, 0, tuningOfKeys(keys));
}

const answer = (closes: number, rest = 0.15): DecidedAnswersResult => decidedOf({ closes_request: closes, announces_continuation: rest, asks_detailed_choice: rest, needs_verbatim: rest, changes_subject: rest, stuck: rest });

const monitor = backgroundItem(backgroundTool(textOf('Monitor')), backgroundLabel(textOf('open merge requests')));
const monitorNote = 'Still running: Monitor "open merge requests".';

test('off decides nothing: no model, no decision, and a lane that is working is not considered under on either', { timeout: 30_000 }, async () => {
    const off = world({ mode: 'off' });
    await off.service.consider(lane());
    const working = world();
    await working.service.consider(lane('claude', 'working'));
    assert.deepEqual([off.asked.length, rows(off).length, off.requests.length, working.asked.length, rows(working).length, working.requests.length], [0, 0, 0, 0, 0, 0]);
});

test('shadow decides and logs with (shadow) but types nothing: the row has mode shadow and no request is made', { timeout: 30_000 }, async () => {
    const w = world({ mode: 'shadow' });
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, rows(w).length, rows(w)[0]?.mode, rows(w)[0]?.verdict], [0, 1, 'shadow', 'compact']);
    assert.match(w.logs[0] ?? '', /→ compact \(shadow\)$/);
    assert.deepEqual(w.events, ['w1:p1 autocompact-decided compact-62']);
});

test('shadow over the ceiling is still decided with gate ceiling and not requested', { timeout: 30_000 }, async () => {
    const w = world({ mode: 'shadow' });
    w.share = 90;
    await w.service.consider(lane());
    assert.deepEqual([w.requests.length, w.asked.length, rows(w)[0]?.gate], [0, 0, 'ceiling']);
});

test('shadow: a second idle within the cooldown after a decision asks no decider and records no second row', { timeout: 30_000 }, async () => {
    const w = world({ mode: 'shadow' });
    await w.service.consider(lane());
    w.clock.at += 70_000;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length, w.requests.length], [1, 1, 0]);
});

test('on records a safe moment with its answers, decider and cost, logs its figures and requests once with origin auto', { timeout: 30_000 }, async () => {
    const w = world();
    await w.service.consider(lane());
    assert.deepEqual(w.requests, [{ tab: 'w1:t1', pane: 'w1:p1', note: null, origin: 'auto' }]);
    const row = rows(w)[0];
    assert.ok(row !== undefined, 'the decision is recorded');
    assert.deepEqual([row.verdict, row.askedVerdict, row.gate, row.mode, row.share, row.decider, row.tookMs, Object.fromEntries(row.answers)], ['compact', 'compact', 'ask', 'on', 62, 'fake · m', 550, SAFE]);
    assert.equal(row.costUsd, 0.00003);
    assert.deepEqual(w.asked, [QUESTIONS.size]);
    assert.deepEqual(w.logs, ['autocompact w1:p1: 62 % · closes 0.95 · continues 0.05 · choice 0.02 · verbatim 0.10 · subject 0.03 · stuck 0.01 → compact (on)']);
});

test('on over the ceiling at 81 % is compact with gate ceiling, no decider and a request', { timeout: 30_000 }, async () => {
    const w = world();
    w.share = 81;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, w.requests.length, rows(w)[0]?.gate, rows(w)[0]?.verdict, rows(w)[0]?.askedVerdict, rows(w)[0]?.decider], [0, 1, 'ceiling', 'compact', 'compact', null]);
    assert.match(w.logs[0] ?? '', /81 % → compact \(ceiling, on\)/);
});

test('a done lane is decided as well, and each decision stores the status its lane had', { timeout: 30_000 }, async () => {
    const done = world();
    done.share = 70;
    await done.service.consider(lane('claude', 'done'));
    const idle = world();
    idle.share = 70;
    await idle.service.consider(lane());
    assert.deepEqual([rows(done)[0]?.verdict, rows(done)[0]?.laneStatus, rows(idle)[0]?.laneStatus], ['compact', 'done', 'idle']);
});

test('not safe means wait and an unsure answer is undecided; neither is requested', { timeout: 30_000 }, async () => {
    const w = world();
    w.decide = (): DecidedAnswersResult => decidedOf({ ...SAFE, asks_detailed_choice: 0.88 });
    await w.service.consider(lane());
    const vague = world();
    vague.decide = (): DecidedAnswersResult => decidedOf({ ...SAFE, needs_verbatim: 0.48 });
    await vague.service.consider(lane());
    assert.deepEqual([rows(w)[0]?.verdict, rows(w)[0]?.askedVerdict, rows(vague)[0]?.verdict, w.requests.length + vague.requests.length], ['wait', 'wait', 'undecided', 0]);
});

test('with the decider down three lanes give three unknown decisions and one outage line; it is logged again after an answer', { timeout: 30_000 }, async () => {
    const w = world({ cooldownMs: brand<number, 'Milliseconds'>(0) });
    w.decide = (): DecidedAnswersResult => unknown({ why: 'timeout', after: duration(10_000) });
    for (let i = 0; i < 3; i += 1) {
        w.share = 62 + i;
        await w.service.consider(lane());
    }
    assert.deepEqual(rows(w).map((row) => row.verdict), ['unknown', 'unknown', 'unknown']);
    assert.equal(w.logs.filter((line) => line.includes('the decider is unreachable')).length, 1);
    assert.equal(w.requests.length, 0);
    w.decide = (): DecidedAnswersResult => decidedOf({ ...SAFE, stuck: 0.9 });
    w.share = 63;
    await w.service.consider(lane());
    w.decide = (): DecidedAnswersResult => unknown({ why: 'unreachable', detail: causeOf('x') });
    w.share = 64;
    await w.service.consider(lane());
    assert.equal(w.logs.filter((line) => line.includes('the decider is unreachable')).length, 2);
});

test('kinds are respected: a shadow Codex lane records with shadow mode while an enabled Claude lane compacts normally', { timeout: 30_000 }, async () => {
    const w = world({ mode: 'on', kinds: ['claude', 'codex'], shadowKinds: ['codex'] });
    await w.service.consider(lane('codex', 'idle'));
    await w.service.consider(laneAt('w1:p2'));
    const decisions = rows(w);
    assert.equal(decisions.length, 2);
    assert.deepEqual(decisions.map(({ agent, mode }) => [agent, mode]), [['claude', 'on'], ['codex', 'shadow']]);
    assert.equal(decisions.find(({ agent }) => agent === 'codex')?.gate, 'ask');
    assert.deepEqual(w.requests.map(({ pane }) => pane), ['w1:p2']);
});

test('kinds are respected: a lane of a kind outside the list is decided and recorded but never requested, with or without being a shadow kind', { timeout: 30_000 }, async () => {
    const codex = world();
    await codex.service.consider(lane('codex'));
    assert.deepEqual([rows(codex)[0]?.verdict, rows(codex)[0]?.agent, codex.requests.length], ['compact', 'codex', 0]);
    assert.match(codex.logs[0] ?? '', /record-only/);
    const omitted = world({ mode: 'on', kinds: ['codex'] });
    await omitted.service.consider(lane('claude', 'idle'));
    assert.equal(rows(omitted)[0]?.mode, 'on');
    assert.ok(omitted.logs.some((line) => line.includes('→ compact (on, record-only)')));
    assert.deepEqual(omitted.requests, []);
});

test('the style sets the verdict: a close of 0.65 compacts under eager and is undecided under balanced and gentle', { timeout: 30_000 }, async () => {
    const outcomes: Array<[string, string | undefined, number]> = [];
    for (const style of ['eager', 'balanced', 'gentle']) {
        const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: style });
        w.decide = (): DecidedAnswersResult => answer(0.65);
        await w.service.consider(lane());
        outcomes.push([style, rows(w)[0]?.verdict, w.requests.length]);
    }
    assert.deepEqual(outcomes, [['eager', 'compact', 1], ['balanced', 'undecided', 0], ['gentle', 'undecided', 0]]);
});

test('the style sets the verdict: a warning of 0.25 is a wait under gentle and compact under balanced and eager', { timeout: 30_000 }, async () => {
    const warned = { closes_request: 0.95, announces_continuation: 0.25, asks_detailed_choice: 0.02, needs_verbatim: 0.10, changes_subject: 0.03, stuck: 0.01 };
    const verdicts: Array<string | undefined> = [];
    for (const style of ['gentle', 'balanced', 'eager']) {
        const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: style });
        w.decide = (): DecidedAnswersResult => decidedOf(warned);
        await w.service.consider(lane());
        verdicts.push(rows(w)[0]?.verdict);
    }
    assert.deepEqual(verdicts, ['wait', 'compact', 'compact']);
});

test('the re-check asks an unchanged lane again only after a wait or an undecided answer, in on and shadow; a compact one is not asked again', { timeout: 30_000 }, async () => {
    const cases: Array<[string, 'wait' | 'undecided' | 'compact', DecisionMode]> = [['wait', 'wait', 'on'], ['undecided', 'undecided', 'on'], ['compact', 'compact', 'on'], ['shadow wait', 'wait', 'shadow']];
    const outcomes = [];
    for (const [name, verdict, mode] of cases) {
        const w = styled({ TAB_RECAP_AUTOCOMPACT_STYLE: 'eager' }, mode);
        w.store.decisions.record(draftOf({ at: instant(NOW - 35 * MINUTE), mode, verdict, askedVerdict: verdict, share: countOf(12), tokens: must(parseCount(120_000)), window: must(parseCount(1_000_000)) }));
        w.share = 12;
        await w.service.consider(lane());
        outcomes.push([name, w.asked.length, w.logs.some((line) => line.endsWith('unchanged → recheck'))]);
    }
    assert.deepEqual(outcomes, [['wait', 1, true], ['undecided', 1, true], ['compact', 0, false], ['shadow wait', 1, true]]);
});

test('a full lane waiting on two others is compacted over the wait, and the request carries a note naming what it waits for and what keeps running', { timeout: 30_000 }, async () => {
    const w = world();
    w.awaiting = 'reviewer,tester';
    w.share = 92;
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w)[0]?.verdict, rows(w)[0]?.gate, rows(w)[0]?.why], [0, 'compact', 'ceiling', 'ceiling-overrides-wait (awaiting reviewer,tester)']);
    assert.deepEqual(w.requests.map((request) => request.note), ['Still waiting for: reviewer,tester.']);
    const both = world();
    both.awaiting = 'reviewer';
    both.background = [monitor];
    both.share = 92;
    await both.service.consider(lane());
    assert.deepEqual(both.requests.map((request) => request.note), [`Still waiting for: reviewer. ${monitorNote}`]);
});

test('a lane with nothing to name has no note, and a lane with only a monitor keeps running with a note and is asked', { timeout: 30_000 }, async () => {
    const plain = world();
    plain.share = 85;
    await plain.service.consider(lane());
    assert.deepEqual([plain.requests.length, plain.requests[0]?.note], [1, null]);
    const watched = world();
    watched.share = 45;
    watched.background = [monitor];
    await watched.service.consider(lane());
    assert.deepEqual([watched.asked.length, rows(watched)[0]?.gate, rows(watched)[0]?.why], [1, 'ask', 'background: 1 kept running']);
    assert.deepEqual(watched.requests.map((request) => request.note), [monitorNote]);
});

test('a lane with no recap has one written first and is decided; a lane that has one is not refreshed; the flush comes after the gates and before the decider', { timeout: 30_000 }, async () => {
    const bare = world({}, false);
    await bare.service.consider(lane());
    assert.deepEqual([bare.refreshed, bare.asked.length], [['w1:t1'], 1]);
    const has = world();
    await has.service.consider(lane());
    assert.deepEqual([has.refreshed, has.flushed, has.asked.length], [[], ['w1:t1 autocompact asked 0'], 1]);
});

test('a read-prompt of a lane that is idle or done tells the settled hook, a working or blocked lane does not', { timeout: 30_000 }, async () => {
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
