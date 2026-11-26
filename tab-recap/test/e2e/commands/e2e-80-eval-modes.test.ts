import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { instant, textOf, usdOf } from '@stateforge-labs/session-ledger';
import type { Operation } from '@stateforge-labs/session-ledger';
import { cursor, recordOps, runsOf, storeRead, verdictOf } from '#test/db/support.ts';
import { tabIdOf } from '#src/recap/domain/ids.ts';
import { tabId } from '#test/support/ids.ts';
import { oneTask } from '#test/support.ts';
import type { VerdictRecord } from '#src/ports/verdicts.ts';
import { evalWorld, judgingWorld, type EvalWorld } from '../support/eval-world.ts';

const USAGE = /USAGE: tab-recap eval \[--sample <n>\]/;
const add = (section: 'done' | 'next', text: string, anchor?: string): Operation => ({ op: 'add', section, text: textOf(text), why: null, ref: null, at: null, agent: null, ...(anchor === undefined ? {} : { anchor: textOf(anchor) }) });
const verdictCount = (world: EvalWorld, where = '1 = 1'): number => Number(world.sql(`SELECT COUNT(*) AS n FROM verdict WHERE ${where}`)[0]?.['n']);

const labelled = (): EvalWorld => {
    const world = judgingWorld();
    world.seed(1);
    return world;
};
const operatorRows = (world: EvalWorld): readonly (readonly unknown[])[] => world.sql("SELECT item_key, check_id, pass, critique, judge FROM verdict WHERE source = 'operator' ORDER BY item_key, check_id").map((row) => [row['item_key'], row['check_id'], row['pass'], row['critique'], row['judge']]);

describe('the options are checked before anything runs', () => {
    test('conflicting and malformed options print the usage on stderr and exit 2', { timeout: 30_000 }, async () => {
        const world = evalWorld({ judge: 'none' });
        try {
            for (const args of [['--label', '10', '--agree'], ['--gates', '--sample', '5'], ['--agree', '--gates'], ['--frobnicate'], ['--sample', 'many'], ['--since', '0'], ['extra']]) {
                const ran = await world.run(['eval', ...args]);
                assert.equal(ran.code, 2, args.join(' '));
                assert.match(ran.stderr, USAGE);
                assert.equal(ran.stdout, '');
            }
        } finally {
            world.close();
        }
    });

    test('--check goes with --label and names I1 to I7 or a section; --pipeline goes with --replay', { timeout: 30_000 }, async () => {
        const world = evalWorld({ judge: 'none' });
        try {
            const cases: readonly (readonly [readonly string[], RegExp])[] = [
                [['--check', 'I5'], /--check goes with --label/],
                [['--label', '3', '--check', 'I9'], /--check takes I1…I7 or S-<section>/],
                [['--label', '3', '--check', 'S-mood'], /--check takes/],
                [['--replay', 'x', '--check', 'I5'], /--replay excludes --check/],
                [['--replay', 'x', '--pipeline', 'two'], /--pipeline takes one, enumerate, enumerate\+gates, full/],
                [['--pipeline', 'one'], /go with --replay/],
            ];
            for (const [args, why] of cases) {
                const ran = await world.run(['eval', ...args]);
                assert.equal(ran.code, 2, args.join(' '));
                assert.match(ran.stderr, why);
            }
        } finally {
            world.close();
        }
    });

    test('with no harness for the judge, eval says so on stderr, exits 1 and stores no verdict', { timeout: 30_000 }, async () => {
        const world = evalWorld({ judge: 'none' });
        try {
            world.seed(2);
            const ran = await world.run(['eval']);
            assert.equal(ran.code, 1, ran.stderr);
            assert.match(ran.stderr, /no harness is available for the judge job/);
            assert.equal(verdictCount(world), 0);
        } finally {
            world.close();
        }
    });
});

