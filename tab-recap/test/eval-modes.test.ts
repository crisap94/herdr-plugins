// `tab-recap eval` --label, --agree and --gates, over the real repositories and a scripted judge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEval } from '#src/recap/application/eval-run.ts';
import type { Judge } from '#src/ports/judge.ts';
import type { Verdict } from '#src/ports/verdicts.ts';
import { optionsOf, rig, seed } from '#test/eval-rig.ts';

test('`--label 3` shows the newest unlabelled items, asks again until it understands, stores one operator verdict per check, and never asks about a labelled item twice', async () => {
    const { store, deps, out, err, asked } = rig({ lines: ['maybe', 'ok', 'fail I3 done', 'too vague', 'fail S-nonsense', 'quit'] });
    seed(store, 1);
    assert.equal(await runEval(optionsOf('--label', '3'), deps), 0);
    assert.match(out.join('\n'), /1\/3 {2}w1:t1 .* t1\/goal\/0\n"Ship retries 0"/);
    assert.match(err.join('\n'), /answer ok, fail \[checks\], skip or quit/);
    assert.match(err.join('\n'), /S-NONSENSE is not a check of this item/i);
    const [run] = store.inputs.runs({ tab: null, since: null, limit: 1, withInput: false });
    assert.ok(run !== undefined);
    const mine = store.verdicts.ofRun(run.id).filter((v) => v.source === 'operator');
    assert.equal(mine.length, 16, 'eight checks for each of the two answered items');
    assert.deepEqual(mine.filter((v) => !v.pass).map((v) => [v.item, v.check, v.critique]), [['t1/done/0', 'I3', 'too vague'], ['t1/done/0', 'S-done', 'too vague']]);
    assert.ok(mine.every((v) => v.judge === 'operator'));
    assert.equal(asked.filter((prompt) => prompt.startsWith('why')).length, 1, 'a reason only for a failure');
    out.length = 0;
    assert.equal(await runEval(optionsOf('--label', '3'), { ...deps, ask: () => Promise.resolve('quit') }), 0);
    assert.doesNotMatch(out.join('\n'), /t1\/goal\/0|t1\/done\/0/, 'the labelled items are not offered again');
    assert.match(out.join('\n'), /t1\/done\/1/);
});

test('`--label` with the input ended stops cleanly; `skip` stores nothing', async () => {
    const { store, deps, out } = rig({ lines: ['skip'] });
    seed(store, 1);
    assert.equal(await runEval(optionsOf('--label', '2'), deps), 0);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM verdict').get()?.['n'], 0);
    assert.match(out.join('\n'), /1 of 2 items answered/);
    assert.equal(await runEval(optionsOf('--label', '2'), rig().deps), 0, 'nothing to label is not an error');
});

test('`--agree`: 50 items with both verdicts for I3 and 44 agreeing print 88 % and kappa 0.76 beside the 0.6 bar, with false passes, false fails and the newest items they disagree on', async () => {
    const { store, deps, out } = rig();
    seed(store, 1);
    const [run] = store.inputs.runs({ tab: null, since: null, limit: 1, withInput: false });
    assert.ok(run !== undefined);
    const both = (n: number, judge: boolean, operator: boolean): Verdict[] => [
        { run: run.id, item: `t1/x/${n}`, check: 'I3', pass: judge, critique: null, judge: 'j', at: 1, source: 'judge' },
        { run: run.id, item: `t1/x/${n}`, check: 'I3', pass: operator, critique: null, judge: 'operator', at: 2, source: 'operator' },
    ];
    const judged = (n: number): Verdict[] => {
        if (n < 44) {
            return both(n, n % 2 === 0, n % 2 === 0);
        }
        return n < 47 ? both(n, true, false) : both(n, false, true);
    };
    store.verdicts.add(Array.from({ length: 50 }, (_, n) => judged(n)).flat());
    assert.equal(await runEval(optionsOf('--agree'), deps), 0);
    assert.match(out.join('\n'), /I3 +88% +kappa 0\.76 +bar 0\.6 +44\/50 agree +3 false passes +3 false fails/);
    assert.match(out.join('\n'), /I3: where they disagree \(newest first\)\n {2}"t1\/x\/49" — judge fail, operator pass\n {2}"t1\/x\/48" — judge fail, operator pass\n {2}"t1\/x\/47" — judge fail, operator pass/);
    out.length = 0;
    await runEval(optionsOf('--agree', '--json'), deps);
    const [row] = JSON.parse(out.join('')) as { worst: { item: string }[] }[];
    assert.deepEqual({ ...row, worst: row?.worst.map((each) => each.item) }, { check: 'I3', items: 50, agreed: 44, percent: 88, falsePasses: 3, falseFails: 3, kappa: 0.76, worst: ['t1/x/49', 't1/x/48', 't1/x/47'] });
    const empty = rig();
    await runEval(optionsOf('--agree'), empty.deps);
    assert.match(empty.out.join('\n'), /no item has both/);
});

test('`--gates --since 7` prints the counts of the last seven days of runs per gate, with no model call', async () => {
    const calls: string[] = [];
    const { store, deps, out } = rig({ judge: { label: 'x', ask: (task): ReturnType<Judge['ask']> => { calls.push(task); return Promise.resolve({ kind: 'said', text: '', costUsd: 0 }); } } });
    seed(store, 2, { gate: true, first: 2 });
    seed(store, 4, { gate: true, first: 30 });
    seed(store, 1, { first: 1 });
    assert.equal(await runEval(optionsOf('--gates', '--since', '7'), deps), 0);
    assert.match(out.join('\n'), /gates over 2 runs\nG1 +2 refused +0 flagged\nG8 +0 refused +4 flagged\n0 items dropped after the retry/);
    out.length = 0;
    await runEval(optionsOf('--gates'), deps);
    assert.match(out.join('\n'), /gates over 6 runs/);
    assert.deepEqual(calls, []);
});
