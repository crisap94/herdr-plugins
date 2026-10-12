import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handoffRestartOf, pollHandoffs, pruneHandoffAnswers } from '#src/daemon/handoff.ts';
import { LOCAL_REQUESTER } from '#src/ports/ask-ledger.ts';
import type { Ask } from '#src/ports/ask-ledger.ts';
import type { HandoffRequestRow } from '#src/ports/requests.ts';
import { requestId } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import { HANDOFF_ANSWER_TTL_MS } from '#src/recap/application/handoff-limits.ts';
import { HANDOFF_EXCHANGE } from '#src/recap/domain/handoff.ts';
import { paneId } from '#src/recap/domain/ids.ts';

const NOW = 1_000_000_000;

test('the poll hands the taken rows to the runner, and a rejected take is logged once with its name', async () => {
    const rows: readonly HandoffRequestRow[] = [];
    const seen: (readonly HandoffRequestRow[])[] = [];
    const logs: string[] = [];
    pollHandoffs({
        runner: { take: (taken: readonly HandoffRequestRow[]): Promise<void> => { seen.push(taken); return Promise.reject(new Error('store locked')); } },
        requests: { takeHandoffs: (): readonly HandoffRequestRow[] => rows },
        log: (line: string): void => { logs.push(line); },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(seen.length, 1);
    assert.strictEqual(seen[0], rows);
    assert.deepEqual(logs, ['handoff poll: Error']);
});

test('the answer prune cuts at the answer time-to-live before now', () => {
    const cuts: number[] = [];
    pruneHandoffAnswers({ answers: { prune: (before: number): void => { cuts.push(before); } }, now: (): number => NOW });
    assert.deepEqual(cuts, [NOW - HANDOFF_ANSWER_TTL_MS]);
});

test('the restart hook hands each unfinished handoff ask to the runner, as interrupted', () => {
    const seen: Ask[] = [];
    const ask: Ask = { exchange: HANDOFF_EXCHANGE, requester: LOCAL_REQUESTER, id: must(requestId('0123456789abcdef', 'legacy-length')), pane: paneId('w1:p1'), at: 1, ref: null, outcome: null };
    handoffRestartOf({ interrupted: (taken: Ask): void => { seen.push(taken); } })(ask);
    assert.deepEqual(seen, [ask]);
});
