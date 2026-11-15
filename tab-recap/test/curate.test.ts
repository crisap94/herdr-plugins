import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import { HarnessCurator } from '#src/adapters/job/curator.ts';
import { CustomHarness } from '#src/adapters/harness/custom.ts';
import type { Curated, Curators } from '#src/ports/curators.ts';
import { blankRecap } from '#src/ports/recap-records.ts';
import { unknown } from '#src/ports/unknowable.ts';
import { causeOf } from './fakes/cause.ts';
import { Curate, CURATE_GAP_MS } from '#src/recap/application/curate.ts';
import { inputOf } from '#src/recap/application/recap-input.ts';
import { writerContext } from '#src/recap/application/writer-context.ts';
import type { CurateDeps } from '#src/recap/application/curate.ts';
import type { RepairMode } from '#src/recap/application/job-kit/repair.ts';
import { storyRepair } from '#src/recap/application/job-kit/story-repair.ts';
import { parseText } from '#src/recap/domain/text.ts';
import { timelineOf } from '#src/recap/render/timeline.ts';
import { cursor, memoryStore, seed } from '#test/db/support.ts';
import { facts, NOW } from '#test/fakes/curated-facts.ts';
import { fact } from '#test/fakes/fact-at.ts';
import { MemoryLedger } from '#test/fakes/memory-ledger.ts';
import { MemoryStories } from '#test/fakes/memory-stories.ts';
import { factOf } from './fakes/facts.ts';
import { keepNewestOf, nextHoursOf, prunedWriterView } from '#src/recap/domain/writer-view.ts';
import { NO_REPOS, oneTask, requestOf } from '#test/support.ts';

const T1 = { tab: 'w1:t1', key: 't1' };

function setup(answers: readonly (Curated)[], over: { readonly ledger?: MemoryLedger; readonly repair?: RepairMode } = {}):{ curate: Curate; ledger: MemoryLedger; stories: MemoryStories; store: ReturnType<typeof memoryStore>; logs: string[]; calls: string[]; clock: { now: number } } {
    const ledger = over.ledger ?? new MemoryLedger().seed(...facts);
    const stories = new MemoryStories(ledger);
    const store = memoryStore();
    seed(store, { ...blankRecap('w1:t1'), at: 5, lanes: [cursor('w1:p1')], tasks: oneTask('## Goal\n- x') });
    const [logs, calls, clock, queue] = [[] as string[], [] as string[], { now: NOW }, [...answers]];
    const writer: Curators = { backend: 'fake/test', write: (document) => { calls.push(document); return Promise.resolve(queue.shift() ?? unknown({ why: 'failed', code: 1, detail: causeOf('no more answers') })); } };
    const mode = over.repair;
    const deps: CurateDeps = { records: store.records, ledger, stories, writer: () => writer, clock: () => clock.now, zone: () => 'UTC', language: () => 'en', rubric: RUBRIC.items, ...(mode === undefined ? {} : { repair: (): RepairMode => mode }), log: (line) => { logs.push(line); } };
    const curate = new Curate(deps);
    return { curate, ledger, stories, store, logs, calls, clock };
}

const answer = (body: object): Curated => ({ kind: 'curated', text: JSON.stringify(body) });

test('the curator document stays byte-identical and includes every open fact when the writer view is pruned', async () => {
    const open = Array.from({ length: 20 }, (_, at) => factOf('done', `done ${at}`, { lastAt: at + 1 }));
    const ledger = new MemoryLedger().seed(...open);
    const runCurator = async (): Promise<string> => {
        const { curate, calls } = setup([answer({ story: 'All facts are retained.' })], { ledger });
        await curate.run('w1:t1');
        assert.equal(calls.length, 1);
        return calls[0] ?? '';
    };
    const beforePruning = await runCurator();
    const built = await inputOf([], { tab: 'w1:t1', repos: NO_REPOS, now: NOW, tasks: [{ id: 't1', name: '', lanes: [] }], facts: [{ key: 't1', open, closed: [] }], writerView: prunedWriterView(keepNewestOf(10), nextHoursOf(24)) });
    assert.match(writerContext({ ...requestOf(), input: built.input }), /<hidden section="done" count="10"\/>/u, 'the writer view really prunes in this run');
    const withPruning = await runCurator();
    assert.equal(withPruning, beforePruning);
    assert.equal((withPruning.match(/<fact /gu) ?? []).length, 20);
});

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

