// The judge's documents validated against schema/judge-input.dtd, and broken ones that must fail.
import assert from 'node:assert/strict';
import { RUBRIC_TEXT } from '#src/adapters/rubric.ts';
import { gradingDocument, readbackDocument, scoringDocument } from '#src/recap/application/judge-context.ts';
import { dtdTest, validate } from '#test/xmllint.ts';

const ITEMS = [{ key: 't1/goal/0', section: 'goal', text: 'Ship retries for the upload client.' }, { key: 't1/done/0', section: 'done', text: 'Merged !256 & tagged <1.9.0> ]]> done.' }];
const INPUT = '<recap_input version="1"><tab id="w1:t1"/>hostile ]]> & </recap_input>';

const FIXTURES: Readonly<Record<string, string>> = {
    'scoring: the rubric file, the saved input and the items with their keys': scoringDocument({ rubric: RUBRIC_TEXT, input: INPUT, items: ITEMS }),
    'scoring: a run with no items': scoringDocument({ rubric: RUBRIC_TEXT, input: INPUT, items: [] }),
    'read-back: the recap items alone': readbackDocument(ITEMS),
    'grading: the input, key facts and six answers': gradingDocument({ input: INPUT, keyfacts: ['Tagged 1.9.0', 'A <b> & c'], answers: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    'grading: no key facts': gradingDocument({ input: INPUT, keyfacts: [], answers: ['a', 'b', 'c', 'd', 'e', 'f'] }),
};

for (const [name, document] of Object.entries(FIXTURES)) {
    dtdTest(`DTD: ${name}`, () => {
        const verdict = validate(document, 'judge-input.dtd');
        assert.ok(verdict.valid, verdict.output);
    });
}

dtdTest('DTD: broken documents fail — a wrong version, no writer input, an unknown section, an item without a key, an answer without its question', () => {
    const good = scoringDocument({ rubric: 'r', input: 'i', items: ITEMS });
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
    const grading = gradingDocument({ input: 'i', keyfacts: [], answers: ['a'] });
    assert.ok(validate(grading, 'judge-input.dtd').valid);
    assert.ok(!validate(grading.replace(' question="1"', ''), 'judge-input.dtd').valid, 'an answer without its question');
    assert.ok(!validate(grading.replace(/<answers>[\s\S]*<\/answers>/, '<answers/>'), 'judge-input.dtd').valid, 'no answers at all');
});
