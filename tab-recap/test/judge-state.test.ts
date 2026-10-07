// The ruler: coverage, no-filler and the read-back are judged over the ledger's state after a run, the item checks over what the run added.
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC_TEXT } from '#src/adapters/rubric.ts';
import { reportOf } from '#src/recap/application/eval-report.ts';
import { judgeRun } from '#src/recap/application/judge.ts';
import type { JudgeDeps } from '#src/recap/application/judge.ts';
import type { Judge, JudgeTask } from '#src/ports/judge.ts';
import type { StoredRun } from '#src/ports/run-inputs.ts';
import type { Operation, TaskOps } from '#src/recap/domain/ops.ts';
import { reportLines } from '#src/recap/render/eval.ts';
import { plain } from '#src/recap/render/wrap.ts';
import { cursor, memoryStore } from '#test/db/support.ts';
import { oneTask } from '#test/support.ts';

const add = (section: 'done' | 'next', text: string): Operation => ({ op: 'add', section, text, why: null, ref: null, at: null, agent: null });
const TAB = { tab: 'w1:t1', key: 't1' };

/** Three runs: A and B; then C, with B closed; then D. The state after the third is A, C and D. */
function history(): { store: ReturnType<typeof memoryStore>; runs: readonly StoredRun[] } {
    const store = memoryStore();
    const record = (at: number, ops: (ids: Record<string, string>) => readonly Operation[]): void => {
        const ids = Object.fromEntries(store.ledger.openOf(TAB).map((fact) => [fact.text, fact.id]));
        const tasks: readonly TaskOps[] = [{ task: 't1', ops: ops(ids) }];
        store.records.recordRun({ tab: 'w1:t1', at, cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], tasks: oneTask(''), ops: tasks, input: `<recap_input version="2">run at ${at}</recap_input>` });
    };
    record(1000, () => [add('done', 'Merged !256.'), add('next', 'Tag the release.')]);
    record(2000, (ids) => [add('done', 'Tagged 1.9.0.'), { op: 'close', id: ids['Tag the release.'] ?? '', why: 'done' }]);
    record(3000, () => [add('next', 'Announce 1.9.0.')]);
    return { store, runs: store.inputs.runs({ tab: null, since: null, limit: 10, withInput: true }).toReversed() };
}

test('the state after a run: a fact born earlier and still open is in it, one closed by or before the run is not; the added view holds only what the run created', () => {
    const { store, runs } = history();
    const [first, second, third] = runs;
    assert.ok(first !== undefined && second !== undefined && third !== undefined);
    const view = (run: StoredRun, mode: 'state' | 'added'): string[] => store.inputs.itemsOf(run.id, mode).map((item) => `${item.key} ${item.born ? '+' : '='} ${item.text}`);
    assert.deepEqual(view(first, 'state'), ['state/t1/done/0 + Merged !256.', 'state/t1/next/0 + Tag the release.']);
    assert.deepEqual(view(second, 'state'), ['state/t1/done/0 = Merged !256.', 'state/t1/done/1 + Tagged 1.9.0.'], 'the next fact closed by this run is gone');
    assert.deepEqual(view(third, 'state'), ['state/t1/done/0 = Merged !256.', 'state/t1/done/1 = Tagged 1.9.0.', 'state/t1/next/0 + Announce 1.9.0.']);
    assert.deepEqual(view(third, 'added'), ['t1/next/0 + Announce 1.9.0.'], 'the added keys are not prefixed and count within the run');
    assert.deepEqual(view(second, 'added'), ['t1/done/0 + Tagged 1.9.0.']);
    const [merged] = store.inputs.itemsOf(first.id, 'state');
    const [again] = store.inputs.itemsOf(third.id, 'state');
    assert.equal(merged?.fact, again?.fact, 'the same fact has the same identity in every state');
    assert.deepEqual(store.inputs.itemsOf('run_nonsense', 'state'), []);
});

const SCORE = JSON.stringify({
    verdicts: [{ item: 't1/next/0', check: 'I1', pass: true }, { item: 'state/t1/done/0', check: 'I1', pass: false, critique: 'a state key is not an added item' }],
    keyfacts: ['!256 is merged', 'The release is announced', 'A rollback plan exists'],
    coverage: [{ keyfact: 0, item: 'state/t1/done/0' }, { keyfact: 1, item: 'state/t1/next/0' }, { keyfact: 2, item: 't1/next/0' }],
});
const ANSWERS = JSON.stringify({ answers: ['a', 'b', 'c', 'd', 'e', 'f'] });
const GRADES = JSON.stringify({ grades: [1, 2, 3, 4, 5, 6].map((question) => ({ question, pass: question <= 4, critique: question <= 4 ? '' : 'missing' })) });

