// The judge against a scripted model and the real repositories: verdict rows, coverage, read-back, and every way an answer can be unusable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READBACK_QUESTIONS } from '#src/adapters/judge-instructions.ts';
import { RUBRIC_TEXT } from '#src/adapters/rubric.ts';
import { judgeRun, judgeRuns } from '#src/recap/application/judge.ts';
import type { JudgeDeps } from '#src/recap/application/judge.ts';
import type { Judge, JudgeTask, Said } from '#src/ports/judge.ts';
import { unknown } from '#src/ports/unknowable.ts';
import type { StoredRun } from '#src/ports/run-inputs.ts';
import { duration } from '#src/recap/domain/time.ts';
import { cursor, memoryStore } from '#test/db/support.ts';
import { oneTask, withFacts } from '#test/support.ts';

const SECTIONS = { goal: 'Ship retries for the upload client.', now: [], needs: [], done: ['Merged !256 after both pipelines went green.', 'Spent the morning on it.'], decisions: ['Keep three retries because the API limits bursts.'], next: [], links: ['!256'], rules: [] };
const CHECKS = ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7'];
const KEYS = ['t1/goal/0', 't1/done/0', 't1/done/1', 't1/decisions/0', 't1/links/0'];
const SECTION_OF: Readonly<Record<string, string>> = { 't1/goal/0': 'goal', 't1/done/0': 'done', 't1/done/1': 'done', 't1/decisions/0': 'decisions', 't1/links/0': 'links' };

/** Every check passes, except I3 and S-done of "Spent the morning on it." */
const SCORE = JSON.stringify({
    verdicts: KEYS.flatMap((item) => [...CHECKS, `S-${SECTION_OF[item] ?? ''}`].map((check) => {
        const failing = item === 't1/done/1' && (check === 'I3' || check === 'S-done');
        return { item, check, pass: !failing, critique: failing ? 'effort, not a result' : '' };
    })),
    keyfacts: ['!256 is merged', 'Retries stay at three: the API limits bursts', 'The release is tagged'],
    coverage: [{ keyfact: 0, item: 't1/done/0' }, { keyfact: 1, item: 't1/decisions/0' }, { keyfact: 2, item: null }],
});
const ANSWERS = JSON.stringify({ answers: ['Ship retries', '!256 merged', 'not stated', 'not stated', 'The API limits bursts', 'not stated'] });
const GRADES = JSON.stringify({ grades: [1, 2, 3, 4, 5, 6].map((question) => ({ question, pass: question !== 6, critique: question === 6 ? 'the next action is in the input' : '' })) });

type Script = Partial<Record<JudgeTask, string | (() => Said)>>;

function judgeOf(script: Script): { judge: Judge; asked: { task: JudgeTask; document: string }[] } {
    const asked: { task: JudgeTask; document: string }[] = [];
    const judge: Judge = {
        label: 'claude · sonnet · medium',
        ask: (task, document) => {
            asked.push({ task, document });
            const answer = script[task];
            return Promise.resolve(typeof answer === 'function' ? answer() : { kind: 'said', text: answer ?? '', costUsd: 0.01 });
        },
    };
    return { judge, asked };
}

function setup(script: Script, input: string | null = '<recap_input version="1">what the writer saw</recap_input>'): { deps: JudgeDeps; run: StoredRun; store: ReturnType<typeof memoryStore>; asked: { task: JudgeTask; document: string }[] } {
    const store = memoryStore();
    store.records.recordRun({
        tab: 'w1:t1', at: 1000, cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], ...withFacts(oneTask('', SECTIONS)),
        ...(input === null ? {} : { input }),
    });
    const run = store.inputs.runs({ tab: null, since: null, limit: 5, withInput: false }).at(0);
    assert.ok(run !== undefined);
    const { judge, asked } = judgeOf(script);
    return { deps: { judge, inputs: store.inputs, verdicts: store.verdicts, rubric: RUBRIC_TEXT, now: (): number => 5000 }, run, store, asked };
}

test('a sampled run: a verdict per item and check, key facts and coverage, filler, the read-back — all stored with the judge used', async () => {
    const { deps, run, store, asked } = setup({ score: SCORE, readback: ANSWERS, grade: GRADES });
    const result = await judgeRun(deps, run);
    assert.ok(result.kind === 'judged');
    assert.deepEqual(asked.map((call) => call.task), ['score', 'readback', 'grade']);
    const stored = store.verdicts.ofRun(run.id);
    assert.equal(stored.filter((v) => CHECKS.includes(v.check)).length, 5 * 7, 'seven item checks for each of five items');
    assert.equal(stored.filter((v) => v.check.startsWith('S-')).length, 5, 'and the section check of each');
    assert.deepEqual(stored.filter((v) => !v.pass && v.item === 't1/done/1' && v.check !== 'filler').map((v) => [v.check, v.critique]).toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))), [['I3', 'effort, not a result'], ['S-done', 'effort, not a result']]);
    assert.deepEqual(result.coverage, { passed: 2, total: 3 });
    assert.deepEqual(result.filler, { passed: 2, total: 5 }, 'only the merged item and the decision carry a key fact; the goal, the effort item and the link are filler');
    assert.deepEqual(stored.filter((v) => v.check === 'coverage' && !v.pass).map((v) => [v.item, v.critique]), [['keyfact/2', 'The release is tagged']]);
    assert.deepEqual(stored.filter((v) => v.check.startsWith('readback-')).map((v) => [v.check, v.pass, v.item]), [1, 2, 3, 4, 5, 6].map((n) => [`readback-${n}`, n !== 6, null]));
    assert.ok(stored.every((v) => v.judge === 'claude · sonnet · medium' && v.source === 'judge' && v.at === 5000));
    assert.equal(result.costUsd, 0.03);
});

