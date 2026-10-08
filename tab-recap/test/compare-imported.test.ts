// The fair 1.x comparison: per chapter of a tab, the last good 1.x recap against the replay's ledger state at the same time, with the same key facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareImported, withoutLedgers } from '#src/recap/application/compare-imported.ts';
import type { ImportedChapter } from '#src/ports/imported-recaps.ts';
import type { Judge, JudgeTask } from '#src/ports/judge.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { comparisonLines } from '#src/recap/render/compare.ts';
import { plain } from '#src/recap/render/wrap.ts';
import { cursor, memoryStore } from '#test/db/support.ts';
import { oneTask } from '#test/support.ts';
import { MIN, T0 } from './imported-fixture.ts';

const add = (section: 'goal' | 'done' | 'next', text: string): Operation => ({ op: 'add', section, text, why: null, ref: null, at: null, agent: null });

/** The replay side: three runs in the scratch store, each with the document the writer was given (a ledger and a turn). */
function replayStore(): ReturnType<typeof memoryStore> {
    const store = memoryStore();
    const run = (minutes: number, ops: readonly Operation[], turn: string): void => {
        store.records.recordRun({
            tab: 'replay:t1', at: T0 + minutes * MIN, cause: 'requested', backend: 'fake', language: 'en', costUsd: 0, error: null, lanes: [cursor('w1:p1')], tasks: oneTask(''), ops: [{ task: 't1', ops }],
            input: `<recap_input version="2"><tab id="x"/><ledger><fact id="f1" section="goal">LEDGER-ONLY</fact></ledger><transcript agent="a1"><turn role="user">${turn}</turn></transcript></recap_input>`,
        });
    };
    run(10, [add('goal', 'Add a cart to the shop'), add('done', 'Cart model written')], 'turn one');
    run(20, [add('done', 'Cart tests pass'), add('next', 'Add totals')], 'turn two');
    run(50, [add('done', 'Totals added in src/totals.ts')], 'turn three');
    return store;
}

/** A judge that finds three key facts in the replay's state (the first two open facts carry the first two), and records every cover and read-back call. */
function judgeOf(seen: { task: JudgeTask; document: string }[]): Judge {
    let recapSize = 0;
    return {
        label: 'fake',
        ask: (task, document) => {
            seen.push({ task, document });
            const keys = [...(/<state>([\s\S]*?)<\/state>/u.exec(document)?.[1] ?? '').matchAll(/<item key="([^"]+)"/gu)].map((found) => found[1] ?? '');
            recapSize = task === 'readback' ? (document.match(/<item /gu) ?? []).length : recapSize;
            const text = {
                cover: JSON.stringify({ keyfacts: ['a cart exists', 'totals exist', 'a rollback plan'], coverage: [{ keyfact: 0, item: keys[0] ?? null }, { keyfact: 1, item: keys[1] ?? null }, { keyfact: 2, item: null }] }),
                readback: JSON.stringify({ answers: ['a', 'b', 'c', 'd', 'e', 'f'] }),
                grade: JSON.stringify({ grades: [1, 2, 3, 4, 5, 6].map((question) => ({ question, pass: question <= recapSize, critique: '' })) }),
                score: '',
            }[task];
            return Promise.resolve({ kind: 'said', text, costUsd: 0.01 });
        },
    };
}

const chapter = (n: number, minutes: number, texts: readonly string[]): ImportedChapter => ({
    n, at: T0 + minutes * MIN,
    items: texts.map((text, at) => ({ key: `state/t1/done/${at}`, section: 'done', text, fact: `state/t1/done/${at}`, born: false, anchor: null })),
});

/** Three chapters against the replay: the first within its reach, the second too, the third long after it ends. */
async function compareAll(): Promise<{ readonly compared: Awaited<ReturnType<typeof compareImported>>; readonly seen: { task: JudgeTask; document: string }[] }> {
    const store = replayStore();
    const seen: { task: JudgeTask; document: string }[] = [];
    const deps = { judge: judgeOf(seen), inputs: store.inputs, verdicts: store.verdicts, rubric: 'r', now: (): number => 1, label: 'replay:t1' };
    const compared = await compareImported(deps, [chapter(1, 21, ['Cart model written']), chapter(2, 51, ['Totals added', 'Tests pass', 'Docs written']), chapter(3, 400, ['Later work'])]);
    return { compared, seen };
}