test('a story answer with text around its JSON object is read as that object', async () => {
    const { curate, ledger, stories, logs } = setup([{ kind: 'curated', text: 'Here it is: {"ops":[{"op":"close","id":"f2","why":"merged","into":"f1"}],"story":"One line."} Thanks.' }]);
    await curate.run('w1:t1');
    assert.equal(ledger.allOf(T1).find((each) => each.id === 'b')?.closedWhy, 'merged');
    assert.equal(stories.read('w1:t1', 't1')?.text, 'One line.');
    assert.equal(logs.filter((line) => line.includes('refused')).length, 0);
});

test('a story answer that is not JSON is refused and nothing is stored', async () => {
    const { curate, stories, logs } = setup([{ kind: 'curated', text: 'not json' }]);
    await curate.run('w1:t1');
    assert.ok(logs.includes('curator w1:t1 t1: refused — the answer is not JSON'));
    assert.equal(stories.read('w1:t1', 't1'), null);
});

test('a story answer that is a JSON array is refused and nothing is stored', async () => {
    const { curate, stories, logs } = setup([{ kind: 'curated', text: '[{"a":1}]' }]);
    await curate.run('w1:t1');
    assert.ok(logs.includes('curator w1:t1 t1: refused — the answer is not an object'));
    assert.equal(stories.read('w1:t1', 't1'), null);
});

const settings = { model: '', effort: 'medium' } as const;

test('the curator is a job on a harness: its instructions follow the document', async () => {
    const echo = new CustomHarness('bun -e "process.stdin.pipe(process.stdout)"', process.cwd(), 20_000);
    const written = await new HarnessCurator(echo, settings).write('<curator_input version="1"/>');
    assert.ok(written.kind === 'curated' && written.text.startsWith('<curator_input') && written.text.includes('"op":"close"') && written.text.includes('at most 120 words'));
});

const MERGE_F9 = { op: 'close', id: 'f9', why: 'merged', into: 'f2' };
const MERGE_F1 = { op: 'close', id: 'f1', why: 'merged', into: 'f2' };
const F9_REFUSAL = 'curator w1:t1 t1: refused — f9 is not an open fact (or is already merged)';

test('with repair off, a refused story answer gets no second call and is stored as it was', async () => {
    const { curate, calls, logs, stories } = setup([answer({ ops: [MERGE_F9], story: 'First.' })]);
    await curate.run('w1:t1');
    assert.equal(calls.length, 1);
    assert.ok(logs.includes(F9_REFUSAL));
    assert.equal(logs.filter((line) => line.includes('story repair')).length, 0);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'First.');
});

test('with repair once, a clean merge and a paragraph get no repair call', async () => {
    const { curate, calls, logs, stories } = setup([answer({ ops: [MERGE_F1], story: 'Good.' })], { repair: 'once' });
    await curate.run('w1:t1');
    assert.equal(calls.length, 1);
    assert.equal(logs.filter((line) => line.includes('story repair')).length, 0);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'Good.');
});

test('with repair once, a refused merge is sent back once with the first answer, and the repaired answer is stored', async () => {
    const first = JSON.stringify({ ops: [MERGE_F9], story: 'First.' });
    const { curate, calls, logs, stories } = setup([{ kind: 'curated', text: first }, answer({ ops: [MERGE_F1], story: 'Fixed.' })], { repair: 'once' });
    await curate.run('w1:t1');
    assert.equal(calls.length, 2);
    assert.ok(calls[1]?.startsWith(calls[0] ?? ''), 'the repair call carries the same document first');
    assert.ok(calls[1]?.includes(`<previous-answer>\n${first}\n</previous-answer>`));
    assert.ok(calls[1]?.includes('- f9 is not an open fact (or is already merged)'));
    assert.ok(logs.includes('curator w1:t1 t1: story repair — 1 refused'));
    assert.equal(logs.filter((line) => line.includes('refused —')).length, 0, 'the repaired answer has nothing refused');
    assert.equal(stories.read('w1:t1', 't1')?.text, 'Fixed.');
});

test('with repair once, an answer with no paragraph is sent back once, and a repair that gives none keeps the first answer', async () => {
    const { curate, calls, logs, stories } = setup([answer({ ops: [MERGE_F1] })], { repair: 'once' });
    await curate.run('w1:t1');
    assert.equal(calls.length, 2);
    assert.ok(calls[1]?.includes('- no paragraph'));
    assert.ok(logs.includes('curator w1:t1 t1: story repair — 0 refused'));
    assert.ok(logs.some((line) => line.includes('no paragraph in the answer; the old one stays')));
    assert.equal(stories.read('w1:t1', 't1'), null);
});

