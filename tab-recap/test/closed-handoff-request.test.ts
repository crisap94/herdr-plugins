import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryRequests } from './fakes/requests.ts';
import { MemoryHandoffAnswers } from './fakes/handoff-answers.ts';
import { deliverHandoff, type DaemonReading, type DeliverDeps } from '#src/recap/application/handoff-request.ts';
import type { HandoffAskRecord } from '#src/ports/requests.ts';
import { paneId, tabId } from '#test/support/ids.ts';
import { instant } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { parsePid } from '#src/recap/domain/pid.ts';
import { textOf } from '@stateforge-labs/session-ledger';
import { NOW } from './fakes/handoff-flow-harness.ts';

const RUNNING: DaemonReading = { pid: must(parsePid(4242)), version: textOf('2.4.0') };
const PANE = paneId('w1:p1');
const CLOSED_AT = instant(NOW - 60_000);

test('a closed source whose pane id is the target pane is queued as a closed request, not refused source-equals-target', async () => {
    const requests = new MemoryRequests(() => NOW);
    const answers = new MemoryHandoffAnswers(() => NOW);
    const taken: HandoffAskRecord[] = [];
    let now = NOW;
    const deps: DeliverDeps = {
        pacing: {
            now: () => instant(now),
            sleep: async (ms) => {
                now += ms;
                taken.push(...requests.takeHandoffs());
            },
        },
        daemon: () => RUNNING,
        cliVersion: textOf('2.4.0'),
        openStore: () => ({ views: { tabOf: () => null }, requests, handoffs: answers, close: () => undefined }),
    };
    const outcome = await deliverHandoff({ from: PANE, to: PANE, note: null, refresh: 'as-is', closed: { tab: tabId('w1:t1'), pane: PANE, closedAt: CLOSED_AT } }, deps);
    assert.notEqual(outcome.kind, 'refused');
    assert.equal(taken.length, 1);
    assert.deepEqual(taken.map((row) => [row.source, row.tab]), [[{ kind: 'closed', closedAt: CLOSED_AT }, 'w1:t1']]);
});
