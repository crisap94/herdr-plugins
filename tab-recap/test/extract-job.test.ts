import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract, OLD_CONTRACT } from '#src/recap/application/extract-job.ts';
import type { Extracted, Ground } from '#src/recap/application/extract-job.ts';
import { numbered } from '#src/recap/application/ledger-input.ts';
import { writerContext } from '#src/recap/application/writer-context.ts';
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
    gates: LEDGER_GATES, now: NOW, facts: new Map(numbering.ledgers.flatMap((ledger) => ledger.facts.map((fact) => [fact.id, fact] as const))),
    resolving: { tasks: ['t1'], agents: [], taskOf: numbering.taskOf, turns: [], clock: { now: NOW, zone: 'UTC' } },
    grounds: [{ key: 't1', tab: 'w1:t1', shown: numbering.shown.get('t1') ?? new Map(), closedLately: [shut], source: 'go', language: 'en', agents: [] }],
};
const add = (section: string, text: string): Record<string, unknown> => ({ op: 'add', section, text, anchor: 'go' });
const ops = (...list: readonly Record<string, unknown>[]): string => JSON.stringify({ ops: list });

function writer(answers: readonly string[], backend = 'fake', contract: 'strict' | 'free-text' = 'strict'): { summarizer: Summarizer; calls: RecapRequest[] } {
    const calls: RecapRequest[] = [];
    const summarizer: Summarizer = { backend, contract, write: (request): Promise<Written> => { calls.push(request); return Promise.resolve({ kind: 'written', text: answers[Math.min(calls.length - 1, answers.length - 1)] ?? '', costUsd: 0.5 }); } };
    return { summarizer, calls };
}

const run = (answers: readonly string[], backend = 'fake', contract: 'strict' | 'free-text' = 'strict'): Promise<{ done: Extracted; calls: RecapRequest[] }> => {
    const { summarizer, calls } = writer(answers, backend, contract);
    return extract(summarizer, requestOf(), ground).then((done) => ({ done, calls }));
};

const retryDoc = (request: RecapRequest | undefined): string => (request === undefined ? '' : writerContext(request));

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
    assert.match(retryDoc(calls[1]), /<operation op="add" section="done" anchor="go">Released tab-recap[^<]*<\/operation>\s*<reason gate="G2">it repeats f1 .*update f1 instead/);
    assert.match(retryDoc(calls[1]), /<fact id="f1" section="done"[^>]*>Released tab-recap 1\.10\.0 through the pipeline<\/fact>/, 'the fact the refusal names is shown');
    assert.ok(!retryDoc(calls[1]).includes('<transcript') && calls[1]?.correction === undefined, 'a short document, not the transcript again');
    assert.deepEqual(kept(done), [[`update ${released.id}`]]);
    assert.ok(done.kind === 'ops' && done.cost === 1 && done.stats.refused['G2'] === 1 && done.stats.dropped === 0);
});

test('refused twice: the operation is dropped, the rest is applied, and the stats say so', async () => {
    const bad = ops(add('done', 'Released tab-recap 1.10.0 through the pipeline now'), add('next', 'Tag the release'), { op: 'close', id: 'f99', why: 'done' });
    const again = ops(add('done', 'Released tab-recap 1.10.0 through the pipeline now'), { op: 'close', id: 'f99', why: 'done' });
    const { done, calls } = await run([bad, again]);
    assert.equal(calls.length, 2, 'one retry, not more');
    assert.deepEqual(kept(done), [['Tag the release']]);
    assert.ok(done.kind === 'ops');
    assert.deepEqual([done.stats.refused['G2'], done.stats.refused['G6'], done.stats.dropped], [2, 2, 2]);
});

test('a close without a why (G10) and a malformed operation are named in the correction', async () => {
    const { calls } = await run([ops({ op: 'close', id: 'f2' }, { op: 'add', section: 'mood', text: 'x' }), ops()]);
    assert.match(retryDoc(calls[1]), /<operation op="close" id="f2"\/>\s*<reason gate="G10">closing f2 needs a why/);
    assert.match(retryDoc(calls[1]), /<problem>an add needs a section/);
});

