import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC } from '#src/adapters/job/prompts/rubric.ts';
import { curatorInput } from '@stateforge-labs/session-ledger';
import { curationOf } from '#src/recap/domain/curation.ts';
import { facts, NOW } from '#test/fakes/curated-facts.ts';
import { dtdTest, validate } from '#test/xmllint.ts';
import { brand } from '@stateforge-labs/session-ledger';
import { factIdOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { textOf } from '@stateforge-labs/session-ledger';

const text = brand<string, 'Text'>;

const open = new Set(['f1', 'f2', 'f3'].map(factIdOf));

function words(count: number): string {
    return Array.from({ length: count }, (_, at) => `w${at}`).join(' ');
}

test('a paragraph of exactly 120 words is kept as it is', () => {
    const exact = curationOf(textOf(JSON.stringify({ ops: [], story: words(120) })), open);
    assert.equal(exact.story, words(120));
    assert.deepEqual(exact.refused, []);
});

test('the word count ignores newlines, double spaces and the edges of the paragraph', () => {
    const spaced = `  ${words(121).replaceAll(' w6', '\n\n w6')}   `;
    const over = curationOf(textOf(JSON.stringify({ ops: [], story: spaced })), open);
    assert.equal(over.story, null);
    assert.deepEqual(over.refused, ['the paragraph is too long: 121 words, at most 120']);
});


dtdTest('the curator document validates against its DTD: every state, a closed fact, text that needs escaping, an empty ledger', () => {
    const clock = { now: instant(NOW), zone: text('UTC') };
    for (const material of [{ name: text(''), language: text('en'), rubric: text(RUBRIC.items), facts, clock }, { name: text('Docs "&" more'), language: text('es'), rubric: text(RUBRIC.items), facts: [], clock }, { name: text(''), language: text('en'), rubric: text(RUBRIC.items), facts: facts.slice(0, 1), clock }]) {
        const { document } = curatorInput(material);
        const verdict = validate(document, 'curator-input.dtd');
        assert.ok(verdict.valid, `${verdict.output}\n${document}`);
    }
    assert.ok(!validate('<curator_input version="1"><task language="en" now="x"/><rubric>r</rubric><ledger><fact id="f1" section="now">x</fact></ledger></curator_input>', 'curator-input.dtd').valid, 'a fact with no times is refused');
});

