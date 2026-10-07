import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC } from '#src/adapters/rubric.ts';
import { HarnessCurator } from '#src/adapters/harness-curator.ts';
import { CustomHarness } from '#src/adapters/custom-harness.ts';
import { ARGV_BYTES } from '#src/adapters/recap-prompt.ts';
import { HermesHarness } from '#src/adapters/hermes-harness.ts';
import type { Curated, Curators } from '#src/ports/curators.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { isUnknown, unknown } from '#src/ports/unknowable.ts';
import { Curate, CURATE_GAP_MS } from '#src/recap/application/curate.ts';
import type { CurateDeps } from '#src/recap/application/curate.ts';
import { timelineOf } from '#src/recap/render/timeline.ts';
import { cursor, memoryStore, seed } from '#test/db/support.ts';
import { facts, NOW } from '#test/fakes/curated-facts.ts';
import { fact } from '#test/fakes/fact-at.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { MemoryStories } from '#test/fakes/memory-stories.ts';
import { oneTask } from '#test/support.ts';

const T1 = { tab: 'w1:t1', key: 't1' };

/** One tab with one task whose ledger the curator will look at. */
function setup(answers: readonly (Curated)[], over: { readonly ledger?: MemoryLedger } = {}): { curate: Curate; ledger: MemoryLedger; stories: MemoryStories; store: ReturnType<typeof memoryStore>; logs: string[]; calls: string[]; clock: { now: number } } {
    const ledger = over.ledger ?? new MemoryLedger().seed(...facts);
    const stories = new MemoryStories(ledger);
    const store = memoryStore();
    seed(store, { ...blankRecap('w1:t1'), at: 5, lanes: [cursor('w1:p1')], tasks: oneTask('## Goal\n- x') });
    const [logs, calls, clock, queue] = [[] as string[], [] as string[], { now: NOW }, [...answers]];
    const writer: Curators = { backend: 'fake/test', write: (document) => { calls.push(document); return Promise.resolve(queue.shift() ?? unknown({ why: 'failed', code: 1, detail: 'no more answers' })); } };
    const deps: CurateDeps = { records: store.records, ledger, stories, writer: () => writer, clock: () => clock.now, zone: () => 'UTC', language: () => 'en', rubric: RUBRIC.items, log: (line) => { logs.push(line); } };
    const curate = new Curate(deps);
    return { curate, ledger, stories, store, logs, calls, clock };
}

const answer = (body: object): Curated => ({ kind: 'curated', text: JSON.stringify(body) });

test('a duplicate is closed as merged and the paragraph stored with the run time; the timeline shows it as merged', async () => {
    const { curate, ledger, stories, calls } = setup([answer({ ops: [{ op: 'close', id: 'f1', why: 'merged', into: 'f2' }], story: 'The migration is written; its tests run.' })]);
    await curate.run('w1:t1');
    assert.equal(calls.length, 1);
    assert.deepEqual(stories.read('w1:t1', 't1'), { text: 'The migration is written; its tests run.', at: NOW });
    const closed = ledger.allOf(T1).find((each) => each.id === 'a');
    assert.deepEqual([closed?.state, closed?.closedWhy, closed?.closedAt], ['closed', 'merged', NOW]);
    assert.ok(timelineOf(ledger.allOf(T1)).some((entry) => entry.fact.id === 'a' && entry.closed === 'merged'));
});

test('an add or an update is refused and logged, and the paragraph is still stored', async () => {
    const { curate, ledger, stories, logs } = setup([answer({ ops: [{ op: 'add', section: 'done', text: 'invented', why: null, ref: null, at: null, agent: null }, { op: 'update', id: 'f1', text: 'rewritten' }], story: 'Kept.' })]);
    await curate.run('w1:t1');
    assert.equal(stories.read('w1:t1', 't1')?.text, 'Kept.');
    assert.equal(ledger.allOf(T1).length, facts.length, 'nothing was added');
    assert.equal(ledger.allOf(T1).find((each) => each.id === 'a')?.text, 'Running the migration tests', 'nothing was rewritten');
    assert.equal(logs.filter((line) => line.includes('refused')).length, 2);
});