describe('eval with no option judges the newest runs that kept their input', () => {
    let world: EvalWorld;
    let report = '';

    before(() => {
        world = judgingWorld();
        world.seed(3, { tab: 'w1:t2', daysAgo: 10 });
        world.seed(25, { daysAgo: 1 });
        world.seed(3, { input: false, daysAgo: 0 });
    });

    after(() => {
        world.close();
    });

    test('it prints the judge, the runs sampled and judged, and the runs whose input is gone', { timeout: 60_000 }, async () => {
        const ran = await world.run(['eval']);
        assert.equal(ran.code, 0, ran.stderr);
        report = ran.stdout;
        assert.match(report, /judge custom · default · medium — 20 runs sampled, 20 judged/);
        assert.match(report, /3 runs in the period no longer have a stored input/);
    });

    test('it prints each check\'s pass rate, the failing items with their critique and the coverage', () => {
        assert.match(report, /I1 +atomic +100% +60\/60/);
        assert.match(report, /I3 +specific +67% +40\/60/);
        assert.match(report, /failing items \(20\)/);
        assert.match(report, /I3 {2}t1\/done\/1 {2}"Worked on it\." — names nothing concrete/);
        assert.match(report, /coverage +key facts carried +100% +20\/20/);
        assert.match(report, /readback-6 +read-back question 6 +100% +20\/20/);
        assert.match(report, /judge vs anchor \(0\)/);
    });

    test('every run reports its state numbers with the added ones beside them, and the totals add them up', () => {
        const lines = report.match(/^run_…\S+ +w1:t1 .* coverage \d+% \(\d+\/\d+\) \[added \d+% \(\d+\/\d+\)\] · no-filler \d+% \(\d+\/\d+\) \[added \d+% \(\d+\/\d+\)\] · read-back 6\/6$/gm) ?? [];
        assert.equal(lines.length, 20);
        assert.match(report, /coverage 100% \(20\/20\) \[added 0% \(0\/20\)\]/);
    });

    test('the verdicts of exactly those 20 runs are in the store, each with the judge that gave it', () => {
        assert.equal(Number(world.sql('SELECT COUNT(DISTINCT run_id) AS n FROM verdict')[0]?.['n']), 20);
        assert.deepEqual(world.sql("SELECT DISTINCT judge, source FROM verdict").map((row) => [row['judge'], row['source']]), [['custom · default · medium', 'judge']]);
        assert.equal(world.asked().length, 60);
    });

    test('a judged run holds a verdict for each item and check, the key-fact rows and the read-back answers', () => {
        const checks = world.withStore((store) => {
            const first = store.db.prepare('SELECT run_id FROM verdict ORDER BY at LIMIT 1').get();
            return store.db.prepare('SELECT item_key, check_id FROM verdict WHERE run_id = ?').all(first?.['run_id'] as Uint8Array).map((row) => `${String(row['item_key'])}:${String(row['check_id'])}`);
        });
        const items = ['t1/goal/0', 't1/done/0', 't1/done/1'];
        for (const item of items) {
            for (const check of ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7']) {
                assert.ok(checks.includes(`${item}:${check}`), `${item} ${check}`);
            }
        }
        assert.ok(checks.includes('t1/goal/0:S-goal') && checks.includes('t1/done/0:S-done') && checks.includes('t1/done/1:S-done'));
        for (const check of ['coverage', 'readback-1', 'readback-6']) {
            assert.ok(checks.some((entry) => entry.endsWith(`:${check}`)), check);
        }
    });

    test('each call sees only what it needs: scoring the rubric, the input and the item keys; the read-back the recap alone; grading the input and the answers', () => {
        const [score, readback, grade] = [world.seen('score'), world.seen('readback'), world.seen('grade')];
        assert.ok(score.includes('<rubric>') && score.includes('<writer_input>') && score.includes('S-done') && score.includes('key="t1/done/1"'));
        assert.ok(readback.includes('Merged !256.') && !readback.includes('<writer_input>') && !readback.includes('S-done'));
        assert.ok(grade.includes('<writer_input>') && grade.includes('!256 is merged') && grade.includes('<answer question="5">e'));
    });

    test('--tab, --sample and --json narrow the runs and print the report as JSON', { timeout: 60_000 }, async () => {
        const ran = await world.run(['eval', '--sample', '2', '--tab', 'w1:t2', '--json']);
        assert.equal(ran.code, 0, ran.stderr);
        const json = JSON.parse(ran.stdout) as { runs: { run: { tab: string } }[] };
        assert.deepEqual(json.runs.map((line) => line.run.tab), ['w1:t2', 'w1:t2']);
    });

    test('--since leaves out the runs older than the period', { timeout: 60_000 }, async () => {
        const ran = await world.run(['eval', '--since', '5', '--sample', '50']);
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /25 runs sampled/);
        assert.doesNotMatch(ran.stdout, /w1:t2/);
    });
});

