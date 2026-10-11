import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { answerRestart } from '#src/recap/application/ask-restart.ts';
import { handoffStageOf, HandoffMirror } from '#src/recap/application/handoff-mirror.ts';
import type { Route } from '#src/recap/application/handoff-mirror.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import { handoff, HANDOFF_EVENTS, HANDOFF_STAGES } from '#src/protocol/exchanges/handoff.ts';
import { terminalsOf, terminalStage } from '#src/protocol/exchange.ts';
import { must } from '#src/protocol/result.ts';
import { toolName } from '#src/protocol/primitives.ts';
import type { EventKind } from '#src/recap/domain/event-token.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { HANDOFF_OUTCOME_ROWS, handoffOutcomeOf } from '#src/recap/domain/handoff-outcome.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import type { Done } from '#src/ports/columns.ts';
import type { LaneTokens } from '#src/ports/lane-tokens.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';

const HID = handoffIdOf(new Uint8Array(16).fill(7));

const settled = (): Promise<void> => new Promise((resolve) => { setImmediate(resolve); });

class DeferredTokens implements LaneTokens {
    readonly issued: Array<Readonly<Record<string, string | null>>> = [];
    readonly landed: Array<Readonly<Record<string, string | null>>> = [];
    private readonly releases: Array<() => void> = [];

    report(_pane: string, tokens: Readonly<Record<string, string | null>>): Promise<Done> {
        this.issued.push(tokens);
        return new Promise((resolve) => {
            this.releases.push(() => {
                this.landed.push(tokens);
                resolve({ kind: 'done' });
            });
        });
    }

    async landNext(): Promise<void> {
        this.releases.shift()?.();
        await settled();
    }
}
const route: Route = { source: paneId('w1:p1'), target: paneId('w1:p2'), id: must(parseText('h1')) };

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

function setup(sharing = true): { readonly mirror: HandoffMirror; readonly tokens: RecordingTokens; readonly events: RecordingEvents; readonly asks: MemoryAskLedger } {
    const tokens = new RecordingTokens();
    const events = new RecordingEvents();
    const asks = new MemoryAskLedger();
    return { mirror: new HandoffMirror({ asks, tokens, events, sharing: (): HerdrEvents => (sharing ? 'on' : 'off'), log: (): void => undefined }), tokens, events, asks };
}

test('every storable outcome maps to the stage the descriptor names, and that stage fits 80 characters with a 16-character id', () => {
    for (const row of HANDOFF_OUTCOME_ROWS.filter((each) => each.storable)) {
        const outcome = handoffOutcomeOf(row.outcome, row.reason);
        assert.ok(outcome !== null);
        const stage = handoffStageOf(outcome);
        const expected = row.reason === null ? 'delivered' : `${row.outcome}-${row.reason}`;
        assert.equal(stage, expected);
        assert.ok(stage === 'delivered' || terminalsOf(handoff).some((terminal) => terminalStage(terminal) === stage), `${stage} is a declared stage`);
        assert.ok(`${'x'.repeat(16)}:${stage}`.length <= 80);
    }
    assert.equal(handoffStageOf({ kind: 'printed' }), 'failed-internal-error', 'a non-storable outcome is an internal failure, never a silent stage');
});

test('running, then delivered: the source pane carries the answer, and both panes get the event with the request id', async () => {
    const run = setup();
    run.mirror.running(route);
    run.mirror.terminal(route, { kind: 'delivered' });
    await settled();
    assert.deepEqual(run.tokens.reports.map((report) => [report.pane, report.tokens]), [['w1:p1', { 'tab-recap-handoff': 'h1:running' }], ['w1:p1', { 'tab-recap-handoff': 'h1:delivered' }]]);
    assert.deepEqual(run.events.seen, [
        { kind: HANDOFF_EVENTS.running, pane: 'w1:p1', detail: 'h1' },
        { kind: HANDOFF_EVENTS.running, pane: 'w1:p2', detail: 'h1' },
        { kind: HANDOFF_EVENTS.delivered, pane: 'w1:p1', detail: 'h1' },
        { kind: HANDOFF_EVENTS.delivered, pane: 'w1:p2', detail: 'h1' },
    ]);
});

