import assert from 'node:assert/strict';
import { RUBRIC_TEXT } from '#src/adapters/job/prompts/rubric.ts';
import { coverDocument, gradingDocument, readbackDocument, scoringDocument } from '#src/recap/application/judge-context.ts';
import type { Text } from '#src/recap/domain/text.ts';
import { dtdTest, validate } from '#test/xmllint.ts';
import type { JudgeEntry } from '#src/ports/run-inputs.ts';
import { must } from '#src/protocol/result.ts';
import { parseText } from '#src/recap/domain/text.ts';

const t = (value: string): Text => must(parseText(value));

const ITEMS: readonly JudgeEntry[] = [{ key: t('t1/goal/0'), section: 'goal', text: t('Ship retries for the upload client.'), birth: 'born' }, { key: t('t1/done/0'), section: 'done', text: t('Merged !256 & tagged <1.9.0> ]]> done.'), birth: 'born' }];
const INPUT = t('<recap_input version="1"><tab id="w1:t1"/>hostile ]]> & </recap_input>');
const RUBRIC = t(RUBRIC_TEXT);

const FIXTURES: Readonly<Record<string, string>> = {
    'scoring: the rubric file, the saved input and the items with their keys': scoringDocument({ rubric: RUBRIC, input: INPUT, items: ITEMS }),
    'scoring: the added items and the ledger state after the run': scoringDocument({ rubric: RUBRIC, input: INPUT, items: ITEMS, state: ITEMS.map((item) => ({ ...item, key: t(`state/${item.key}`) })) }),
    'scoring: an empty state': scoringDocument({ rubric: RUBRIC, input: INPUT, items: ITEMS, state: [] }),
    'cover: the key facts to use and a state': coverDocument({ input: INPUT, keyfacts: [t('A <b> & c')], state: ITEMS.map((item) => ({ ...item, key: t(`state/${item.key}`) })) }),
    'cover: no key facts given': coverDocument({ input: INPUT, keyfacts: null, state: ITEMS }),
    'scoring: a run with no items': scoringDocument({ rubric: RUBRIC, input: INPUT, items: [] }),
    'read-back: the recap items alone': readbackDocument(ITEMS),
    'grading: the input, key facts and six answers': gradingDocument({ input: INPUT, keyfacts: [t('Tagged 1.9.0'), t('A <b> & c')], answers: ['a', 'b', 'c', 'd', 'e', 'f'].map(t) }),
    'grading: no key facts': gradingDocument({ input: INPUT, keyfacts: [], answers: ['a', 'b', 'c', 'd', 'e', 'f'].map(t) }),
};

for (const [name, document] of Object.entries(FIXTURES)) {
    dtdTest(`DTD: ${name}`, () => {
        const verdict = validate(document, 'judge-input.dtd');
        assert.ok(verdict.valid, verdict.output);
    });
}

dtdTest('DTD: broken documents fail — a wrong version, no writer input, an unknown section, an item without a key, an answer without its question', () => {
    const good = scoringDocument({ rubric: t('r'), input: t('i'), items: ITEMS });
    assert.ok(validate(good, 'judge-input.dtd').valid);
    for (const [why, broken] of [
        ['a wrong version', good.replace('version="1"', 'version="2"')],
        ['no writer input', good.replace(/<writer_input>[\s\S]*<\/writer_input>/, '')],
        ['an unknown section', good.replace('section="done"', 'section="chores"')],
        ['an item without a key', good.replace(' key="t1/done/0"', '')],
        ['the items before the rubric', good.replace(/(<rubric>[\s\S]*?<\/rubric>)([\s\S]*)(<recap>[\s\S]*<\/recap>)/, '$3$2$1')],
    ] as const) {
        assert.ok(!validate(broken, 'judge-input.dtd').valid, why);
    }
    const grading = gradingDocument({ input: t('i'), keyfacts: [], answers: [t('a')] });
    assert.ok(validate(grading, 'judge-input.dtd').valid);
    assert.ok(!validate(grading.replace(' question="1"', ''), 'judge-input.dtd').valid, 'an answer without its question');
    assert.ok(!validate(grading.replace(/<answers>[\s\S]*<\/answers>/, '<answers/>'), 'judge-input.dtd').valid, 'no answers at all');
});
