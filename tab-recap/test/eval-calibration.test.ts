import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HarnessJudge } from '#src/adapters/harness-judge.ts';
import { judgeInstructions, JUDGE_INSTRUCTIONS } from '#src/adapters/judge-instructions.ts';
import { agreementOf, kappaOf, trusted } from '#src/recap/application/eval-stats.ts';
import { ANCHORS_PER_CHECK, anchorsOf, withText } from '#src/recap/application/judge-anchors.ts';
import { runEval } from '#src/recap/application/eval-run.ts';
import { parseEval } from '#src/recap/application/eval-options.ts';
import type { Harness } from '#src/ports/harness.ts';
import type { Pair, Verdict } from '#src/ports/verdicts.ts';
import { optionsOf, rig, seed } from '#test/eval-rig.ts';

const pairs = (judge: number, operator: number, both: number, neither: number): readonly Pair[] => [
    ...Array.from({ length: judge }, () => ({ check: 'I5', judge: true, operator: false })),
    ...Array.from({ length: operator }, () => ({ check: 'I5', judge: false, operator: true })),
    ...Array.from({ length: both }, () => ({ check: 'I5', judge: true, operator: true })),
    ...Array.from({ length: neither }, () => ({ check: 'I5', judge: false, operator: false })),
];

test('Cohen\'s kappa: perfect agreement is 1, chance level is 0, worse than chance is negative, and a check nobody ever fails has none', () => {
    assert.equal(kappaOf(pairs(0, 0, 10, 10)), 1);
    assert.equal(kappaOf(pairs(5, 5, 5, 5)), 0);
    assert.equal(kappaOf(pairs(8, 8, 2, 2)), -0.6);
    assert.equal(kappaOf(pairs(0, 0, 20, 0)), null, 'both always say pass: chance explains it');
    assert.equal(kappaOf([]), null);
    assert.equal(kappaOf(pairs(10, 0, 80, 10)), 0.62, '90 % agree with a skew: observed 0.9, chance 0.74');
    assert.equal(kappaOf(pairs(8, 2, 85, 5)), 0.45, '90 % agree and still under the bar, because the judge passes almost everything');
});

test('the bar is 0.6: a check at 0.62 is trusted, one at 0.45 is not, and one with no kappa does not claim to be', () => {
    const [good, weak, none] = [kappaOf(pairs(10, 0, 80, 10)), kappaOf(pairs(8, 2, 85, 5)), kappaOf(pairs(0, 0, 20, 0))].map((kappa) => trusted({ kappa }));
    assert.deepEqual([good, weak, none], [true, false, false]);
    const [row] = agreementOf(pairs(8, 2, 85, 5));
    assert.deepEqual([row?.percent, row?.kappa, row ? trusted(row) : null], [90, 0.45, false]);
});

function seeded(count: number): ReturnType<typeof rig> {
    const found = rig();
    seed(found.store, 1);
    const [run] = found.store.inputs.runs({ tab: null, since: null, limit: 1, withInput: false });
    assert.ok(run !== undefined);
    const verdicts: Verdict[] = Array.from({ length: count + 1 }, (_, n) => [
        { run: run.id, item: n === count ? 't1/done/1' : `t1/x/${n}`, check: 'I5', pass: true, critique: null, judge: 'j', at: 10 + n, source: 'judge' as const },
        { run: run.id, item: n === count ? 't1/done/1' : `t1/x/${n}`, check: 'I5', pass: false, critique: n === count ? 'effort, not work' : `reason ${n}`, judge: 'operator', at: 20 + n, source: 'operator' as const },
    ]).flat();
    found.store.verdicts.add(verdicts);
    return found;
}

test('where the operator overruled the judge on I5, the judge\'s next instructions for I5 carry the item and the operator\'s reasons, newest first, at most five', () => {
    const { store } = seeded(7);
    const anchors = anchorsOf(withText(store.verdicts.disagreements(), store.inputs));
    assert.equal(anchors.get('I5')?.length, ANCHORS_PER_CHECK);
    const rules = judgeInstructions('score', anchors);
    assert.ok(rules.startsWith(JUDGE_INSTRUCTIONS.score));
    assert.match(rules, /I5:\n- "Worked on it\." — the operator ruled FAIL: effort, not work\n- "t1\/x\/6" — .*reason 6\n- .*reason 5\n- .*reason 4\n- .*reason 3$/);
    assert.ok(!rules.includes('reason 2'), 'only the newest five');
    assert.equal(judgeInstructions('readback', anchors), JUDGE_INSTRUCTIONS.readback, 'only the scoring carries checks');
    assert.equal(judgeInstructions('score'), JUDGE_INSTRUCTIONS.score, 'no corrections, no section');
});

