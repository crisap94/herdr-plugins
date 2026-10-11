import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffIdOf } from '#src/adapters/db/handoff-ids.ts';
import { HandoffRunner } from '#src/daemon/handoff.ts';
import type { HandoffAnswerRow, HandoffAnswers } from '#src/ports/handoff-answers.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import { unrendered } from '#src/recap/application/handoff-flow.ts';
import { HandoffMirror } from '#src/recap/application/handoff-mirror.ts';
import type { LaneEvents } from '#src/recap/application/lane-events.ts';
import type { StoredHandoffOutcome } from '#src/recap/domain/handoff-outcome.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import type { HandoffId } from '#src/recap/domain/ids.ts';
import { paneId, tabId } from '#src/recap/domain/ids.ts';
import { toolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { HerdrEvents } from '#src/recap/domain/herdr-events.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { RecordingTokens } from './fakes/lane-tokens.ts';
import { MemoryAskLedger, rid } from './fakes/ask-ledger.ts';

const HID: HandoffId = handoffIdOf(new Uint8Array(16).fill(7));

const events: LaneEvents = { lane: (): void => undefined, inWorkspace: (): void => undefined };

class MemoryAnswers implements HandoffAnswers {
    readonly rows = new Map<HandoffId, StoredHandoffOutcome>();

    answerHandoff(id: HandoffId, outcome: StoredHandoffOutcome): void {
        this.rows.set(id, outcome);
    }

    handoffAnswer(): HandoffAnswerRow | null {
        return null;
    }

    prune(): void {
        return undefined;
    }
}

function setup(now: number): { readonly runner: HandoffRunner; readonly tokens: RecordingTokens; readonly answers: MemoryAnswers; readonly ran: number[]; readonly asks: MemoryAskLedger } {
    const asks = new MemoryAskLedger();
    asks.record({ exchange: HANDOFF_EXCHANGE, requester: must(toolName('coordinator')), id: rid('h1'), pane: paneId('w1:p1'), at: 1, ref: HID });
    const tokens = new RecordingTokens();
    const answers = new MemoryAnswers();
    const ran: number[] = [];
    const mirror = new HandoffMirror({ asks, tokens, events, sharing: (): HerdrEvents => 'on', log: (): void => undefined });
    const flow = { execute: async (): Promise<ReturnType<typeof unrendered>> => { ran.push(1); return unrendered({ kind: 'delivered' }); } };
    const runner = new HandoffRunner({ flow, asks, answers, claims: { release: (): void => undefined }, mirror, transaction: <T>(work: () => T): T => work(), now: (): number => now, log: (): void => undefined });
    return { runner, tokens, answers, ran, asks };
}

const row = (at: number): HandoffRequestRow => ({ id: HID, at, tab: tabId('w1:t1'), pane: paneId('w1:p1'), toPane: paneId('w1:p2'), refreshFirst: false, note: null, source: { kind: 'live' }, answer: must(parseText('h1')) });

test('an exchange row runs: running, then delivered on the source pane; its answer row is written and its ask settled', async () => {
    const run = setup(1000);
    await run.runner.take([row(1000)]);
    await new Promise((resolve) => { setImmediate(resolve); });
    assert.deepEqual(run.tokens.reports.map((report) => report.tokens), [{ 'tab-recap-handoff': 'h1:running' }, { 'tab-recap-handoff': 'h1:delivered' }]);
    assert.deepEqual(run.answers.rows.get(HID), { kind: 'delivered' });
    assert.deepEqual(run.asks.unfinished(), []);
});

test('an exchange row taken too late is answered failed-expired on the source pane, and nothing runs', async () => {
    const run = setup(100_000);
    await run.runner.take([row(0)]);
    assert.deepEqual(run.ran, []);
    assert.deepEqual(run.tokens.reports.map((report) => [report.pane, report.tokens]), [['w1:p1', { 'tab-recap-handoff': 'h1:failed-expired' }]]);
    assert.deepEqual(run.answers.rows.get(HID), { kind: 'failed', reason: 'expired' });
    assert.deepEqual(run.asks.unfinished(), []);
});
