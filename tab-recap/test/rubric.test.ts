import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC, rubricOf } from '#src/adapters/rubric.ts';
import { instructions } from '#src/adapters/recap-prompt.ts';
import { checkIds, examplesOf, RUBRIC_TEXT } from '#test/rubric.ts';
import { requestOf } from '#test/support.ts';

const SECTIONS = ['goal', 'now', 'needs', 'done', 'decisions', 'next', 'rules', 'links'];

test('the rubric holds the seven item checks and one check per section, each with a pass and a fail example', () => {
    assert.deepEqual(checkIds(), ['I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'I7', ...SECTIONS.map((section) => `S-${section}`)]);
    for (const id of checkIds()) {
        const { pass, fail } = examplesOf(id);
        assert.ok(pass !== '' && fail !== '', `${id} has a quoted pass and a quoted fail example`);
    }
});

test('the writer\'s instructions carry every check line of the rubric verbatim', () => {
    const rules = instructions(requestOf({ entries: [{ role: 'user', text: 'hi' }] }));
    assert.ok(rules.includes(RUBRIC.items) && rules.includes(RUBRIC.sections));
    for (const line of RUBRIC_TEXT.split('\n').filter((row) => /^- \*\*(I|S-)/.test(row))) {
        assert.ok(rules.includes(line), line);
    }
    assert.ok(!rules.includes('Whole recap'), 'the judge-only part is not the writer\'s');
    assert.match(rules, /comes back in <correction>/);
});

test('a check edited in the file reaches the instructions with no other edit (the parts are cut from the file text)', () => {
    const edited = RUBRIC_TEXT.replace('the item states one fact, action or decision.', 'one fact only.');
    assert.match(rubricOf(edited).items, /\*\*I1 atomic\*\* — one fact only\./);
    assert.equal(rubricOf(edited).sections, RUBRIC.sections);
    assert.match(rubricOf(RUBRIC_TEXT).whole, /read-back/);
});
