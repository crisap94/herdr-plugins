import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEval } from '#src/recap/application/eval-run.ts';
import { DEFAULT_SAMPLE } from '#src/recap/application/eval-options.ts';
import type { Judge, JudgeTask } from '#src/ports/judge.ts';
import { ANSWERS, GRADES, optionsOf, rig, scripted, SCORE, seed } from '#test/eval-rig.ts';

test('`eval` with no option judges the newest 20 runs that have a stored input, prints each check\'s pass rate, the failing items with their critique, and each run\'s coverage, no-filler and read-back, and stores the verdicts', async () => {
    const { store, deps, out } = rig();
    seed(store, 3, { input: false, first: 0 });
    seed(store, 25);
    assert.deepEqual(optionsOf(), { mode: 'sample', count: DEFAULT_SAMPLE, tab: null, since: null, json: false, replay: null, kind: null, compareImported: null, pipeline: null, check: null, prune: false });
    assert.equal(await runEval(optionsOf(), deps), 0);
    const report = out.join('\n');
    assert.match(report, /judge claude · sonnet · medium — 20 runs sampled, 20 judged/);
    assert.match(report, /3 runs in the period no longer have a stored input/);
    assert.match(report, /I3 +specific +67% +40\/60/, 'one item of three fails I3 in each of the 20 runs');
    assert.match(report, /failing items \(20\)/);
    assert.match(report, /I1 +atomic +100% +60\/60/);
    assert.match(report, /coverage +key facts carried +100% +20\/20/);
    assert.match(report, /I3 {2}t1\/done\/1 {2}"Worked on it\." — names nothing concrete/);
    assert.equal((report.match(/coverage 100% \(1\/1\) \[added 0% \(0\/1\)\] · no-filler \d+% \(1\/\d+\) \[added 0% \(0\/3\)\] · read-back 6\/6/g) ?? []).length, 20, 'every run reports its state numbers with the added ones beside them');
    assert.match(report, /coverage 100% \(20\/20\) \[added 0% \(0\/20\)\]/, 'and the totals line adds them up');
    assert.match(report, /judge vs anchor \(0\)/);
    assert.equal(store.inputs.runs({ tab: null, since: null, limit: 100, withInput: true }).filter((run) => store.verdicts.ofRun(run.id).length > 0).length, 20);
});

test('`eval --sample 2 --tab` and `--since` narrow the runs; `--json` prints the report as JSON', async () => {
    const { store, deps, out } = rig();
    seed(store, 3, { tab: 'w1:t1' });
    seed(store, 3, { tab: 'w1:t2', first: 10 });
    assert.equal(await runEval(optionsOf('--sample', '2', '--tab', 'w1:t2', '--json'), deps), 0);
    const json = JSON.parse(out.join('')) as { runs: { run: { tab: string } }[]; rates: unknown[] };
    assert.deepEqual(json.runs.map((line) => line.run.tab), ['w1:t2', 'w1:t2']);
    out.length = 0;
    await runEval(optionsOf('--since', '5'), deps);
    assert.match(out.join('\n'), /3 runs sampled/, 'the older tab is out of the period');
});

test('no judge: eval says so, exits 1 and stores nothing', async () => {
    const { store, deps, err } = rig({ judge: null });
    seed(store, 2);
    assert.equal(await runEval(optionsOf(), deps), 1);
    assert.match(err.join('\n'), /no harness is available for the judge job/);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM verdict').get()?.['n'], 0);
});

test('an unparsable answer is a run reported as not judged and the eval goes on; when every run fails the exit is 1', async () => {
    const answers = ['garbage', SCORE];
    const text = (task: JudgeTask): string => {
        const rest: Readonly<Record<JudgeTask, string>> = { score: '', readback: ANSWERS, grade: GRADES, cover: '' };
        return task === 'score' ? (answers.shift() ?? SCORE) : rest[task];
    };
    const flaky: Judge = { label: 'x', ask: (task) => Promise.resolve({ kind: 'said', text: text(task), costUsd: 0 }) };
    const { store, deps, out } = rig({ judge: flaky });
    seed(store, 2);
    assert.equal(await runEval(optionsOf(), deps), 0);
    assert.match(out.join('\n'), /not judged: the answer holds no JSON object/);
    assert.match(out.join('\n'), /2 runs sampled, 1 judged/);
    const bad = rig({ judge: scripted({ score: 'nope', readback: '', grade: '' }) });
    seed(bad.store, 2);
    assert.equal(await runEval(optionsOf(), bad.deps), 1);
});
