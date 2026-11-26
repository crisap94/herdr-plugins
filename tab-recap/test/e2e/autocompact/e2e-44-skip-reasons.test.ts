import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOf, flightReason, inFlightReason, instant, must, observedFrom, parseText, runningCount, runningOf, sourcePathOf, textOf, unknown, unreadable } from '@stateforge-labs/session-ledger';
import type { Located, InFlightResult, LegacySessionReader as SessionReader } from '@stateforge-labs/session-ledger';
import { TranscriptInFlight } from '#src/adapters/transcripts/in-flight.ts';
import { flightOf } from '#src/recap/application/in-flight.ts';
import type { InFlightReader, InFlightRead } from '#src/ports/in-flight.ts';
import { registryWith } from '#test/fakes/transcript-registry.ts';
import { causeOf } from '#test/fakes/cause.ts';
import { agentKind, paneId, tabId } from '#test/support/ids.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { seenLane } from '#test/support/seen.ts';
import { NOW, lane, rows, world } from '#test/autocompact-world.ts';
import { MINUTE, draftOf, laneAt, skipsOf } from '../support/autocompact-drafts.ts';

const claudeLane = laneFrom(seenLane({ paneId: 'w1:p1', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', session: 'sess-1', cwd: '/repo' }));
const codexLane = laneFrom(seenLane({ paneId: 'w1:p2', tabId: 'w1:t1', workspaceId: 'w1', agent: 'codex', cwd: '/repo' }));
const sessionless = laneFrom(seenLane({ paneId: 'w1:p3', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude' }));

function fakeReader(agent: string, located: Located, flight: InFlightResult): SessionReader {
    return {
        agent: agentKind(agent),
        locate: () => Promise.resolve(located),
        read: () => Promise.reject(new Error('unused')),
        latestPrompt: () => Promise.reject(new Error('unused')),
        inFlight: { kind: 'supported', split: { kind: 'foreground-only', why: 'codex-cells' }, read: () => Promise.resolve(flight) },
    };
}

const adapterFor = (reader: SessionReader): InFlightReader => new TranscriptInFlight(registryWith({ [reader.agent]: reader }));

test('below the minimum nothing is asked, decided or typed: the lane keeps one skip row with its share and detail, logged once, and the in-flight reader is never read', { timeout: 30_000 }, async () => {
    const w = world();
    w.share = 8;
    await w.service.consider(lane());
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length, w.requests.length, w.reads.length], [0, 0, 0, 0]);
    assert.deepEqual(skipsOf(w), [['below-minimum', 8, 'below 10 %']]);
    assert.deepEqual(w.logs, ['autocompact w1:p1: 8 % → skip below-minimum (below 10 %)']);
    assert.deepEqual(w.flushed, [], 'a skipped lane does not flush its pending recap');
});

test('a wait four minutes ago holds the lane in its cooldown before any model or in-flight read; after eleven minutes it is asked again', { timeout: 30_000 }, async () => {
    const w = world();
    w.store.decisions.record(draftOf({ at: instant(NOW - 4 * MINUTE) }));
    await w.service.consider(lane());
    assert.deepEqual([w.asked.length, rows(w).length, w.reads.length, w.requests.length], [0, 1, 0, 0]);
    assert.deepEqual(skipsOf(w), [['cooldown', 62, '360 s left']]);
    const later = world();
    later.store.decisions.record(draftOf({ at: instant(NOW - 11 * MINUTE) }));
    await later.service.consider(lane());
    assert.deepEqual([later.asked.length, later.reads.length], [1, 1]);
});

test('open work holds an idle lane: a count of 2 or an unreadable reader gives an in-flight skip and no model, decision or request', { timeout: 30_000 }, async () => {
    const counted = world();
    counted.inFlight = 2;
    await counted.service.consider(lane());
    const blind = world();
    blind.inFlight = 'unknown';
    await blind.service.consider(lane());
    assert.deepEqual(skipsOf(counted), [['in-flight', 62, '2 running']]);
    assert.deepEqual(skipsOf(blind), [['in-flight', 62, 'test']]);
    assert.deepEqual([counted, blind].map((each) => [each.asked.length, rows(each).length, each.requests.length]), [[0, 0, 0], [0, 0, 0]]);
});

test('a lane that is idle and one that is done are both held by open transcript work; a shadow kind is held too and queues nothing', { timeout: 30_000 }, async () => {
    const w = world({ mode: 'on' });
    w.inFlight = 2;
    for (const status of ['idle', 'done']) {
        await w.service.consider(lane('claude', status));
        const skip = w.store.decisions.skips().find((each) => each.agent === 'claude');
        assert.deepEqual([skip?.gate, skip?.detail], ['in-flight', '2 running'], status);
        assert.deepEqual(w.requests, []);
        w.store.decisions.pruneSkips([]);
    }
    assert.deepEqual(rows(w), []);
    const shadow = world({ mode: 'on', shadowKinds: ['codex'] });
    shadow.inFlight = 1;
    await shadow.service.consider(lane('codex', 'idle'));
    const skip = shadow.store.decisions.skips().find((each) => each.agent === 'codex');
    assert.deepEqual([skip?.gate, skip?.detail, rows(shadow), shadow.requests], ['in-flight', '1 running', [], []]);
});

test('a compaction in progress holds the lane: a busy skip naming this lane, and nothing is asked', { timeout: 30_000 }, async () => {
    const w = world();
    w.store.compactions.begin({ tab: tabId('w1:t1'), pane: paneId('w1:p1'), agent: agentKind('claude'), stage: 'compacting', at: instant(NOW) });
    await w.service.consider(lane());
    assert.deepEqual(skipsOf(w), [['busy', 62, 'this lane']]);
    assert.equal(w.asked.length, 0);
});

test('a lane whose context share is not known yet keeps a no-context skip with no share', { timeout: 30_000 }, async () => {
    const w = world();
    w.known = false;
    await w.service.consider(lane());
    assert.deepEqual(skipsOf(w), [['no-context', null, 'the context share is not known yet']]);
    assert.equal(w.asked.length, 0);
});

test('with autocompact off no skip row is written and nothing is logged, whatever the share', { timeout: 30_000 }, async () => {
    const w = world({ mode: 'off' });
    w.share = 8;
    await w.service.consider(lane());
    w.known = false;
    await w.service.consider(lane());
    assert.deepEqual([w.store.decisions.skips().length, w.logs.length], [0, 0]);
});

test('a skip is logged only when its gate changed; a decision removes the lane\'s skip and the next skip is logged again', { timeout: 30_000 }, async () => {
    const w = world({ mode: 'shadow' });
    w.share = 8;
    await w.service.consider(lane());
    w.share = 9;
    await w.service.consider(lane());
    w.share = 62;
    await w.service.consider(lane());
    assert.equal(w.store.decisions.skips().length, 0, 'the decision removed the skip');
    w.share = 8;
    await w.service.consider(lane());
    assert.deepEqual(w.logs.filter((line) => line.includes('skip')), ['autocompact w1:p1: 8 % → skip below-minimum (below 10 %)', 'autocompact w1:p1: 8 % → skip below-minimum (below 10 %)']);
});

test('a lane keeps one skip row, the newest first across lanes; a decision of the lane removes its row and a forgotten tab takes the rest', { timeout: 30_000 }, () => {
    const w = world();
    const skip = (key: string, at: number, gate: 'cooldown' | 'busy' | 'no-context', detail: string, share: number | null): void => {
        w.store.decisions.skip({ scope: tabId('w1:t1'), key: paneId(key), agent: agentKind('claude'), at: instant(at), gate, share: share === null ? null : countOf(share), detail: textOf(detail) });
    };
    skip('w1:p1', 100, 'cooldown', '5 s left', 62);
    skip('w1:p1', 200, 'busy', 'another lane', 62);
    skip('w1:p2', 150, 'no-context', 'the context share is not known yet', null);
    assert.deepEqual(w.store.decisions.skips().map((each) => [each.key, each.at, each.gate, each.detail]), [['w1:p1', 200, 'busy', 'another lane'], ['w1:p2', 150, 'no-context', 'the context share is not known yet']]);
    w.store.decisions.record(draftOf({ at: instant(300), mode: 'shadow' }));
    assert.deepEqual(w.store.decisions.skips().map((each) => each.key), ['w1:p2']);
    w.store.db.exec("DELETE FROM tab WHERE id = 'w1:t1'");
    assert.deepEqual(w.store.decisions.skips(), []);
});

test('the skips of live lanes survive the prune: a lane that is working or gone loses its skip, and with autocompact off every skip goes', { timeout: 30_000 }, async () => {
    const w = world({ mode: 'shadow' });
    w.share = 8;
    await w.service.consider(laneAt('w1:p1', 'idle'));
    w.store.decisions.skip({ scope: tabId('w1:t1'), key: paneId('w1:p2'), agent: agentKind('claude'), at: instant(NOW), gate: 'busy', share: countOf(62), detail: textOf('another lane') });
    w.store.decisions.skip({ scope: tabId('w1:t1'), key: paneId('w1:p9'), agent: agentKind('claude'), at: instant(NOW), gate: 'cooldown', share: countOf(62), detail: textOf('5 s left') });
    w.service.prune([laneAt('w1:p1', 'idle'), laneAt('w1:p2', 'working')]);
    assert.deepEqual(w.store.decisions.skips().map((skip) => skip.key), ['w1:p1'], 'p2 is working and p9 is not in the board');
    w.policy = { ...w.policy, mode: 'off' };
    w.service.prune([laneAt('w1:p1', 'idle')]);
    assert.deepEqual(w.store.decisions.skips(), [], 'off: every skip goes');
});

test('an awaited reply holds the lane in flight with the detail awaiting reviewer: no decider, no request and no in-flight read', { timeout: 30_000 }, async () => {
    const w = world();
    w.awaiting = 'reviewer';
    await w.service.consider(lane());
    assert.deepEqual([w.asked, w.requests, w.reads], [[], [], []]);
    assert.deepEqual(skipsOf(w), [['in-flight', 62, 'awaiting reviewer']]);
});

test('below the ceiling an awaited reply holds the lane at 79 %, and a foreground call is not cut even at 92 %', { timeout: 30_000 }, async () => {
    const waiting = world();
    waiting.awaiting = 'reviewer,tester';
    waiting.share = 79;
    await waiting.service.consider(lane());
    assert.deepEqual([waiting.asked.length, waiting.requests.length, skipsOf(waiting)], [0, 0, [['in-flight', 79, 'awaiting reviewer,tester']]]);
    const foreground = world();
    foreground.awaiting = 'reviewer';
    foreground.inFlight = 2;
    foreground.share = 92;
    await foreground.service.consider(lane());
    assert.deepEqual([foreground.requests.length, rows(foreground).length, skipsOf(foreground)], [0, 0, [['in-flight', 92, '2 running']]]);
});

test('the wait answered, the lane goes through the remaining gates again and is requested once', { timeout: 30_000 }, async () => {
    const w = world();
    w.awaiting = 'reviewer';
    await w.service.consider(lane());
    w.awaiting = null;
    await w.service.consider(lane());
    assert.equal(w.requests.length, 1);
    assert.equal(rows(w).length, 1);
    assert.deepEqual(w.store.decisions.skips(), []);
});

test('an unreadable awaiting answer counts as in flight, even at 92 %: nothing is asked and the reason is the detail', { timeout: 30_000 }, async () => {
    const w = world();
    w.awaitingUnknown = true;
    await w.service.consider(lane());
    assert.deepEqual([w.asked, w.requests], [[], []]);
    const skip = w.store.decisions.skips().find((each) => each.key === 'w1:p1');
    assert.ok(skip !== undefined, 'the lane was skipped');
    assert.equal(skip.gate, 'in-flight');
    assert.match(skip.detail ?? '', /unreadable|unreachable|not/u);
    const full = world();
    full.share = 92;
    full.awaitingUnknown = true;
    await full.service.consider(lane());
    assert.deepEqual([full.asked.length, full.requests.length, full.store.decisions.skips().map((each) => each.gate)], [0, 0, ['in-flight']]);
    assert.notEqual(full.store.decisions.skips()[0]?.detail, null);
});

test('a skip event is written when its gate changes, not on each sweep, and a decision follows with its verdict and share', { timeout: 30_000 }, async () => {
    const w = world();
    w.awaiting = 'reviewer';
    await w.service.consider(lane());
    await w.service.consider(lane());
    assert.deepEqual(w.events, ['w1:p1 autocompact-skipped in-flight']);
    w.awaiting = null;
    await w.service.consider(lane());
    assert.deepEqual(w.events, ['w1:p1 autocompact-skipped in-flight', 'w1:p1 autocompact-decided compact-62']);
});

test('the late check reads the awaited reply after the gate: below the ceiling at 70 % it skips the lane after the decider ran, at 92 % it does not skip a full lane', { timeout: 30_000 }, async () => {
    const below = world();
    below.share = 70;
    below.lateAwaiting = 'reviewer';
    await below.service.consider(lane());
    assert.deepEqual([below.asked.length, below.requests.length, rows(below).length, skipsOf(below)], [1, 0, 0, [['in-flight', 70, 'awaiting reviewer']]]);
    const full = world();
    full.share = 92;
    full.lateAwaiting = 'reviewer';
    await full.service.consider(lane());
    assert.deepEqual([full.store.decisions.skips().length, rows(full)[0]?.gate, rows(full)[0]?.why, full.requests.map((request) => request.note)], [0, 'ceiling', 'ceiling-overrides-wait (awaiting reviewer)', ['Still waiting for: reviewer.']]);
});

test('the in-flight reasons use the declared wording for a screen, no reader and a windowed reader', { timeout: 30_000 }, () => {
    assert.deepEqual(
        [inFlightReason('screen', must(parseText('gemini'))), inFlightReason('unregistered-reader', must(parseText('gemini'))), inFlightReason('windowed-reader', must(parseText('codex')))],
        ['screen transcripts do not contain in-flight work', 'no transcript reader for gemini', 'windowed replay does not expose in-flight work'],
    );
});

test('a transcript not yet written is not-started when the locating key is known, and unknown when the lane lacks it or the transcript cannot be read', { timeout: 30_000 }, async () => {
    const claude = fakeReader('claude', unknown({ why: 'not-found', what: textOf('the transcript of sess-1') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.deepEqual(await adapterFor(claude).read(claudeLane), { kind: 'not-started', why: 'the transcript of sess-1 not found' });
    const keyless = fakeReader('claude', unknown({ why: 'not-found', what: textOf('a session id for w1:p3') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.deepEqual(await adapterFor(keyless).read(sessionless), { kind: 'unknown', why: 'a session id for w1:p3 not found' });
    const cwdOnly = laneFrom(seenLane({ paneId: 'w1:p6', tabId: 'w1:t1', workspaceId: 'w1', agent: 'claude', cwd: '/repo' }));
    assert.equal((await adapterFor(keyless).read(cwdOnly)).kind, 'unknown', 'a claude lane locates by its session, not its working directory');
    const codex = fakeReader('codex', unknown({ why: 'not-found', what: textOf('a codex rollout started in /repo') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.deepEqual(await adapterFor(codex).read(codexLane), { kind: 'not-started', why: 'a codex rollout started in /repo not found' });
    const unreadableFile = fakeReader('claude', unknown({ why: 'unreadable', detail: causeOf('/projects') }), { kind: 'in-flight', count: runningOf(9), background: [] });
    assert.deepEqual(await adapterFor(unreadableFile).read(claudeLane), { kind: 'unknown', why: 'unreadable: /projects' });
});

test('a located transcript reports its count of unfinished work, a failing read is unknown, and an agent with no reader is unknown', { timeout: 30_000 }, async () => {
    const located: Located = { kind: 'located', source: sourcePathOf('/t/sess-1.jsonl') };
    assert.deepEqual(await adapterFor(fakeReader('claude', located, { kind: 'in-flight', count: runningOf(2), background: [] })).read(claudeLane), { kind: 'count', count: countOf(2), background: [] });
    assert.deepEqual(await adapterFor(fakeReader('claude', located, unknown({ why: 'unreadable', detail: causeOf('tail') }))).read(claudeLane), { kind: 'unknown', why: 'unreadable: tail' });
    const gemini = laneFrom(seenLane({ paneId: 'w1:p5', tabId: 'w1:t1', workspaceId: 'w1', agent: 'gemini', session: 's', cwd: '/repo' }));
    assert.equal((await new TranscriptInFlight(registryWith({})).read(gemini)).kind, 'unknown');
});

test('autocompact folds a not-started reading into unknown with the same words and states a count as running', { timeout: 30_000 }, async () => {
    const notStarted: InFlightReader = { read: (): Promise<InFlightRead> => Promise.resolve({ kind: 'not-started', why: textOf('the transcript of sess-1 not found') }) };
    assert.deepEqual(await flightOf(notStarted, claudeLane), unreadable(flightReason(textOf('the transcript of sess-1 not found'))));
    const counted: InFlightReader = { read: (): Promise<InFlightRead> => Promise.resolve({ kind: 'count', count: countOf(3), background: [] }) };
    assert.deepEqual(await flightOf(counted, claudeLane), observedFrom(runningCount(countOf(3)), [], flightReason(textOf('3 running'))));
});