test('judging the third run: coverage and no-filler over the state (an older fact carries a key fact), the same numbers over what the run added, the read-back from the state', async () => {
    const { store, runs } = history();
    const run = runs[2];
    assert.ok(run !== undefined);
    const seen: { task: JudgeTask; document: string }[] = [];
    const script: Readonly<Record<string, string>> = { score: SCORE, readback: ANSWERS, grade: GRADES };
    const judge: Judge = { label: 'fake', ask: (task, document) => { seen.push({ task, document }); return Promise.resolve({ kind: 'said', text: script[task] ?? '', costUsd: 0 }); } };
    const deps: JudgeDeps = { judge, inputs: store.inputs, verdicts: store.verdicts, rubric: RUBRIC_TEXT, now: (): number => 9000 };
    const result = await judgeRun(deps, run);
    assert.ok(result.kind === 'judged');
    assert.deepEqual(result.coverage, { passed: 2, total: 3 }, 'a key fact an earlier run added is carried; one named by an added key, which is not in the state, is not');
    assert.deepEqual(result.filler, { passed: 2, total: 3 });
    assert.deepEqual(result.added, { coverage: { passed: 1, total: 3 }, filler: { passed: 1, total: 1 } }, 'only the announcement was born in this run');
    assert.equal(result.stateSize, 3);
    const rows = store.verdicts.ofRun(run.id);
    assert.deepEqual(rows.filter((row) => row.check === 'filler').map((row) => [row.item, row.pass]), [['state/t1/done/0', true], ['state/t1/done/1', false], ['state/t1/next/0', true]], 'state rows are keyed state/…');
    assert.deepEqual(rows.filter((row) => row.check === 'I1').map((row) => [row.item, row.pass]), [['t1/next/0', true]], 'a verdict about a state key is not an item check');
    const [score, readback] = seen.map((call) => call.document);
    assert.ok(score?.includes('<state>') && score.includes('key="state/t1/done/0"') && score.includes('<recap>') && score.includes('key="t1/next/0"'));
    assert.ok(readback?.includes('Merged !256.') && readback.includes('Tagged 1.9.0.') && !readback.includes('Tag the release.'), 'the read-back sees the open ledger, not the closed fact');
});

test('judge vs anchor: a fact whose quote is in the input and that the judge calls unsupported is listed; an unanchored one is only a failing item', async () => {
    const store = memoryStore();
    const anchored: Operation = { op: 'add', section: 'done', text: 'Merged !256.', why: null, ref: null, at: null, agent: null, anchor: 'merge !256' };
    store.records.recordRun({ tab: 'w1:t1', at: 1000, cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], tasks: oneTask(''), ops: [{ task: 't1', ops: [anchored, add('done', 'Tagged 1.9.0.')] }], input: '<recap_input version="2">merge !256</recap_input>' });
    const run = store.inputs.runs({ tab: null, since: null, limit: 5, withInput: true })[0];
    assert.ok(run !== undefined);
    const score = JSON.stringify({
        verdicts: [{ item: 't1/done/0', check: 'I4', pass: false, critique: 'the input never says it was merged' }, { item: 't1/done/1', check: 'I4', pass: false, critique: 'no source' }, { item: 't1/done/1', check: 'I3', pass: false, critique: 'vague' }],
        keyfacts: ['!256 is merged'], coverage: [{ keyfact: 0, item: 'state/t1/done/0' }],
    });
    const judge: Judge = { label: 'fake', ask: (task) => Promise.resolve({ kind: 'said', text: ({ score, readback: ANSWERS, grade: GRADES, cover: '' })[task], costUsd: 0 }) };
    const result = await judgeRun({ judge, inputs: store.inputs, verdicts: store.verdicts, rubric: RUBRIC_TEXT, now: (): number => 9000 }, run);
    const report = reportOf('fake', [result]);
    assert.deepEqual(report.judgeVsAnchor.map((each) => [each.key, each.check, each.text]), [['t1/done/0', 'I4', 'Merged !256.']]);
    assert.deepEqual(report.failures.map((each) => each.key), ['t1/done/0', 't1/done/1', 't1/done/1'], 'all three are failing items');
    assert.match(reportLines(report, plain, 0).join('\n'), /judge vs anchor \(1\)[^\n]*\n[^\n]*t1\/done\/0 {2}"Merged !256\."/);
});

test('golden: the report of the third run shows the state numbers with the added ones beside them, the totals and the judge-vs-anchor section', async () => {
    const { store, runs } = history();
    const run = runs[2];
    assert.ok(run !== undefined);
    const script: Readonly<Record<string, string>> = { score: SCORE, readback: ANSWERS, grade: GRADES };
    const judge: Judge = { label: 'fake', ask: (task) => Promise.resolve({ kind: 'said', text: script[task] ?? '', costUsd: 0 }) };
    const result = await judgeRun({ judge, inputs: store.inputs, verdicts: store.verdicts, rubric: RUBRIC_TEXT, now: (): number => 9000 }, run);
    const text = reportLines(reportOf('fake', [result]), plain, 0).join('\n').replace(/run_…[0-9a-z]{6}/g, 'run_…XXXXXX');
    assert.equal(`${text}\n`, readFileSync(new URL('fixtures/eval-report-state.txt', import.meta.url), 'utf8'));
});