describe('an answer the judge cannot use', () => {
    test('a run whose answer holds no JSON is reported as not judged and the eval goes on', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.seed(2);
            world.answer('score.1', 'garbage');
            const ran = await world.run(['eval']);
            assert.equal(ran.code, 0, ran.stderr);
            assert.match(ran.stdout, /not judged: the answer holds no JSON object/);
            assert.match(ran.stdout, /2 runs sampled, 1 judged/);
            assert.equal(Number(world.sql('SELECT COUNT(DISTINCT run_id) AS n FROM verdict')[0]?.['n']), 1);
        } finally {
            world.close();
        }
    });

    test('when every run fails the exit is 1 and nothing is stored', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.seed(2);
            world.answer('score', 'nope');
            const ran = await world.run(['eval']);
            assert.equal(ran.code, 1);
            assert.match(ran.stdout, /2 runs sampled, 0 judged/);
            assert.equal(verdictCount(world), 0);
        } finally {
            world.close();
        }
    });

    test('answers of the wrong shape store no verdict', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.seed(1);
            for (const bad of ['{"verdicts":[]}', '{"verdicts":[{"item":"t9/x/0","check":"I1","pass":true}],"keyfacts":[],"coverage":[]}', '[1,2]', '{"verdicts":[{"item":"t1/goal/0","check":"I9","pass":true}],"keyfacts":[],"coverage":[]}']) {
                world.answer('score', bad);
                const ran = await world.run(['eval']);
                assert.equal(ran.code, 1, bad);
                assert.match(ran.stdout, /1 runs sampled, 0 judged/, bad);
                assert.equal(verdictCount(world), 0, bad);
            }
        } finally {
            world.close();
        }
    });

    test('a judge that cannot be reached leaves the run not judged', { timeout: 30_000 }, async () => {
        const world = evalWorld();
        try {
            world.seed(1);
            const ran = await world.run(['eval']);
            assert.equal(ran.code, 1);
            assert.match(ran.stdout, /not judged/);
            assert.equal(verdictCount(world), 0);
        } finally {
            world.close();
        }
    });

    test('a verdict for another section\'s check is dropped and the first verdict of a pair wins', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.seed(1);
            world.answer('score', JSON.stringify({
                verdicts: [{ item: 't1/goal/0', check: 'S-done', pass: false, critique: 'wrong section' }, { item: 't1/goal/0', check: 'S-goal', pass: true }, { item: 't1/goal/0', check: 'S-goal', pass: false, critique: 'second' }],
                keyfacts: [], coverage: [],
            }));
            const ran = await world.run(['eval']);
            assert.equal(ran.code, 0, ran.stderr);
            assert.deepEqual(world.sql("SELECT check_id, pass FROM verdict WHERE item_key = 't1/goal/0' AND check_id <> 'filler'").map((row) => [row['check_id'], row['pass']]), [['S-goal', 1]]);
        } finally {
            world.close();
        }
    });

    test('an unusable read-back keeps the scores and says so', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.seed(1);
            world.answer('readback', '{"answers":["only one"]}');
            const ran = await world.run(['eval']);
            assert.equal(ran.code, 0, ran.stderr);
            assert.match(ran.stdout, /1 runs sampled, 1 judged/);
            assert.match(ran.stdout, /read-back: the answer is not six strings/);
            assert.ok(verdictCount(world) > 0);
            assert.equal(verdictCount(world, "check_id LIKE 'readback-%'"), 0);
        } finally {
            world.close();
        }
    });
});