test('the ledger refusing a merge is logged; an answer with no paragraph applies the merges and leaves the story stale', async () => {
    const { curate, stories, logs, ledger } = setup([answer({ ops: [{ op: 'close', id: 'f5', why: 'merged', into: 'f1' }], story: 'x' }), answer({ ops: [{ op: 'close', id: 'f2', why: 'merged', into: 'f3' }] })]);
    await curate.run('w1:t1');
    assert.equal(logs.length, 1, 'f5 is closed already: refused by the curation check, logged');
    assert.match(logs[0] ?? '', /not an open fact/u);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'x');
    const later = setup([answer({ ops: [{ op: 'close', id: 'f2', why: 'merged', into: 'f3' }] })]);
    await later.curate.run('w1:t1');
    assert.equal(later.stories.read('w1:t1', 't1'), null);
    assert.equal(later.ledger.allOf(T1).find((each) => each.id === 'b')?.closedWhy, 'merged');
    assert.ok(later.logs.some((line) => line.includes('no paragraph')));
    assert.ok(ledger.allOf(T1).length > 0);
});

test('at most one call per task per five minutes; a story newer than the ledger is not asked for again', async () => {
    const { curate, ledger, stories, calls, clock } = setup([answer({ story: 'one' }), answer({ story: 'two' }), answer({ story: 'three' })]);
    await curate.run('w1:t1');
    assert.equal(calls.length, 1);
    await curate.run('w1:t1');
    assert.equal(calls.length, 1, 'nothing changed since the story: no call');
    ledger.seed(fact('g', 'now', 'A fact that arrives after the story', NOW + 1000));
    clock.now = NOW + CURATE_GAP_MS - 1;
    await curate.run('w1:t1');
    assert.equal(calls.length, 1, 'changed, but five minutes have not passed');
    clock.now = NOW + CURATE_GAP_MS;
    await curate.run('w1:t1');
    assert.equal(calls.length, 2);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'two');
});

test('a curator that is off, silent or failing leaves everything as it was, and the failure is logged', async () => {
    const down = setup([unknown({ why: 'timeout', after: 1 as never })]);
    await down.curate.run('w1:t1');
    assert.match(down.logs[0] ?? '', /fake\/test gave none/u);
    assert.equal(down.stories.read('w1:t1', 't1'), null);
    const off = setup([]);
    const quiet: CurateDeps = { records: off.store.records, ledger: off.ledger, stories: off.stories, writer: () => null, clock: () => NOW, zone: () => 'UTC', language: () => 'en', rubric: RUBRIC.items, log: () => undefined };
    await new Curate(quiet).run('w1:t1');
    assert.equal(off.calls.length, 0);
    const empty = setup([answer({ story: 'never' })], { ledger: new MemoryLedger() });
    await empty.curate.run('w1:t1');
    assert.equal(empty.calls.length, 0, 'a task with no facts is not worth a call');
    const garbage = setup([{ kind: 'curated', text: 'sorry, no' }]);
    await garbage.curate.run('w1:t1');
    assert.deepEqual(garbage.logs, ['curator w1:t1 t1: refused — the answer is not JSON', 'curator w1:t1 t1: no paragraph in the answer; the old one stays']);
});

const settings = { model: '', effort: 'medium' } as const;

test('the curator is a job on a harness: its instructions follow the document, and a document too long for an argument is refused', async () => {
    const echo = new CustomHarness('node -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000);
    const written = await new HarnessCurator(echo, settings).write('<curator_input version="1"/>');
    assert.ok(written.kind === 'curated' && written.text.startsWith('<curator_input') && written.text.includes('"op":"close"') && written.text.includes('at most 120 words'));
    const refused = await new HarnessCurator(new HermesHarness(process.cwd(), 1), settings).write('x'.repeat(ARGV_BYTES));
    assert.ok(isUnknown(refused) && refused.why.why === 'unreadable');
});
