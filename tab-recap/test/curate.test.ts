import { choice, customHarness } from '#test/fakes/harness-runtime.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import type { Curated, Curators } from '@stateforge-labs/session-ledger';
import { blankRecap } from '@stateforge-labs/session-ledger';
import { unknown, exitCodeOf } from '@stateforge-labs/session-ledger';
import { causeOf } from './fakes/cause.ts';
import { CurateTasks } from '#src/recap/application/curate.ts';
import { inputOf } from '@stateforge-labs/session-ledger';
import { writerContext } from '@stateforge-labs/session-ledger';
import type { CurateDeps } from '#src/recap/application/curate.ts';
import type { RepairMode } from '@stateforge-labs/session-ledger';
import { parseText } from '@stateforge-labs/session-ledger';
import { cursor, memoryStore, seed } from '#test/db/support.ts';
import { facts, NOW } from '#test/fakes/curated-facts.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { MemoryStories } from '#test/fakes/memory-stories.ts';
import { factOf } from './fakes/facts.ts';
import { keepNewestOf, nextHoursOf, prunedWriterView } from '@stateforge-labs/session-ledger';
import { NO_REPOS, oneTask, requestOf } from '#test/support.ts';
import { brand } from '@stateforge-labs/session-ledger';
import { must } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { tabId } from '#test/support/ids.ts';
import { tabIdOf } from '#src/recap/domain/ids.ts';

const [textOf, instantOf] = [brand<string, 'Text'>, brand<number, 'Instant'>];

const T1 = { scope: tabIdOf('w1:t1'), key: textOf('t1') };

function setup(answers: readonly (Curated)[], over: { readonly ledger?: MemoryLedger; readonly repair?: RepairMode } = {}):{ curate: CurateTasks; ledger: MemoryLedger; stories: MemoryStories; store: ReturnType<typeof memoryStore>; logs: string[]; calls: string[]; clock: { now: number } } {
    const ledger = over.ledger ?? new MemoryLedger().seed(...facts);
    const stories = new MemoryStories(ledger);
    const store = memoryStore();
    seed(store, { ...blankRecap(tabId('w1:t1')), at: instant(5), sessions: [cursor('w1:p1')], tasks: oneTask('## Goal\n- x') });
    const [logs, calls, clock, queue] = [[] as string[], [] as string[], { now: NOW }, [...answers]];
    const writer: Curators = { backend: must(parseText('fake/test')), write: (document) => { calls.push(document); return Promise.resolve(queue.shift() ?? unknown({ why: 'failed', code: exitCodeOf(1), detail: causeOf('no more answers') })); } };
    const mode = over.repair;
    const deps: CurateDeps = { records: store.records, ledger, stories, writer: () => writer, clock: () => instantOf(clock.now), zone: () => textOf('UTC'), language: () => textOf('en'), rubric: textOf(RUBRIC.items), ...(mode === undefined ? {} : { repair: (): RepairMode => mode }), log: (line) => { logs.push(line); } };
    const curate = new CurateTasks(deps);
    return { curate, ledger, stories, store, logs, calls, clock };
}

const answer = (body: object): Curated => ({ kind: 'curated', text: textOf(JSON.stringify(body)) });

test('the curator document stays byte-identical and includes every open fact when the writer view is pruned', async () => {
    const open = Array.from({ length: 20 }, (_, at) => factOf('done', `done ${at}`, { lastAt: instant(at + 1) }));
    const ledger = new MemoryLedger().seed(...open);
    const runCurator = async (): Promise<string> => {
        const { curate, calls } = setup([answer({ story: 'All facts are retained.' })], { ledger });
        await curate.run(tabId('w1:t1'));
        assert.equal(calls.length, 1);
        return calls[0] ?? '';
    };
    const beforePruning = await runCurator();
    const built = await inputOf([], { scope: brand<string, 'Text'>('w1:t1'), repos: NO_REPOS, now: brand<number, 'Instant'>(NOW), tasks: [{ id: textOf('t1'), name: textOf(''), sessions: [] }], facts: [{ key: brand<string, 'Text'>('t1'), open, closed: [] }], writerView: prunedWriterView(keepNewestOf(10), nextHoursOf(24)) });
    assert.match(writerContext({ ...requestOf(), input: built.input }), /<hidden section="done" count="10"\/>/u, 'the writer view really prunes in this run');
    const withPruning = await runCurator();
    assert.equal(withPruning, beforePruning);
    assert.equal((withPruning.match(/<fact /gu) ?? []).length, 20);
});