describe('the state a run leaves behind', () => {
    let world: EvalWorld;
    let ran = { code: 0 as number | null, stdout: '', stderr: '' };

    before(async () => {
        world = judgingWorld();
        world.withStore((store) => {
            const record = (at: number, ops: readonly Operation[], input: string): void => {
                recordOps(store, { scope: tabId('w1:t1'), at: instant(at), cause: 'requested', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')], tasks: oneTask(''), ops: [{ task: textOf('t1'), ops }], input: textOf(input) });
            };
            const now = Date.now();
            record(now - 3000, [add('done', 'Merged !256.', 'merge !256'), add('next', 'Tag the release.')], '<recap_input version="2">merge !256</recap_input>');
            const open = storeRead(store.ledger.openOf({ scope: tabIdOf('w1:t1'), key: textOf('t1') })).find((fact) => fact.text === 'Tag the release.');
            assert.ok(open !== undefined);
            record(now - 2000, [add('done', 'Tagged 1.9.0.'), { op: 'close', id: open.id, why: 'done' }], '<recap_input version="2">tagged</recap_input>');
            record(now - 1000, [add('next', 'Announce 1.9.0.')], '<recap_input version="2">announce</recap_input>');
        });
        world.answer('score', JSON.stringify({
            verdicts: [{ item: 't1/next/0', check: 'I1', pass: true }, { item: 'state/t1/done/0', check: 'I1', pass: false, critique: 'a state key is not an added item' }],
            keyfacts: ['!256 is merged', 'The release is announced', 'A rollback plan exists'],
            coverage: [{ keyfact: 0, item: 'state/t1/done/0' }, { keyfact: 1, item: 'state/t1/next/0' }, { keyfact: 2, item: 't1/next/0' }],
        }));
        ran = await world.run(['eval', '--sample', '1']);
    });

    after(() => {
        world.close();
    });

    test('the newest run is judged', () => {
        assert.equal(ran.code, 0, ran.stderr);
        assert.match(ran.stdout, /1 runs sampled, 1 judged/);
    });

    test('coverage and no-filler count the state, an older fact carrying a key fact, and the added numbers stand beside them', () => {
        assert.match(ran.stdout, /coverage 67% \(2\/3\) \[added 33% \(1\/3\)\] · no-filler 67% \(2\/3\) \[added 100% \(1\/1\)\] · read-back 6\/6/);
    });

    test('the state rows are stored under state/ keys and a verdict about a state key is not an item check', () => {
        const rows = world.sql("SELECT item_key, pass FROM verdict WHERE check_id = 'filler' ORDER BY item_key").map((row) => [row['item_key'], row['pass']]);
        assert.deepEqual(rows, [['state/t1/done/0', 1], ['state/t1/done/1', 0], ['state/t1/next/0', 1]]);
        assert.deepEqual(world.sql("SELECT item_key, pass FROM verdict WHERE check_id = 'I1'").map((row) => [row['item_key'], row['pass']]), [['t1/next/0', 1]]);
    });

    test('the judge scores the state beside the added items and reads back the open ledger only', () => {
        const score = world.seen('score');
        assert.ok(score.includes('<state>') && score.includes('key="state/t1/done/0"') && score.includes('<recap>') && score.includes('key="t1/next/0"'));
        const readback = world.seen('readback');
        assert.ok(readback.includes('Merged !256.') && readback.includes('Tagged 1.9.0.') && !readback.includes('Tag the release.'));
    });
});

describe('the judge against the anchor', () => {
    test('a fact whose quote is in the input and that the judge calls unsupported is listed; an unanchored one is only a failing item', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.withStore((store) => {
                const anchored: Operation = { op: 'add', section: 'done', text: textOf('Merged !256.'), why: null, ref: null, at: null, agent: null, anchor: textOf('merge !256') };
                const plain: Operation = { op: 'add', section: 'done', text: textOf('Tagged 1.9.0.'), why: null, ref: null, at: null, agent: null };
                recordOps(store, { scope: tabId('w1:t1'), at: instant(Date.now() - 1000), cause: 'requested', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: null, sessions: [cursor('w1:p1')], tasks: oneTask(''), ops: [{ task: textOf('t1'), ops: [anchored, plain] }], input: textOf('<recap_input version="2">merge !256</recap_input>') });
            });
            world.answer('score', JSON.stringify({
                verdicts: [{ item: 't1/done/0', check: 'I4', pass: false, critique: 'the input never says it was merged' }, { item: 't1/done/1', check: 'I4', pass: false, critique: 'no source' }, { item: 't1/done/1', check: 'I3', pass: false, critique: 'vague' }],
                keyfacts: ['!256 is merged'], coverage: [{ keyfact: 0, item: 'state/t1/done/0' }],
            }));
            const ran = await world.run(['eval']);
            assert.equal(ran.code, 0, ran.stderr);
            assert.match(ran.stdout, /failing items \(3\)/);
            assert.match(ran.stdout, /judge vs anchor \(1\)[^\n]*\n[^\n]*t1\/done\/0 {2}"Merged !256\."/);
            assert.doesNotMatch(ran.stdout, /judge vs anchor \(1\)[^]*t1\/done\/1 {2}"Tagged 1\.9\.0\."[^]*all judged runs/);
        } finally {
            world.close();
        }
    });
});

