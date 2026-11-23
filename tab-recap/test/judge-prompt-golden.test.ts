import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC_TEXT } from '#src/adapters/job/prompts/rubric.ts';
import { judgeInstructionsOf } from '#src/adapters/job/prompts/judge-instructions.ts';
import { must } from '#src/protocol/result.ts';
import { countOf } from '#src/recap/domain/count.ts';
import { parseText, textOf, type Text } from '#src/recap/domain/text.ts';
import { reportOf } from '#src/recap/application/eval-report.ts';
import { judgeRun } from '#src/recap/application/judge.ts';
import { coverDocument } from '#src/recap/application/judge-context.ts';
import type { JudgeEntry } from '#src/ports/run-inputs.ts';
import type { Operation } from '#src/recap/domain/ops.ts';
import { reportText } from '#src/recap/render/eval.ts';
import { plain } from '#src/recap/render/wrap.ts';
import { instant } from '#src/recap/domain/time.ts';
import { usdOf } from '#src/recap/domain/usd.ts';
import { judgeOf } from '#test/eval-rig.ts';
import { cursor, memoryStore, recordOps, runsOf } from '#test/db/support.ts';
import { oneTask } from '#test/support.ts';
import { tabId } from '#test/support/ids.ts';

const t = (value: string): Text => must(parseText(value));
const fixture = (name: string): string => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');

test('golden: the report with a judge-vs-anchor failure lists the fact under its section, byte for byte', async () => {
    const store = memoryStore();
    const anchored: Operation = { op: 'add', section: 'done', text: textOf('Merged !256.'), why: null, ref: null, at: null, agent: null, anchor: textOf('merge !256') };
    const plainAdd: Operation = { op: 'add', section: 'done', text: textOf('Tagged 1.9.0.'), why: null, ref: null, at: null, agent: null };
    recordOps(store, { tab: tabId('w1:t1'), at: instant(1000), cause: 'requested', backend: textOf('fake'), language: textOf('en'), costUsd: usdOf(0), error: null, lanes: [cursor('w1:p1')], tasks: oneTask(''), ops: [{ task: textOf('t1'), ops: [anchored, plainAdd] }], input: textOf('<recap_input version="2">merge !256</recap_input>') });
    const run = runsOf(store.inputs, { tab: null, since: null, limit: 5, withInput: true })[0];
    assert.ok(run !== undefined);
    const score = JSON.stringify({
        verdicts: [{ item: 't1/done/0', check: 'I4', pass: false, critique: 'the input never says it was merged' }, { item: 't1/done/1', check: 'I4', pass: false, critique: 'no source' }],
        keyfacts: ['!256 is merged'], coverage: [{ keyfact: 0, item: 'state/t1/done/0' }],
    });
    const answers = JSON.stringify({ answers: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const grades = JSON.stringify({ grades: [1, 2, 3, 4, 5, 6].map((question) => ({ question, pass: question <= 4, critique: question <= 4 ? '' : 'missing' })) });
    const judge = judgeOf('fake', (task) => ({ score, readback: answers, grade: grades, cover: '' })[task]);
    const result = await judgeRun({ judge, inputs: store.inputs, verdicts: store.verdicts, rubric: t(RUBRIC_TEXT), now: () => instant(9000) }, run);
    const report = reportOf(textOf('fake'), [result]);
    assert.equal(report.judgeVsAnchor.length, 1);
    const text = reportText(report, plain, countOf(0)).join('\n').replace(/run_…[0-9a-z]{6}/g, 'run_…XXXXXX');
    assert.equal(`${text}\n`, fixture('eval-report-anchor.txt'));
});

test('golden: the cover instructions and a cover document are byte-identical to the fixture', () => {
    const items: readonly JudgeEntry[] = [{ key: t('state/t1/goal/0'), section: 'goal', text: t('Ship retries for the upload client.'), birth: 'born' }, { key: t('state/t1/done/0'), section: 'done', text: t('Merged !256 & tagged <1.9.0> done.'), birth: 'born' }];
    const document = coverDocument({ input: t('<recap_input version="1"><tab id="w1:t1"/>merge !256</recap_input>'), keyfacts: [t('!256 is merged')], state: items });
    assert.equal(`${judgeInstructionsOf('cover')}\n\n${document}\n`, fixture('judge-cover-prompt.txt'));
});
