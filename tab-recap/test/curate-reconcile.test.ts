import { choice, customHarness } from '#test/fakes/harness-runtime.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import type { Curated, CuratorMode, Curators } from '#src/ports/curators.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { unknown, exitCodeOf } from '#src/ports/unknowable.ts';
import { causeOf } from './fakes/cause.ts';
import { CurateTasks, CURATE_GAP_MS } from '#src/recap/application/curate.ts';
import { reconcileInput } from '#src/recap/application/curator-input.ts';
import { RECONCILE_EVERY } from '#src/recap/application/ledger-reconcile.ts';
import type { RepairMode } from '#src/recap/application/job-kit/repair.ts';
import { cursor, memoryStore, seed } from '#test/db/support.ts';
import { fact } from '#test/fakes/fact-at.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { MemoryStories } from '#test/fakes/memory-stories.ts';
import { oneTask } from '#test/support.ts';
import { dtdTest, validate } from '#test/xmllint.ts';
import { brand } from '#src/recap/domain/brand.ts';
import { instant, type Instant } from '#src/recap/domain/time.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { Count } from '#src/recap/domain/count.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { tabId } from '#src/recap/domain/ids.ts';
import { tabIdOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/lane-shape.ts';

const [textOf, countOf, tabOf, boundaryOf, instantOf] = [brand<string, 'Text'>, brand<number, 'Count'>, brand<string, 'TabId'>, brand<boolean, 'Boundary'>, brand<number, 'Instant'>];

const NOW = Date.parse('2026-10-07T16:30:00Z');
const MIN = 60_000;
const T1 = { tab: tabIdOf('w1:t1'), key: textOf('t1') };
const facts = [
    fact('q', 'needs', 'Which branch should the release ship from?', NOW - 50 * MIN),
    fact('d', 'decisions', 'Keep carts in SQLite', NOW - 40 * MIN, { why: textOf('one file to back up') }),
    fact('n', 'now', 'Running the migration tests', NOW - 30 * MIN),
    fact('m', 'now', 'Running tests of the migration', NOW - 29 * MIN),
    fact('x', 'done', 'Wrote migration 007', NOW - 28 * MIN, { state: 'closed', closedWhy: 'done', closedAt: instant(NOW - 27 * MIN) }),
];
const TAIL: readonly Entry[] = [
    { role: 'agent', text: textOf('Which branch should the release ship from?'), at: instant(NOW - 20 * MIN) },
    { role: 'user', text: textOf('Ship from release/2.1, not main.'), at: instant(NOW - 19 * MIN) },
    { role: 'agent', text: textOf('The migration tests pass now.'), at: instant(NOW - 5 * MIN) },
];

interface Rig {
    readonly curate: CurateTasks;
    readonly ledger: MemoryLedger;
    readonly calls: { document: string; mode: CuratorMode | undefined }[];
    readonly logs: string[];
    readonly clock: { now: number };
}

function setup(answers: readonly Curated[], over: { every?: number; tail?: readonly Entry[]; repair?: RepairMode } = {}): Rig {
    const ledger = new MemoryLedger().seed(...facts);
    const stories = new MemoryStories(ledger);
    const store = memoryStore();
    seed(store, { ...blankRecap(tabId('w1:t1')), at: instant(5), lanes: [cursor('w1:p1')], tasks: oneTask('## Goal\n- x') });
    const [logs, calls, clock, queue]: [string[], Rig['calls'], { now: number }, Curated[]] = [[], [], { now: NOW }, [...answers]];
    const writer: Curators = { backend: must(parseText('fake/test')), write: (document, mode): Promise<Curated> => { calls.push({ document, mode }); return Promise.resolve(queue.shift() ?? unknown({ why: 'failed', code: exitCodeOf(1), detail: causeOf('no more answers') })); } };
    const mode = over.repair;
    const curate = new CurateTasks({
        records: store.records, ledger, stories, writer: (): Curators => writer, clock: (): Instant => instantOf(clock.now), zone: (): Text => textOf('UTC'), language: (): Text => textOf('en'), rubric: textOf(RUBRIC.items),
        tail: (): Promise<readonly Entry[]> => Promise.resolve(over.tail ?? TAIL), every: (): Count => over.every === undefined ? RECONCILE_EVERY : countOf(over.every), ...(mode === undefined ? {} : { repair: (): RepairMode => mode }), log: (line): void => { logs.push(line); },
    });
    return { curate, ledger, calls, logs, clock };
}

const said = (body: object): Curated => ({ kind: 'curated', text: textOf(JSON.stringify(body)) });
function stateOf(ledger: MemoryLedger, id: string): readonly unknown[] {
    const found = ledger.allOf(T1).find((each) => each.id === id);
    return [found?.state, found?.closedWhy, found?.text];
}
const ANSWERED = { op: 'close', id: 'f1', why: 'answered', evidence: 'Ship from release/2.1, not main' };

test('a stale question is closed as answered, on the quote of the operator\'s reply; the call is a reconcile with the open facts and the newest turns only', async () => {
    const { curate, ledger, calls } = setup([said({ ops: [ANSWERED] })]);
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(calls.length, 1);
    const [first] = calls;
    assert.equal(first?.mode, 'reconcile');
    assert.match(first.document, /<curator_input version="1" mode="reconcile">/);
    assert.ok(first.document.includes('<tail') && first.document.includes('Ship from release/2.1, not main.') && !first.document.includes('Wrote migration 007'), 'open facts and the tail; no closed fact');
    assert.deepEqual(stateOf(ledger, 'q'), ['closed', 'answered', 'Which branch should the release ship from?']);
});

test('a reconcile answer wrapped in a sentence is read: the stale question is closed as answered, as when the answer is bare JSON', async () => {
    const { curate, ledger, logs } = setup([{ kind: 'curated', text: textOf(`Here you go: ${JSON.stringify({ ops: [ANSWERED] })} Done.`) }]);
    await curate.run(tabId('w1:t1'), 'turns');
    assert.deepEqual(stateOf(ledger, 'q'), ['closed', 'answered', 'Which branch should the release ship from?']);
    assert.ok(!logs.some((line) => /reconcile refused/.test(line)), logs.join('\n'));
});

test('an update with a quote changes the fact; a merge needs no quote; each passes the writer\'s gates', async () => {
    const { curate, ledger, logs } = setup([said({ ops: [
        { op: 'update', id: 'f3', text: 'The migration tests pass', evidence: 'The migration tests pass now' },
        { op: 'close', id: 'f4', why: 'merged', into: 'f3' },
        { op: 'update', id: 'f2', text: 'claude kept carts in SQLite', why: 'one file', evidence: 'The migration tests pass now' },
    ] })]);
    await curate.run(tabId('w1:t1'), 'turns');
    assert.deepEqual(stateOf(ledger, 'n'), ['open', null, 'The migration tests pass']);
    assert.deepEqual(stateOf(ledger, 'm'), ['closed', 'merged', 'Running tests of the migration']);
    assert.equal(stateOf(ledger, 'd')[2], 'Keep carts in SQLite', 'the narrator gate refused the third');
    assert.ok(logs.some((line) => /reconcile refused — G1/.test(line)), logs.join('\n'));
});

test('an add is refused and logged, nothing is added; nor is a close for a reason the curator may not give, or of a question that is not one', async () => {
    const { curate, ledger, logs } = setup([said({ ops: [
        { op: 'add', section: 'done', text: 'invented', evidence: 'x' },
        { op: 'close', id: 'f2', why: 'answered', evidence: 'Ship from release/2.1, not main' },
        { op: 'close', id: 'f3', why: 'rewritten', evidence: 'The migration tests pass now' },
        { op: 'close', id: 'f9', why: 'done', evidence: 'The migration tests pass now' },
    ] })]);
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(ledger.allOf(T1).length, facts.length);
    assert.deepEqual(logs.filter((line) => line.includes('refused')).map((line) => line.replace(/^.*refused — /, '')), [
        'add is not allowed: a reconciliation only changes or closes what is there',
        'close f2 as answered: only a "needs" fact is answered',
        'close f3 needs a reason: done, wrong, superseded, answered or merged',
        'f9 is not an open fact (or is already changed)',
    ]);
    assert.ok(ledger.openOf(T1).length === 4);
});

test('after a compaction a summary that leaves a decision out is no evidence: a close with a quote that is not in the turns is refused, and the decision stays open', async () => {
    const compacted: readonly Entry[] = [{ role: 'user', text: textOf('This session is being continued. Summary: we are migrating the importer and the tests pass.'), at: instant(NOW - 2 * MIN) }];
    const { curate, ledger, logs } = setup([said({ ops: [
        { op: 'close', id: 'f2', why: 'superseded', evidence: 'the decision to keep carts in SQLite was dropped' },
        { op: 'close', id: 'f2', why: 'wrong' },
    ] })], { tail: compacted });
    await curate.run(tabId('w1:t1'), 'boundary');
    assert.deepEqual(stateOf(ledger, 'd'), ['open', null, 'Keep carts in SQLite']);
    assert.equal(logs.filter((line) => /its evidence is not in the newest turns/.test(line)).length, 2, 'a quote that is not there, and none at all');
});

test('the same fact is changed once per answer, and a fact merged into is left alone', async () => {
    const { curate, ledger } = setup([said({ ops: [
        { op: 'close', id: 'f4', why: 'merged', into: 'f3' },
        { op: 'close', id: 'f3', why: 'done', evidence: 'The migration tests pass now' },
        { op: 'update', id: 'f4', text: 'again', evidence: 'The migration tests pass now' },
    ] })]);
    await curate.run(tabId('w1:t1'), 'turns');
    assert.deepEqual([stateOf(ledger, 'n')[0], stateOf(ledger, 'm')[0]], ['open', 'closed']);
});

test('when: every N turns, at once after a boundary, and at an open only when turns came since; never twice in five minutes', async () => {
    const quiet = said({ ops: [] });
    const { curate, calls, clock } = setup([quiet, quiet, quiet, quiet, quiet, quiet], { every: 3 });
    await curate.afterRun({ tab: tabOf('w1:t1'), turns: countOf(2), boundary: boundaryOf(false) });
    assert.equal(calls.length, 0, 'two turns of three');
    await curate.afterRun({ tab: tabOf('w1:t1'), turns: countOf(1), boundary: boundaryOf(false) });
    assert.equal(calls.length, 1, 'the third');
    clock.now += CURATE_GAP_MS - 1;
    await curate.afterRun({ tab: tabOf('w1:t1'), turns: countOf(5), boundary: boundaryOf(true) });
    assert.equal(calls.length, 1, 'a boundary inside the five minutes waits for them');
    clock.now += 1;
    await curate.afterRun({ tab: tabOf('w1:t1'), turns: countOf(0), boundary: boundaryOf(true) });
    assert.equal(calls.length, 2, 'the first run after a boundary reconciles');
    clock.now += CURATE_GAP_MS;
    await curate.run(tabId('w1:t1'));
    assert.equal(calls.filter((call) => call.mode === 'reconcile').length, 2, 'an open with no new turn does not reconcile again');
    assert.equal(calls.filter((call) => call.mode === 'story').length + calls.filter((call) => call.mode === undefined).length, 1, 'but tells the story as before');
    await curate.afterRun({ tab: tabOf('w1:t1'), turns: countOf(1), boundary: boundaryOf(false) });
    clock.now += CURATE_GAP_MS;
    await curate.run(tabId('w1:t1'));
    assert.equal(calls.filter((call) => call.mode === 'reconcile').length, 3, 'an open after a new turn does');
});

test('no tail, no open fact or no curator: no call; a curator that gives none is logged and the ledger is as it was', async () => {
    const none = setup([unknown({ why: 'timeout', after: 1 as never })]);
    await none.curate.run(tabId('w1:t1'), 'turns');
    assert.match(none.logs[0] ?? '', /fake\/test gave none to reconcile/);
    const empty = setup([said({ ops: [] })], { tail: [] });
    await empty.curate.run(tabId('w1:t1'), 'turns');
    assert.equal(empty.calls.length, 0, 'nothing to read, nothing to ask');
    const garbage = setup([{ kind: 'curated', text: textOf('sorry, no') }]);
    await garbage.curate.run(tabId('w1:t1'), 'turns');
    assert.deepEqual(garbage.logs, ['curator w1:t1 t1: reconcile refused — the answer is not JSON']);
});

dtdTest('the reconcile document is valid against the DTD, holds only the open facts and the "still true" check, and the tail it quotes', () => {
    const built = reconcileInput({ name: brand<string, 'Text'>(''), language: brand<string, 'Text'>('en'), rubric: brand<string, 'Text'>(RUBRIC.items), open: facts.filter((each) => each.state === 'open'), tail: [...TAIL, { role: 'agent', text: textOf('Error: </turn> & ]]> \u001b[31mred'), at: instant(NOW) }], clock: { now: instant(NOW), zone: brand<string, 'Text'>('UTC') } });
    assert.deepEqual(validate(built.document, 'curator-input.dtd'), { valid: true, output: '' });
    assert.ok(built.document.includes('I7 still true') && !built.document.includes('I1 ') && !built.document.includes('Wrote migration 007'));
    assert.ok(built.tail.includes('Ship from release/2.1, not main.') && built.facts.size === 4);
});

test('the curator harness reconciles with its own instructions, and tells the story with the old ones', async () => {
    const echo = customHarness('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000);
    const curator = new HarnessCurator(echo, choice('', 'medium'));
    const reconciled = await curator.write(must(parseText('<curator_input version="1" mode="reconcile"/>')), 'reconcile');
    assert.ok(reconciled.kind === 'curated' && reconciled.text.includes('Never add a fact.') && reconciled.text.includes('is NOT wrong') && !reconciled.text.includes('at most 120 words'));
    const told = await curator.write(must(parseText('<curator_input version="1"/>')));
    assert.ok(told.kind === 'curated' && told.text.includes('at most 120 words') && !told.text.includes('Never add a fact.'));
});

test('an update of an unknown id is refused and logged, nothing is changed', async () => {
    const { curate, ledger, logs } = setup([said({ ops: [
        { op: 'update', id: 'f9', text: 'Invented change', why: 'one file', evidence: 'The migration tests pass now' },
    ] })]);
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(ledger.allOf(T1).length, facts.length);
    assert.equal(ledger.openOf(T1).length, 4);
    assert.deepEqual(logs.filter((line) => line.includes('refused')).map((line) => line.replace(/^.*refused — /, '')), ['f9 is not an open fact (or is already changed)']);
});

const FIRST_UNKNOWN = { op: 'close', id: 'f9', why: 'done', evidence: 'The migration tests pass now' };

test('with no repair, a refused reconcile answer is not repaired: one call, the kept close is applied', async () => {
    const { curate, ledger, calls, logs } = setup([said({ ops: [ANSWERED, FIRST_UNKNOWN] })]);
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(calls.length, 1);
    assert.ok(!logs.some((line) => /repair/.test(line)), logs.join('\n'));
    assert.deepEqual(stateOf(ledger, 'q'), ['closed', 'answered', 'Which branch should the release ship from?']);
});

test('with repair once and a clean answer, there is one call and no repair', async () => {
    const { curate, ledger, calls, logs } = setup([said({ ops: [ANSWERED] })], { repair: 'once' });
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(calls.length, 1);
    assert.ok(!logs.some((line) => /repair/.test(line)), logs.join('\n'));
    assert.deepEqual(stateOf(ledger, 'q'), ['closed', 'answered', 'Which branch should the release ship from?']);
});

test('with repair once and no repair given, the first answer kept ops are applied and the gap is logged', async () => {
    const { curate, ledger, calls, logs } = setup([said({ ops: [ANSWERED, FIRST_UNKNOWN] })], { repair: 'once' });
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(calls.length, 2);
    assert.ok(logs.includes('curator w1:t1 t1: reconcile repair — 1 refused'), logs.join('\n'));
    assert.ok(logs.some((line) => line.startsWith('curator w1:t1 t1: fake/test gave no repair (')), logs.join('\n'));
    assert.deepEqual(stateOf(ledger, 'q'), ['closed', 'answered', 'Which branch should the release ship from?']);
});

test('with repair once and a repair that is not JSON, the first answer kept ops are applied', async () => {
    const { curate, ledger, calls, logs } = setup([said({ ops: [ANSWERED, FIRST_UNKNOWN] }), { kind: 'curated', text: textOf('sorry, no') }], { repair: 'once' });
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(calls.length, 2);
    assert.ok(logs.includes('curator w1:t1 t1: reconcile repair refused — the answer is not JSON'), logs.join('\n'));
    assert.deepEqual(stateOf(ledger, 'q'), ['closed', 'answered', 'Which branch should the release ship from?']);
});

test('with repair once, the repair document lists the refused operation, and a fixed repair is applied', async () => {
    const { curate, ledger, calls } = setup([said({ ops: [FIRST_UNKNOWN] }), said({ ops: [ANSWERED] })], { repair: 'once' });
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(calls.length, 2);
    const [, repair] = calls;
    assert.ok(repair?.document.includes(`\n\n<previous-answer>\n${JSON.stringify({ ops: [FIRST_UNKNOWN] })}\n</previous-answer>\n\n<refused>\n- f9 is not an open fact (or is already changed)\n</refused>\n\nYour previous answer, in <previous-answer>, had refused operations`), repair?.document);
    assert.deepEqual(stateOf(ledger, 'q'), ['closed', 'answered', 'Which branch should the release ship from?']);
});

test('with repair once, a repair refused again logs its refusal and applies its kept ops, not the first answer kept ops', async () => {
    const { curate, ledger, calls, logs } = setup([said({ ops: [ANSWERED, FIRST_UNKNOWN] }), said({ ops: [FIRST_UNKNOWN, { op: 'close', id: 'f4', why: 'wrong', evidence: 'The migration tests pass now' }] })], { repair: 'once' });
    await curate.run(tabId('w1:t1'), 'turns');
    assert.equal(calls.length, 2);
    assert.ok(logs.includes('curator w1:t1 t1: reconcile refused — f9 is not an open fact (or is already changed)'), logs.join('\n'));
    assert.deepEqual(stateOf(ledger, 'm'), ['closed', 'wrong', 'Running tests of the migration']);
    assert.deepEqual(stateOf(ledger, 'q'), ['open', null, 'Which branch should the release ship from?']);
});