describe('eval --label', () => {
    test('it shows the newest unlabelled item, asks again until it understands, and stores one operator verdict per check', { timeout: 30_000 }, async () => {
        const world = labelled();
        try {
            const ran = await world.run(['eval', '--label', '3'], { input: 'maybe\nok\nfail I3 done\ntoo vague\nfail S-nonsense\nquit\n' });
            assert.equal(ran.code, 0, ran.stderr);
            assert.match(ran.stdout, /1\/3 {2}w1:t1 .* t1\/goal\/0\n"Ship retries 0"/);
            assert.match(ran.stderr, /answer ok, fail \[checks\], skip or quit/);
            assert.match(ran.stderr, /S-NONSENSE is not a check of this item/i);
            const rows = operatorRows(world);
            assert.equal(rows.length, 16);
            assert.deepEqual(rows.filter((row) => row[2] === 0), [['t1/done/0', 'I3', 0, 'too vague', 'operator'], ['t1/done/0', 'S-done', 0, 'too vague', 'operator']]);
            assert.ok(rows.every((row) => row[4] === 'operator'));
            assert.equal(ran.stdout.split('why').length - 1, 1, 'a reason is asked only for a failure');
            assert.equal(world.asked().length, 0, 'labelling asks no model');
        } finally {
            world.close();
        }
    });

    test('an item that is labelled is not offered again', { timeout: 30_000 }, async () => {
        const world = labelled();
        try {
            await world.run(['eval', '--label', '2'], { input: 'ok\nok\nquit\n' });
            const again = await world.run(['eval', '--label', '3'], { input: 'quit\n' });
            assert.equal(again.code, 0, again.stderr);
            assert.doesNotMatch(again.stdout, /t1\/goal\/0|t1\/done\/0/);
            assert.match(again.stdout, /t1\/done\/1/);
        } finally {
            world.close();
        }
    });

    test('skip stores nothing, a closed input stops cleanly, and nothing to label is not an error', { timeout: 30_000 }, async () => {
        const world = labelled();
        const empty = evalWorld({ judge: 'none' });
        try {
            const skipped = await world.run(['eval', '--label', '2'], { input: 'skip\n' });
            assert.equal(skipped.code, 0, skipped.stderr);
            assert.equal(verdictCount(world), 0);
            assert.match(skipped.stdout, /1 of 2 items answered/);
            const nothing = await empty.run(['eval', '--label', '2']);
            assert.equal(nothing.code, 0, nothing.stderr);
        } finally {
            world.close();
            empty.close();
        }
    });

    test('--check I5 asks about that check only and still offers an item labelled on another check', { timeout: 30_000 }, async () => {
        const world = labelled();
        try {
            world.withStore((store) => {
                const [run] = runsOf(store.inputs, { tab: null, since: null, limit: 1, withInput: false });
                assert.ok(run !== undefined);
                store.verdicts.add([verdictOf({ run: run.id, item: 't1/goal/0', check: 'I3', pass: true, critique: null, judge: 'operator', at: 1, source: 'operator' })]);
            });
            const ran = await world.run(['eval', '--label', '2', '--check', 'I5'], { input: 'ok\nfail\ntoo vague\nquit\n' });
            assert.equal(ran.code, 0, ran.stderr);
            assert.match(ran.stdout, /t1\/goal\/0/);
            assert.equal(ran.stdout.split('I5: ok / fail / skip / quit > ').length - 1, 2);
            assert.deepEqual(operatorRows(world).filter((row) => row[1] === 'I5'), [['t1/done/0', 'I5', 0, 'too vague', 'operator'], ['t1/goal/0', 'I5', 1, null, 'operator']]);
            assert.equal(operatorRows(world).length, 3, 'nothing else was labelled');
        } finally {
            world.close();
        }
    });

    test('--check S-done asks only about items of that section, and another check named is asked again', { timeout: 30_000 }, async () => {
        const world = labelled();
        try {
            const ran = await world.run(['eval', '--label', '5', '--check', 'S-done'], { input: 'fail I1\nok\nquit\n' });
            assert.equal(ran.code, 0, ran.stderr);
            assert.doesNotMatch(ran.stdout, /t1\/goal\/0/);
            assert.match(ran.stdout, /t1\/done\/0/);
            assert.match(ran.stderr, /I1 is not a check of this item \(S-done\)/);
        } finally {
            world.close();
        }
    });
});

