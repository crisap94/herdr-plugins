import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import type { NewHandoffRequest } from '#src/ports/requests.ts';
import { emptyBoard } from '#src/recap/domain/board.ts';
import type { Board } from '#src/recap/domain/board.ts';
import type { EventKind } from '#src/recap/domain/event-token.ts';
import { laneFrom } from '#src/recap/domain/lane.ts';
import { paneId } from '#src/recap/domain/ids.ts';
import type { Ask } from '#src/ports/ask-ledger.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { HandoffExchangeResponder, withdrawAsked, type TokenEntries } from '#src/recap/application/handoff-exchange.ts';
import type { HandoffOffer } from '#src/recap/domain/handoff-ask.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { HandoffMirror } from '#src/recap/application/handoff-mirror.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';

const HID = handoffIdOf(new Uint8Array(16).fill(7));

const lanes = ['w1:p1', 'w1:p2', 'w2:p7'].map((pane) => laneFrom({ paneId: pane, tabId: pane.replace(':p', ':t'), workspaceId: pane.split(':')[0] ?? '', agent: 'claude', status: 'idle' }));
const board = (): Board => ({ ...emptyBoard(), seeded: true, lanes: new Map(lanes.map((lane) => [lane.pane, lane])) });

interface Event { readonly kind: EventKind; readonly pane: string; readonly detail: string | null }

class RecordingEvents implements LaneEvents {
    readonly seen: Event[] = [];

    lane(pane: string, kind: EventKind, detail?: string | null): void {
        this.seen.push({ kind, pane, detail: detail ?? null });
    }

    inWorkspace(): void {
        return undefined;
    }
}

interface Harness {
    readonly responder: HandoffExchangeResponder;
    readonly queued: NewHandoffRequest[];
    readonly tokens: RecordingTokens;
    readonly events: RecordingEvents;
    readonly asks: MemoryAskLedger;
    readonly offer: { value: HandoffOffer };
}

function setup(offer: HandoffOffer = 'offered', asks = new MemoryAskLedger()): Harness {
    const current = { value: offer };
    const queued: NewHandoffRequest[] = [];
    const tokens = new RecordingTokens();
    const events = new RecordingEvents();
    const mirror = new HandoffMirror({ asks, tokens, events, sharing: (): HerdrEvents => (current.value !== 'sharing-off' ? 'on' : 'off'), log: (): void => undefined });
    const requests = { requestHandoff: (request: NewHandoffRequest) => { queued.push(request); return HID; } };
    const responder = new HandoffExchangeResponder({ offer: (): HandoffOffer => current.value, board, requests, asks, mirror, tokens, now: (): Instant => instant(1000), log: (): void => undefined });
    return { responder, queued, tokens, events, asks, offer: current };
}

const request = (raw: string): TokenEntries => new Map([[must(parseText('handoff-req-coordinator')), must(parseText(raw))]]);
const answered = (run: Harness): unknown[] => run.tokens.reports.map((report) => [report.pane, report.tokens]);

test('not offered: the request is answered refused-not-offered and queues nothing', () => {
    const run = setup('not-offered');
    run.responder.onPaneTokens(paneId('w1:p1'), request('h1:w1:p2'));
    assert.deepEqual(run.queued, []);
    assert.deepEqual(answered(run), [['w1:p1', { 'tab-recap-handoff': 'h1:refused-not-offered' }]]);
});

test('sharing off: nothing is written, and a request remembered then is not acted on once offered', () => {
    const run = setup('sharing-off');
    run.responder.onPaneTokens(paneId('w1:p1'), request('h1:w1:p2'));
    run.offer.value = 'offered';
    run.responder.onPaneTokens(paneId('w1:p1'), request('h1:w1:p2'));
    assert.deepEqual([run.queued, run.tokens.reports], [[], []]);
});