test('each chapter: the replay\'s state at that time sets the key facts and the 1.x recap is measured against the same ones; the sums add the chapters up', async () => {
    const { compared } = await compareAll();
    const [first, second] = compared.chapters;
    assert.ok(first?.kind === 'compared' && second?.kind === 'compared');
    assert.deepEqual([first.keyfacts, first.replay.coverage, first.imported.coverage], [3, { passed: 2, total: 3 }, { passed: 1, total: 3 }], 'the replay\'s ledger at 20 minutes has 4 open facts; the 1.x recap has one');
    assert.deepEqual([first.replay.filler, first.imported.filler], [{ passed: 2, total: 4 }, { passed: 1, total: 1 }]);
    assert.deepEqual([second.replay.size, second.imported.size, second.imported.coverage], [5, 3, { passed: 2, total: 3 }]);
    assert.deepEqual(compared.total.replay.coverage, { passed: 4, total: 6 });
    assert.deepEqual(compared.total.imported.coverage, { passed: 3, total: 6 });
    assert.deepEqual(compared.total.imported.readback, { passed: 4, total: 12 }, 'read-back is graded on each side: passes out of six per chapter');
});

test('a chapter the replay does not reach is skipped, saying why', async () => {
    const { compared } = await compareAll();
    const third = compared.chapters[2];
    assert.deepEqual([third?.kind, third?.kind === 'skipped' ? third.why : ''], ['skipped', 'the replay does not reach this chapter']);
});

test('the same key facts go to both sides, and the evidence is the chapter\'s turns: never the ledgers the replay\'s writer saw, nothing of the other chapters', async () => {
    const { seen } = await compareAll();
    const covers = seen.filter((call) => call.task === 'cover');
    assert.equal(covers.length, 4, 'two per compared chapter');
    assert.ok(!covers[0]?.document.includes('<keyfacts>') && covers[1]?.document.includes('<keyfact>a cart exists</keyfact>'), 'the 1.x side is handed the replay\'s key facts');
    assert.ok(covers.every((call) => !call.document.includes('LEDGER-ONLY')) && covers[0]?.document.includes('turn one'), 'turns, not ledgers');
    assert.ok(!covers[0]?.document.includes('turn three'), 'and only those of the chapter');
    assert.ok(covers[2]?.document.includes('turn three') && !covers[2].document.includes('turn one'), 'chapter 2 starts after chapter 1');
});

test('the ledgers of a writer\'s document are cut out of the evidence, however they are written', () => {
    assert.equal(withoutLedgers('<a/><ledger task="t1"><fact id="f1">x</fact></ledger><ledger/><b/>'), '<a/><b/>');
});

test('the report: one row per chapter, 1.x beside the replay, the sums, and why a chapter was skipped', async () => {
    const store = replayStore();
    const deps = { judge: judgeOf([]), inputs: store.inputs, verdicts: store.verdicts, rubric: 'r', now: (): number => 1, label: 'replay:t1' };
    const compared = await compareImported(deps, [chapter(1, 21, ['Cart model written']), chapter(2, 51, ['Totals added']), chapter(3, 400, ['Later work'])]);
    const text = comparisonLines(compared, 'w1:t1', plain).join('\n');
    assert.match(text, /the last good 1\.x recap of each chapter of w1:t1 against the replay's ledger state at the same time/);
    assert.match(text, /coverage 1\.x +coverage 2\.x +no-filler 1\.x +no-filler 2\.x +read-back 1\.x +read-back 2\.x/);
    assert.match(text, /chapter 1 \(2026-10-04 21:21, 3 key facts\) +33% \(1\/3\) +67% \(2\/3\)/);
    assert.match(text, /all chapters +\d+% \(\d+\/6\)/);
    assert.match(text, /chapter 3 \(2026-10-04 03:40\): the replay does not reach this chapter|chapter 3 \([^)]*\): the replay does not reach this chapter/);
    assert.match(comparisonLines({ chapters: [], total: compared.total, costUsd: 0 }, 'w1:t1', plain).join('\n'), /no chapter could be compared/);
});