test('the ledger refusing a merge is logged; an answer with no paragraph applies the merges and leaves the story stale', async () => {
    const { curate, stories, logs, ledger } = setup([answer({ ops: [{ op: 'close', id: 'f5', why: 'merged', into: 'f1' }], story: 'x' }), answer({ ops: [{ op: 'close', id: 'f2', why: 'merged', into: 'f3' }] })]);
    await curate.run(tabId('w1:t1'));
    assert.equal(logs.length, 1, 'f5 is closed already: refused by the curation check, logged');
    assert.match(logs[0] ?? '', /not an open fact/u);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'x');
    const later = setup([answer({ ops: [{ op: 'close', id: 'f2', why: 'merged', into: 'f3' }] })]);
    await later.curate.run(tabId('w1:t1'));
    assert.equal(later.stories.read('w1:t1', 't1'), null);
    assert.equal(later.ledger.allOf(T1).find((each) => each.id === 'b')?.closedWhy, 'merged');
    assert.ok(later.logs.some((line) => line.includes('no paragraph')));
    assert.ok(ledger.allOf(T1).length > 0);
});

test('a story answer with text around its JSON object is read as that object', async () => {
    const { curate, ledger, stories, logs } = setup([{ kind: 'curated', text: textOf('Here it is: {"ops":[{"op":"close","id":"f2","why":"merged","into":"f1"}],"story":"One line."} Thanks.') }]);
    await curate.run(tabId('w1:t1'));
    assert.equal(ledger.allOf(T1).find((each) => each.id === 'b')?.closedWhy, 'merged');
    assert.equal(stories.read('w1:t1', 't1')?.text, 'One line.');
    assert.equal(logs.filter((line) => line.includes('refused')).length, 0);
});

test('a story answer that is a JSON array is refused and nothing is stored', async () => {
    const { curate, stories, logs } = setup([{ kind: 'curated', text: textOf('[{"a":1}]') }]);
    await curate.run(tabId('w1:t1'));
    assert.ok(logs.includes('curator w1:t1 t1: refused — the answer is not an object'));
    assert.equal(stories.read('w1:t1', 't1'), null);
});

const settings = choice('', 'medium');

test('the curator is a job on a harness: its instructions follow the document', async () => {
    const echo = customHarness('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000);
    const written = await new HarnessCurator(echo, settings).write(must(parseText('<curator_input version="1"/>')));
    assert.ok(written.kind === 'curated' && written.text.startsWith('<curator_input') && written.text.includes('"op":"close"') && written.text.includes('at most 120 words'));
});

const MERGE_F1 = { op: 'close', id: 'f1', why: 'merged', into: 'f2' };

test('with repair once, an answer with no paragraph is sent back once, and a repair that gives none keeps the first answer', async () => {
    const { curate, calls, logs, stories } = setup([answer({ ops: [MERGE_F1] })], { repair: 'once' });
    await curate.run(tabId('w1:t1'));
    assert.equal(calls.length, 2);
    assert.ok(calls[1]?.includes('- no paragraph'));
    assert.ok(logs.includes('curator w1:t1 t1: story repair — 0 refused'));
    assert.ok(logs.some((line) => line.includes('no paragraph in the answer; the old one stays')));
    assert.equal(stories.read('w1:t1', 't1'), null);
});

function words(count: number): string {
    return Array.from({ length: count }, (_, at) => `w${at}`).join(' ');
}

const TOO_LONG_121 = 'curator w1:t1 t1: refused — the paragraph is too long: 121 words, at most 120';

function oldStory(stories: MemoryStories): void {
    stories.keep({ task: T1, at: instant(NOW - 100 * 60_000), language: textOf('en') }, { story: 'Old.', merges: [] });
}

test('a paragraph of 121 words is refused, logged with its count, and the merge still applies with no repair', async () => {
    const { curate, calls, logs, stories, ledger } = setup([answer({ ops: [MERGE_F1], story: words(121) })]);
    oldStory(stories);
    await curate.run(tabId('w1:t1'));
    assert.equal(calls.length, 1);
    assert.ok(logs.includes(TOO_LONG_121));
    assert.equal(logs.filter((line) => line.includes('story repair')).length, 0);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'Old.');
    assert.equal(ledger.allOf(T1).find((each) => each.id === 'a')?.closedWhy, 'merged');
});