test('what each call sees: scoring gets the rubric, the writer\'s input and the item keys; the read-back sees the recap alone; grading gets the input, key facts and answers', async () => {
    const { deps, run, asked } = setup({ score: SCORE, readback: ANSWERS, grade: GRADES });
    await judgeRun(deps, run);
    const [score, readback, grade] = asked.map((call) => call.document);
    assert.ok(score?.includes('what the writer saw') && score.includes('S-decisions') && score.includes('key="t1/done/1"'));
    assert.ok(readback?.includes('Merged !256') && !readback.includes('what the writer saw') && !readback.includes('S-decisions'), 'the recap alone');
    assert.ok(grade?.includes('what the writer saw') && grade.includes('The release is tagged') && grade.includes('<answer question="5">The API limits bursts'));
    assert.equal(READBACK_QUESTIONS.length, 6);
});

test('an unparsable answer is a run not judged, nothing stored, and the next run is still judged', async () => {
    const { deps, run, store } = setup({ score: 'I think it is fine.' });
    const result = await judgeRun(deps, run);
    assert.deepEqual([result.kind, result.kind === 'not-judged' ? result.why : ''], ['not-judged', 'the answer holds no JSON object']);
    assert.deepEqual(store.verdicts.ofRun(run.id), []);
    const answers = ['nonsense', SCORE];
    const text = (task: JudgeTask): string => ({ score: answers.shift() ?? SCORE, readback: ANSWERS, grade: GRADES })[task];
    const flaky: JudgeDeps = { ...deps, judge: { label: 'x', ask: (task) => Promise.resolve({ kind: 'said', text: text(task), costUsd: 0 }) } };
    const seen: string[] = [];
    const results = await judgeRuns(flaky, [run, run], (each) => { seen.push(each.kind); });
    assert.deepEqual(results.map((each) => each.kind), ['not-judged', 'judged']);
    assert.deepEqual(seen, ['not-judged', 'judged'], 'each result is reported as it is known');
});

test('answers with the wrong shape are not usable: no verdicts, no key facts, items that were never named', async () => {
    for (const bad of ['{"verdicts":[]}', '{"verdicts":[{"item":"t9/x/0","check":"I1","pass":true}],"keyfacts":[],"coverage":[]}', '[1,2]', '{"verdicts":[{"item":"t1/goal/0","check":"I9","pass":true}],"keyfacts":[],"coverage":[]}']) {
        const { deps, run, store } = setup({ score: bad });
        assert.equal((await judgeRun(deps, run)).kind, 'not-judged', bad);
        assert.deepEqual(store.verdicts.ofRun(run.id), [], bad);
    }
});

test('a verdict for an item\'s own section only: S-done on a goal is dropped; the first verdict of a pair wins', async () => {
    const answer = JSON.stringify({
        verdicts: [{ item: 't1/goal/0', check: 'S-done', pass: false, critique: 'wrong section' }, { item: 't1/goal/0', check: 'S-goal', pass: true }, { item: 't1/goal/0', check: 'S-goal', pass: false, critique: 'second' }],
        keyfacts: [], coverage: [],
    });
    const { deps, run, store } = setup({ score: answer, readback: ANSWERS, grade: GRADES });
    await judgeRun(deps, run);
    assert.deepEqual(store.verdicts.ofRun(run.id).filter((v) => v.item === 't1/goal/0' && v.check !== 'filler').map((v) => [v.check, v.pass]), [['S-goal', true]]);
});

test('a run whose input was deleted, one the model cannot be reached for, and an unusable read-back', async () => {
    const gone = setup({ score: SCORE }, null);
    const result = await judgeRun(gone.deps, gone.run);
    assert.deepEqual([result.kind, result.kind === 'not-judged' ? result.why : '', gone.asked.length], ['not-judged', 'its input is no longer stored', 0]);
    const down = setup({ score: () => unknown({ why: 'timeout', after: duration(1000) }) });
    const failed = await judgeRun(down.deps, down.run);
    assert.deepEqual([failed.kind, failed.kind === 'not-judged' ? failed.why : ''], ['not-judged', 'timed out after 1000 ms']);
    const partial = setup({ score: SCORE, readback: '{"answers":["only one"]}' });
    const judged = await judgeRun(partial.deps, partial.run);
    assert.ok(judged.kind === 'judged');
    assert.deepEqual([judged.readback, judged.note], [null, 'read-back: the answer is not six strings']);
    assert.ok(partial.store.verdicts.ofRun(partial.run.id).length > 0 && partial.store.verdicts.ofRun(partial.run.id).every((v) => !v.check.startsWith('readback')), 'the scores are kept');
});