describe('eval --agree and --gates', () => {
    test('--agree prints the agreement, kappa beside the 0.6 bar, false passes, false fails and the newest disagreements, also as JSON', { timeout: 30_000 }, async () => {
        const world = evalWorld({ judge: 'none' });
        try {
            world.seed(1);
            world.withStore((store) => {
                const [run] = runsOf(store.inputs, { tab: null, since: null, limit: 1, withInput: false });
                assert.ok(run !== undefined);
                const both = (n: number, judge: boolean, operator: boolean): VerdictRecord[] => [
                    verdictOf({ run: run.id, item: `t1/x/${n}`, check: 'I3', pass: judge, critique: null, judge: 'j', at: 1, source: 'judge' }),
                    verdictOf({ run: run.id, item: `t1/x/${n}`, check: 'I3', pass: operator, critique: null, judge: 'operator', at: 2, source: 'operator' }),
                ];
                const judged = (n: number): VerdictRecord[] => {
                    if (n < 44) {
                        return both(n, n % 2 === 0, n % 2 === 0);
                    }
                    return n < 47 ? both(n, true, false) : both(n, false, true);
                };
                store.verdicts.add(Array.from({ length: 50 }, (_, n) => judged(n)).flat());
            });
            const text = await world.run(['eval', '--agree']);
            assert.equal(text.code, 0, text.stderr);
            assert.match(text.stdout, /I3 +88% +kappa 0\.76 +bar 0\.6 +44\/50 agree +3 false passes +3 false fails/);
            assert.match(text.stdout, /I3: where they disagree \(newest first\)\n {2}"t1\/x\/49" — judge fail, operator pass\n {2}"t1\/x\/48" — judge fail, operator pass\n {2}"t1\/x\/47" — judge fail, operator pass/);
            const json = await world.run(['eval', '--agree', '--json']);
            const [row] = JSON.parse(json.stdout) as { worst: { item: string }[] }[];
            assert.deepEqual({ ...row, worst: row?.worst.map((each) => each.item) }, { check: 'I3', items: 50, agreed: 44, percent: 88, falsePasses: 3, falseFails: 3, kappa: 0.76, worst: ['t1/x/49', 't1/x/48', 't1/x/47'] });
        } finally {
            world.close();
        }
    });

    test('--agree on a state with no doubly judged item says so', { timeout: 30_000 }, async () => {
        const world = evalWorld({ judge: 'none' });
        try {
            world.seed(1);
            const ran = await world.run(['eval', '--agree']);
            assert.equal(ran.code, 0, ran.stderr);
            assert.match(ran.stdout, /no item has both/);
        } finally {
            world.close();
        }
    });

    test('--gates --since 7 counts the last seven days of runs per gate and calls no model', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.seed(2, { gate: true, daysAgo: 2 });
            world.seed(4, { gate: true, daysAgo: 30 });
            world.seed(1, { daysAgo: 1 });
            const week = await world.run(['eval', '--gates', '--since', '7']);
            assert.equal(week.code, 0, week.stderr);
            assert.match(week.stdout, /gates over 2 runs\nG1 +2 refused +0 flagged\nG8 +0 refused +4 flagged\n0 items dropped after the retry/);
            const all = await world.run(['eval', '--gates']);
            assert.match(all.stdout, /gates over 6 runs/);
            assert.deepEqual(world.asked(), []);
        } finally {
            world.close();
        }
    });
});

