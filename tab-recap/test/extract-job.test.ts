// Asking for operations: shape, gates, one retry, drop what is still refused, the 1.x answer refused for a custom writer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, OLD_CONTRACT } from '#src/recap/application/extract-job.ts';
import type { Extracted, Ground } from '#src/recap/application/extract-job.ts';
import { numbered } from '#src/recap/application/ledger-input.ts';
import type { RecapRequest, Summarizer, Written } from '#src/ports/summarizer.ts';
import { LEDGER_GATES } from '#src/recap/domain/gates/ledger-gates.ts';
import { factOf } from './fakes/facts.ts';
import { requestOf } from './support.ts';

const NOW = 10 * 3_600_000;
const released = factOf('done', 'Released tab-recap 1.10.0 through the pipeline');
const review = factOf('next', 'Review the migration test');
const shut = factOf('done', 'Merged the lint fix', { state: 'closed', closedWhy: 'done', closedAt: NOW - 3_600_000 });
const numbering = numbered([{ key: 't1', open: [released, review], closed: [shut] }], [], false);
const ground: Ground = {
    gates: LEDGER_GATES, now: NOW,
    resolving: { tasks: ['t1'], agents: [], taskOf: numbering.taskOf, turns: [], clock: { now: NOW, zone: 'UTC' } },
    grounds: [{ key: 't1', tab: 'w1:t1', shown: numbering.shown.get('t1') ?? new Map(), closedLately: [shut], language: 'en', agents: [] }],
};
const add = (section: string, text: string): Record<string, unknown> => ({ op: 'add', section, text });
const ops = (...list: readonly Record<string, unknown>[]): string => JSON.stringify({ ops: list });

function writer(answers: readonly string[], backend = 'fake'): { summarizer: Summarizer; calls: RecapRequest[] } {
    const calls: RecapRequest[] = [];
    const summarizer: Summarizer = { backend, write: (request): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: answers[Math.min(calls.length - 1, answers.length - 1)] ?? '', costUsd: 0.5 }); } };
    return { summarizer, calls };
}

const run = (answers: readonly string[], backend = 'fake'): Promise<{ done: Extracted; calls: RecapRequest[] }> => {
    const { summarizer, calls } = writer(answers, backend);
    return extract(summarizer, requestOf(), ground).then((done) => ({ done, calls }));
};

const kept = (done: Extracted): unknown => (done.kind === 'ops' ? done.tasks.map((each) => each.ops.map((op) => (op.op === 'add' ? op.text : `${op.op} ${op.id}`))) : done);

test('an empty list changes nothing and costs one call', async () => {
    const { done, calls } = await run([ops()]);
    assert.deepEqual([calls.length, done.kind, done.kind === 'ops' ? done.tasks : null, done.cost], [1, 'ops', [], 0.5]);
});

test('the answer\'s document ids are mapped to the facts; adds, updates and closes come through for the task', async () => {
    const { done } = await run([ops(add('done', 'Wrote the ledger gates'), { op: 'update', id: 'f2', text: 'Review the migration test twice' }, { op: 'close', id: 'f1', why: 'done' })]);
    assert.ok(done.kind === 'ops');
    assert.deepEqual(done.tasks[0]?.ops.map((op) => (op.op === 'add' ? 'add' : [op.op, op.id === released.id || op.id === review.id])), ['add', ['update', true], ['close', true]]);
});

test('a duplicate of the ledger is sent back ONCE naming the fact to update; the fixed answer is used; both calls cost', async () => {
    const { done, calls } = await run([ops(add('done', 'Released tab-recap 1.10.0 through the pipeline today')), ops({ op: 'update', id: 'f1', text: 'Released tab-recap 1.10.0 through the pipeline today' })]);
    assert.equal(calls.length, 2);
    assert.match(calls[1]?.correction ?? '', /G2: add done "Released tab-recap[^"]*" — it repeats f1 .*update f1 instead/);
    assert.deepEqual(kept(done), [[`update ${released.id}`]]);
    assert.ok(done.kind === 'ops' && done.cost === 1 && done.stats.refused['G2'] === 1 && done.stats.dropped === 0);
});

test('refused twice: the operation is dropped, the rest is applied, and the stats say so', async () => {
    const bad = ops(add('done', 'Released tab-recap 1.10.0 through the pipeline now'), add('next', 'Tag the release'), { op: 'close', id: 'f99', why: 'done' });
    const { done, calls } = await run([bad, bad]);
    assert.equal(calls.length, 2, 'one retry, not more');
    assert.deepEqual(kept(done), [['Tag the release']]);
    assert.ok(done.kind === 'ops');
    assert.deepEqual([done.stats.refused['G2'], done.stats.refused['G6'], done.stats.dropped], [2, 2, 2]);
});

test('a close without a why (G10) and a malformed operation are named in the correction', async () => {
    const { calls } = await run([ops({ op: 'close', id: 'f2' }, { op: 'add', section: 'mood', text: 'x' }), ops()]);
    assert.match(calls[1]?.correction ?? '', /G10: close f2 — closing f2 needs a why/);
    assert.match(calls[1]?.correction ?? '', /shape: an add needs a section/);
});

test('what only the fold refuses (a second goal, an update of a closed fact) is sent back too, as the ledger\'s refusal', async () => {
    const { done, calls } = await run([ops({ op: 'update', id: 'f3', text: 'Merged the lint fix again' }, add('goal', 'one'), add('goal', 'two')), ops(add('goal', 'one'))]);
    assert.match(calls[1]?.correction ?? '', /L: update f3 "Merged the lint fix again" — refused by the ledger: closed/);
    assert.match(calls[1]?.correction ?? '', /L: add goal "two" — refused by the ledger: second-goal/);
    assert.deepEqual(kept(done), [['one']]);
});

test('an unusable answer is retried once with what was wrong; twice means the run fails and the ledger is untouched', async () => {
    const { done, calls } = await run(['sorry, no', '{"foo": 1}']);
    assert.equal(calls.length, 2);
    assert.match(calls[1]?.correction ?? '', /no JSON object/);
    assert.ok(done.kind === 'failed' && /not usable.*ledger is unchanged/.test(done.error) && done.cost === 1);
});

test('the 1.x recap shape: a built-in writer is told to answer operations; a custom writer fails at once with the contract line', async () => {
    const old = JSON.stringify({ goal: 'x', now: ['y'] });
    const builtin = await run([old, ops(add('next', 'Tag it'))]);
    assert.match(builtin.calls[1]?.correction ?? '', /answer operations on the ledger only/);
    assert.deepEqual(kept(builtin.done), [['Tag it']]);
    const custom = await run([old], 'custom/mine');
    assert.equal(custom.calls.length, 1, 'no retry');
    assert.deepEqual(custom.done, { kind: 'failed', error: OLD_CONTRACT, cost: 0.5 });
    assert.equal(OLD_CONTRACT, 'custom writer must answer operations (see README)');
});

test('a harness that fails outright is not retried', async () => {
    const calls: RecapRequest[] = [];
    const failing: Summarizer = { backend: 'fake', write: (request): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'unknown', why: { why: 'timeout', after: 5 as never } }); } };
    const done = await extract(failing, requestOf(), ground);
    assert.equal(calls.length, 1);
    assert.equal(done.kind, 'failed');
});