test('a judge built with anchors hands them to the harness with its scoring call only', async () => {
    const { store } = seeded(3);
    const calls: string[] = [];
    const harness = { id: 'fake', limit: null, label: () => 'fake', run: (call: { instructions: string }) => { calls.push(call.instructions); return Promise.resolve({ kind: 'ran', text: '{}', costUsd: 0 }); } } as unknown as Harness;
    const judge = new HarnessJudge(harness, { model: '', effort: 'default' }, anchorsOf(withText(store.verdicts.disagreements(), store.inputs)));
    await judge.ask('score', '<x/>');
    await judge.ask('grade', '<x/>');
    assert.match(calls[0] ?? '', /I5:\n- "Worked on it\."/);
    assert.doesNotMatch(calls[1] ?? '', /operator ruled/);
});

test('`--label 2 --check I5` asks about the one check only, stores one operator verdict per item, and offers items already labelled on other checks', async () => {
    const { store, deps, asked, out } = rig({ lines: ['ok', 'fail', 'too vague', 'quit'] });
    seed(store, 1);
    const [run] = store.inputs.runs({ tab: null, since: null, limit: 1, withInput: false });
    assert.ok(run !== undefined);
    store.verdicts.add([{ run: run.id, item: 't1/goal/0', check: 'I3', pass: true, critique: null, judge: 'operator', at: 1, source: 'operator' }]);
    assert.equal(await runEval(optionsOf('--label', '2', '--check', 'I5'), deps), 0);
    assert.match(out.join('\n'), /t1\/goal\/0/, 'labelled on I3 only: still asked about I5');
    assert.deepEqual(asked.filter((prompt) => prompt.includes('ok /')), ['I5: ok / fail / skip / quit > ', 'I5: ok / fail / skip / quit > ']);
    const mine = store.verdicts.ofRun(run.id).filter((v) => v.source === 'operator' && v.check === 'I5');
    assert.deepEqual(mine.map((v) => [v.item, v.pass, v.critique]), [['t1/goal/0', true, null], ['t1/done/0', false, 'too vague']]);
    assert.equal(store.verdicts.ofRun(run.id).filter((v) => v.source === 'operator').length, 3, 'nothing else was labelled');
    assert.deepEqual([...store.verdicts.labelled('I5')].toSorted(), [`${run.id}|t1/done/0`, `${run.id}|t1/goal/0`]);
});

test('`--check S-done` asks only about items of that section, and another check named is asked again', async () => {
    const { store, deps, out, err } = rig({ lines: ['fail I1', 'ok', 'quit'] });
    seed(store, 1);
    assert.equal(await runEval(optionsOf('--label', '5', '--check', 'S-done'), deps), 0);
    assert.doesNotMatch(out.join('\n'), /t1\/goal\/0/);
    assert.match(out.join('\n'), /t1\/done\/0/);
    assert.match(err.join('\n'), /I1 is not a check of this item \(S-done\)/);
});

const why = (...argv: string[]): string => {
    const parsed = parseEval(argv);
    return parsed.kind === 'usage' ? parsed.why : '';
};

test('the option: --check goes with --label and names I1…I7 or S-<section>; --pipeline goes with --replay', () => {
    assert.equal(optionsOf('--label', '3', '--check', 'I5').check, 'I5');
    assert.equal(optionsOf('--label', '3', '--check', 'S-done').check, 'S-done');
    assert.match(why('--check', 'I5'), /--check goes with --label/);
    assert.match(why('--label', '3', '--check', 'I9'), /--check takes I1…I7 or S-<section>/);
    assert.match(why('--label', '3', '--check', 'S-mood'), /--check takes/);
    assert.match(why('--replay', 'x', '--check', 'I5'), /--replay excludes --check/);
    assert.equal(optionsOf('--replay', 'x', '--pipeline', 'one').pipeline, 'one');
    assert.match(why('--replay', 'x', '--pipeline', 'two'), /--pipeline takes one, enumerate, enumerate\+gates, full/);
    assert.match(why('--pipeline', 'one'), /go with --replay/);
});