test('with repair once, a repair that is not JSON is not stored: the first answer is kept', async () => {
    const { curate, calls, logs, stories } = setup([answer({ ops: [MERGE_F9], story: 'First.' }), { kind: 'curated', text: 'not json' }], { repair: 'once' });
    await curate.run('w1:t1');
    assert.equal(calls.length, 2);
    assert.ok(logs.includes(F9_REFUSAL));
    assert.equal(stories.read('w1:t1', 't1')?.text, 'First.');
});

function words(count: number): string {
    return Array.from({ length: count }, (_, at) => `w${at}`).join(' ');
}

const TOO_LONG_121 = 'curator w1:t1 t1: refused — the paragraph is too long: 121 words, at most 120';

function oldStory(stories: MemoryStories): void {
    stories.keep({ task: T1, at: NOW - 100 * 60_000, language: 'en' }, { story: 'Old.', merges: [] });
}

test('a paragraph of 121 words is refused, logged with its count, and the merge still applies with no repair', async () => {
    const { curate, calls, logs, stories, ledger } = setup([answer({ ops: [MERGE_F1], story: words(121) })]);
    oldStory(stories);
    await curate.run('w1:t1');
    assert.equal(calls.length, 1);
    assert.ok(logs.includes(TOO_LONG_121));
    assert.equal(logs.filter((line) => line.includes('story repair')).length, 0);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'Old.');
    assert.equal(ledger.allOf(T1).find((each) => each.id === 'a')?.closedWhy, 'merged');
});

test('with repair once, a too-long paragraph is sent back once, and the short repair is stored', async () => {
    const { curate, calls, logs, stories } = setup([answer({ ops: [MERGE_F1], story: words(121) }), answer({ ops: [], story: 'Short.' })], { repair: 'once' });
    await curate.run('w1:t1');
    assert.equal(calls.length, 2);
    assert.ok(calls[1]?.includes('- the paragraph is too long: 121 words, at most 120'));
    assert.ok(!calls[1]?.includes('- no paragraph'));
    assert.ok(logs.includes('curator w1:t1 t1: story repair — 1 refused'));
    assert.equal(logs.filter((line) => line.includes('refused —')).length, 0);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'Short.');
});

test('with repair once, a repair still too long is stored as none: the old paragraph stays, with no third call', async () => {
    const { curate, calls, logs, stories } = setup([answer({ ops: [], story: words(121) }), answer({ ops: [], story: words(130) })], { repair: 'once' });
    oldStory(stories);
    await curate.run('w1:t1');
    assert.equal(calls.length, 2);
    assert.ok(logs.includes('curator w1:t1 t1: refused — the paragraph is too long: 130 words, at most 120'));
    assert.ok(logs.some((line) => line.includes('no paragraph in the answer; the old one stays')));
    assert.equal(stories.read('w1:t1', 't1')?.text, 'Old.');
});

test('with repair off, a too-long paragraph gets no second call and the old paragraph stays', async () => {
    const { curate, calls, logs, stories } = setup([answer({ ops: [], story: words(121) })], { repair: 'off' });
    oldStory(stories);
    await curate.run('w1:t1');
    assert.equal(calls.length, 1);
    assert.ok(logs.includes(TOO_LONG_121));
    assert.equal(logs.filter((line) => line.includes('story repair')).length, 0);
    assert.equal(stories.read('w1:t1', 't1')?.text, 'Old.');
});

test('the repair document names a too-long paragraph by its count and does not say no paragraph; a missing paragraph still does', () => {
    const doc = parseText('<doc/>');
    const said = parseText('{}');
    const docText = doc.kind === 'ok' ? doc.value : assert.fail('the document parses');
    const saidText = said.kind === 'ok' ? said.value : assert.fail('the answer parses');
    const tooLong = storyRepair(docText, saidText, { merges: [], story: null, refused: ['the paragraph is too long: 121 words, at most 120'] });
    assert.ok(tooLong.includes('- the paragraph is too long: 121 words, at most 120'));
    assert.ok(!tooLong.includes('- no paragraph'));
    const missing = storyRepair(docText, saidText, { merges: [], story: null, refused: ['f9 is not an open fact (or is already merged)'] });
    assert.ok(missing.includes('- f9 is not an open fact (or is already merged)'));
    assert.ok(missing.includes('- no paragraph'));
});