test('a malformed value with a readable id is refused-bad-request once; an unreadable id is ignored', () => {
    const run = setup();
    run.responder.onPaneTokens(paneId('w1:p1'), request('h3:not a pane'));
    run.responder.onPaneTokens(paneId('w1:p1'), request('h3:not a pane'));
    run.responder.onPaneTokens(paneId('w1:p1'), request(`${'x'.repeat(17)}:w1:p2`));
    assert.deepEqual(answered(run), [['w1:p1', { 'tab-recap-handoff': 'h3:refused-bad-request' }]]);
    assert.deepEqual(run.queued, []);
});

test('a pane that is not a lane is refused-not-a-lane, and nothing is queued', () => {
    const run = setup();
    run.responder.onPaneTokens(paneId('w9:p9'), request('h1:w1:p2'));
    assert.deepEqual([run.queued, answered(run)], [[], [['w9:p9', { 'tab-recap-handoff': 'h1:refused-not-a-lane' }]]]);
});

test('a target outside the source workspace, or not a lane, is refused-target-elsewhere', () => {
    const run = setup();
    run.responder.onPaneTokens(paneId('w1:p1'), request('h1:w2:p7'));
    run.responder.onPaneTokens(paneId('w1:p1'), request('h4:w1:p9'));
    assert.deepEqual([run.queued, answered(run)], [[], [
        ['w1:p1', { 'tab-recap-handoff': 'h1:refused-target-elsewhere' }],
        ['w1:p1', { 'tab-recap-handoff': 'h4:refused-target-elsewhere' }],
    ]]);
});

test('asked and queued: one handoff row from the source to the target, answered queued, with the ask holding the handoff id', () => {
    const run = setup();
    run.responder.onPaneTokens(paneId('w1:p1'), request('h1:w1:p2'));
    assert.deepEqual(run.queued, [{ tab: 'w1:t1', pane: 'w1:p1', toPane: 'w1:p2', note: null, refreshFirst: false, source: { kind: 'live' }, answer: 'h1' }]);
    assert.deepEqual(answered(run), [['w1:p1', { 'tab-recap-handoff': 'h1:queued' }]]);
    assert.deepEqual(run.events.seen, [
        { kind: 'handoff-queued', pane: 'w1:p1', detail: 'h1' },
        { kind: 'handoff-queued', pane: 'w1:p2', detail: 'h1' },
    ]);
    assert.deepEqual(run.asks.unfinished().map((ask) => [ask.requester, ask.id, ask.pane, ask.ref]), [['coordinator', 'h1', 'w1:p1', HID]]);
});

test('a refresh is asked by the flag', () => {
    const run = setup();
    run.responder.onPaneTokens(paneId('w1:p1'), request('h2:w1:p2:refresh'));
    assert.deepEqual(run.queued.map((row) => row.refreshFirst), [true]);
});

test('the same id is queued once, also after a restart over the same asks; a rewrite is announced by no event', () => {
    const before = setup();
    before.responder.onPaneTokens(paneId('w1:p1'), request('h1:w1:p2'));
    const events = before.events.seen.length;
    before.responder.onPaneTokens(paneId('w1:p1'), request('h1:w1:p2'));
    assert.equal(before.events.seen.length, events, 'a repeat is announced by no event');
    const after = setup('offered', before.asks);
    after.responder.onPaneTokens(paneId('w1:p1'), request('h1:w1:p2'));
    assert.deepEqual([before.queued.length, after.queued.length], [1, 0]);
});

test('restart withdraws the queued row of an exchange ask, and only one that carries a handoff id', () => {
    const withdrawn: HandoffId[] = [];
    const requests = { withdrawHandoff: (id: HandoffId): boolean => { withdrawn.push(id); return true; } };
    const ask = (ref: string | null): Ask => ({ exchange: HANDOFF_EXCHANGE, requester: must(toolName('coordinator')), id: rid('h1'), pane: paneId('w1:p1'), at: 1, ref, outcome: null });
    withdrawAsked(requests, ask(HID));
    withdrawAsked(requests, ask(null));
    assert.deepEqual(withdrawn, [HID]);
});
