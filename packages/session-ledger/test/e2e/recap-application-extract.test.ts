import { textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extract, OLD_CONTRACT, type Ground } from '@stateforge-labs/session-ledger/unstable/recap/application/extract-job.ts';
import { brand } from '@stateforge-labs/session-ledger/unstable/recap/domain/brand.ts';
import { instant } from '@stateforge-labs/session-ledger/unstable/recap/domain/time.ts';
import type { RecapRequest, Writer, Written } from '@stateforge-labs/session-ledger/unstable/ports/summarizer.ts';

const text = brand<string, 'Text'>;

const ground: Ground = {
    gates: [], now: instant(10 * 3_600_000), facts: new Map(),
    resolving: { tasks: [text('t1')], agents: [], taskOf: new Map(), turns: [], clock: { now: instant(10 * 3_600_000), zone: text('UTC') } },
    grounds: [{ key: text('t1'), tab: text('w1:t1'), shown: new Map(), open: [], closedLately: [], source: text('go'), language: text('en'), agents: [] }],
};

const request: RecapRequest = { input: { tab: { id: textOf('w1:t1'), now: instant(10 * 3_600_000), zone: textOf('UTC') }, agents: [], tasks: [], ledgers: [], notes: [], transcripts: [] }, language: textOf('en'), previousLanguage: textOf('en') };

const writing = (answers: readonly string[], contract: Writer['contract'] = 'strict'): { summarizer: Writer; calls: RecapRequest[] } => {
    const calls: RecapRequest[] = [];
    const write = (asked: RecapRequest): Promise<Written> => {
        calls.push(asked);
        return Promise.resolve({ kind: 'written', text: textOf(answers[Math.min(calls.length - 1, answers.length - 1)] ?? ''), costUsd: brand<number, 'Usd'>(0.5) });
    };
    return { summarizer: { backend: textOf('fake'), contract, write }, calls };
};

test('an operations answer is kept for its task and costs one call', async () => {
    const { summarizer, calls } = writing([JSON.stringify({ ops: [{ op: 'add', section: 'done', text: 'Wrote the gates', anchor: 'go' }] })]);
    const done = await extract(summarizer, request, ground);
    assert.equal(calls.length, 1);
    assert.ok(done.kind === 'ops');
    assert.deepEqual([done.cost, done.tasks.map((each) => [each.task, each.ops.length])], [0.5, [['t1', 1]]]);
});

test('an answer that is not operations is asked again once, then fails with the reason and the cost of both calls', async () => {
    const { summarizer, calls } = writing(['not json']);
    const done = await extract(summarizer, request, ground);
    assert.equal(calls.length, 2);
    assert.ok(done.kind === 'failed');
    assert.equal(done.cost, 1);
    assert.match(done.error, /the writer's answer was not usable/);
});

test('a free-text writer that answers the old recap shape fails with the old contract message', async () => {
    const { summarizer } = writing([JSON.stringify({ goal: 'x', now: [] })], 'free-text');
    const done = await extract(summarizer, request, ground);
    assert.ok(done.kind === 'failed');
    assert.equal(done.error, OLD_CONTRACT);
    assert.equal(OLD_CONTRACT, text('custom writer must answer operations (see README)'));
});