describe('what the operator ruled reaches the next judge', () => {
    test('where the operator overruled the judge on I5, the scoring instructions carry the item and the reasons, newest first, at most five', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.seed(1);
            world.withStore((store) => {
                const [run] = runsOf(store.inputs, { tab: null, since: null, limit: 1, withInput: false });
                assert.ok(run !== undefined);
                const count = 7;
                store.verdicts.add(Array.from({ length: count + 1 }, (_, n) => [
                    verdictOf({ run: run.id, item: n === count ? 't1/done/1' : `t1/x/${n}`, check: 'I5', pass: true, critique: null, judge: 'j', at: 10 + n, source: 'judge' }),
                    verdictOf({ run: run.id, item: n === count ? 't1/done/1' : `t1/x/${n}`, check: 'I5', pass: false, critique: n === count ? 'effort, not work' : `reason ${n}`, judge: 'operator', at: 20 + n, source: 'operator' }),
                ]).flat());
            });
            const ran = await world.run(['eval', '--sample', '1']);
            assert.equal(ran.code, 0, ran.stderr);
            const score = world.seen('score');
            assert.match(score, /I5:\n- "Worked on it\." — the operator ruled FAIL: effort, not work\n- "t1\/x\/6" — .*reason 6\n- .*reason 5\n- .*reason 4\n- .*reason 3/);
            assert.ok(!score.includes('reason 2'), 'only the newest five');
        } finally {
            world.close();
        }
    });

    test('only the scoring call carries the corrections', { timeout: 30_000 }, async () => {
        const world = judgingWorld();
        try {
            world.seed(1);
            world.withStore((store) => {
                const [run] = runsOf(store.inputs, { tab: null, since: null, limit: 1, withInput: false });
                assert.ok(run !== undefined);
                store.verdicts.add([
                    verdictOf({ run: run.id, item: 't1/done/1', check: 'I5', pass: true, critique: null, judge: 'j', at: 10, source: 'judge' }),
                    verdictOf({ run: run.id, item: 't1/done/1', check: 'I5', pass: false, critique: 'effort, not work', judge: 'operator', at: 20, source: 'operator' }),
                ]);
            });
            await world.run(['eval', '--sample', '1']);
            assert.match(world.seen('score'), /the operator ruled FAIL/);
            assert.doesNotMatch(world.seen('readback'), /operator ruled/);
            assert.doesNotMatch(world.seen('grade'), /operator ruled/);
        } finally {
            world.close();
        }
    });
});