test('a refused handoff is a failed event whose detail carries the stage, on both panes', () => {
    const run = setup();
    run.mirror.terminal(route, { kind: 'refused', reason: 'not-a-lane' });
    assert.deepEqual(run.tokens.reports.map((report) => report.tokens), [{ 'tab-recap-handoff': 'h1:refused-not-a-lane' }]);
    assert.deepEqual(run.events.seen.map((event) => [event.kind, event.pane, event.detail]), [
        [HANDOFF_EVENTS.failed, 'w1:p1', 'h1:refused-not-a-lane'],
        [HANDOFF_EVENTS.failed, 'w1:p2', 'h1:refused-not-a-lane'],
    ]);
});

test('a too-late row is answered failed-expired on the source pane', () => {
    const run = setup();
    run.mirror.terminal(route, { kind: 'failed', reason: 'expired' });
    assert.deepEqual(run.tokens.reports.map((report) => [report.pane, report.tokens]), [['w1:p1', { 'tab-recap-handoff': 'h1:failed-expired' }]]);
});

test('with sharing off the mirror writes no token and no event', () => {
    const run = setup(false);
    run.mirror.queued(route);
    run.mirror.running(route);
    run.mirror.terminal(route, { kind: 'delivered' });
    assert.deepEqual([run.tokens.reports, run.events.seen], [[], []]);
});

test('the mirror finds the exchange ask by its handoff id, and returns the route the requester asked for', () => {
    const run = setup();
    run.asks.record({ exchange: HANDOFF_EXCHANGE, requester: must(toolName('coordinator')), id: rid('h1'), pane: paneId('w1:p1'), at: 1, ref: HID });
    const row: HandoffRequestRow = { id: HID, at: 1000, tab: tabId('w1:t1'), pane: paneId('w1:p1'), toPane: paneId('w1:p2'), refreshFirst: false, note: null, source: { kind: 'live' }, answer: must(parseText('h1')) };
    assert.deepEqual(run.mirror.routeOf(row), route);
    assert.equal(run.mirror.routeOf({ ...row, id: handoffIdOf(new Uint8Array(16).fill(8)) }), null);
});

test('restart: an unsettled exchange ask is answered failed-interrupted on the source pane only, and its queued row is withdrawn', () => {
    const tokens = new RecordingTokens();
    const asks = new MemoryAskLedger();
    const withdrawn: string[] = [];
    asks.record({ exchange: HANDOFF_EXCHANGE, requester: must(toolName('coordinator')), id: rid('h1'), pane: paneId('w1:p1'), at: 1, ref: HID });
    answerRestart({
        exchanges: REGISTRY.exchanges, ledger: asks, requests: { takeAnswered: () => [] }, compactions: { interrupted: (): number => 0 }, tokens, enabled: (): boolean => true,
        local: (): void => undefined, handoff: (): void => undefined, withdraw: (ask): void => { withdrawn.push(ask.ref ?? ''); }, log: (): void => undefined, now: (): number => 1000, restartedWhy: 'restarted',
    });
    assert.deepEqual(tokens.reports.map((report) => [report.pane, report.tokens]), [['w1:p1', { 'tab-recap-handoff': 'h1:failed-interrupted' }]]);
    assert.deepEqual(withdrawn, [HID]);
    assert.deepEqual(asks.unfinished(), []);
});

test('the stages of one source pane land one after another, so the terminal stage is the last token even when earlier reports are slow', async () => {
    const tokens = new DeferredTokens();
    const mirror = new HandoffMirror({ asks: new MemoryAskLedger(), tokens, events: new RecordingEvents(), sharing: (): HerdrEvents => 'on', log: (): void => undefined });
    mirror.queued(route);
    mirror.running(route);
    mirror.terminal(route, { kind: 'delivered' });
    assert.deepEqual(tokens.issued, [{ 'tab-recap-handoff': `h1:${HANDOFF_STAGES.queued}` }]);
    await tokens.landNext();
    assert.deepEqual(tokens.issued.at(-1), { 'tab-recap-handoff': 'h1:running' });
    await tokens.landNext();
    assert.deepEqual(tokens.issued.at(-1), { 'tab-recap-handoff': 'h1:delivered' });
    await tokens.landNext();
    assert.deepEqual(tokens.landed.at(-1), { 'tab-recap-handoff': 'h1:delivered' });
    assert.equal(tokens.issued.length, 3);
});

test('a stage reported while nothing is pending is issued at once', () => {
    const run = setup();
    run.mirror.queued(route);
    assert.equal(run.tokens.reports.length, 1);
});