test('what only the fold refuses (a second goal, an update of a closed fact) is sent back too, as the ledger\'s refusal', async () => {
    const { done, calls } = await run([ops({ op: 'update', id: 'f3', text: 'Merged the lint fix again' }, add('goal', 'one'), add('goal', 'two')), ops()]);
    assert.match(retryDoc(calls[1]), /<operation op="update" id="f3">Merged the lint fix again<\/operation>\s*<reason gate="L">refused by the ledger: closed/);
    assert.match(retryDoc(calls[1]), /<operation op="add" section="goal" anchor="go">two<\/operation>\s*<reason gate="L">refused by the ledger: second-goal/);
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
    const custom = await run([old], 'custom/mine', 'free-text');
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

const SEVEN = ['Wrote the ledger gates', 'Opened !34 for feat/cart', 'Tagged v2.0.1 on main', 'Fixed the lint job in ci/lint.sh', 'Reviewed the migration plan', 'Merged !35 into main', 'Deployed 2.0.1 to staging'];

test('two refused operations out of nine: the retry document holds those two with their reasons, not the transcript, and the replacements join the seven that passed', async () => {
    const first = ops(...SEVEN.map((text) => add('done', text)), add('done', 'The agent wrote its report.'), add('decisions', 'Leave the db tab alone.'));
    const fixed = ops(add('done', 'The report is written to docs/report.md.'), { op: 'add', section: 'decisions', text: 'Leave the db tab alone because it is another task.', why: 'it is another task', anchor: 'go' });
    const { done, calls } = await run([first, fixed]);
    assert.equal(calls.length, 2);
    const document = retryDoc(calls[1]);
    assert.equal((document.match(/<refused/g) ?? []).length, 2);
    assert.ok(!document.includes('<transcript') && !document.includes('Wrote the ledger gates'), 'what passed is not sent again');
    assert.deepEqual(kept(done), [[...SEVEN, 'The report is written to docs/report.md.', 'Leave the db tab alone because it is another task.']]);
    assert.ok(done.kind === 'ops' && done.stats.refused['G1'] === 1 && done.stats.refused['G3'] === 1 && done.stats.dropped === 0);
});

test('a replacement that is still refused is dropped; the seven that passed and a good replacement are applied', async () => {
    const first = ops(...SEVEN.map((text) => add('done', text)), add('done', 'The agent wrote its report.'), add('decisions', 'Leave the db tab alone.'));
    const second = ops(add('done', 'The agent wrote its report, again.'), add('done', 'The report is written to docs/report.md.'));
    const { done, calls } = await run([first, second]);
    assert.equal(calls.length, 2, 'never a third try');
    assert.deepEqual(kept(done), [[...SEVEN, 'The report is written to docs/report.md.']]);
    assert.ok(done.kind === 'ops' && done.stats.dropped === 1 && done.stats.refused['G1'] === 2 && done.stats.refused['G3'] === 1);
});

test('an add without an anchor, and one whose anchor is not in the input, are sent back with G11 and the quote they gave', async () => {
    const first = ops({ op: 'add', section: 'done', text: 'Wrote the ledger gates' }, { op: 'add', section: 'done', text: 'Opened !34 for feat/cart', anchor: 'the pipeline was green' });
    const { done, calls } = await run([first, ops(add('done', 'Wrote the ledger gates'), add('done', 'Opened !34 for feat/cart'))]);
    assert.match(retryDoc(calls[1]), /<operation op="add" section="done">Wrote the ledger gates<\/operation>\s*<reason gate="G11">the anchor is missing/);
    assert.match(retryDoc(calls[1]), /anchor="the pipeline was green">Opened !34 for feat\/cart<\/operation>\s*<reason gate="G11">the anchor &quot;the pipeline was green&quot; is not in the input|anchor="the pipeline was green">Opened !34 for feat\/cart<\/operation>\s*<reason gate="G11">(<!\[CDATA\[)?the anchor "the pipeline was green" is not in the input/);
    assert.deepEqual(kept(done), [['Wrote the ledger gates', 'Opened !34 for feat/cart']]);
});
