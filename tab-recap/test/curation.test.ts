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

test('the curator may close an open fact as merged into another open one — and nothing else', () => {
    const merged = curationOf(textOf('{"ops":[{"op":"close","id":"f2","why":"merged","into":"f1"}],"story":"All is well."}'), open);
    assert.deepEqual(merged.merges, [{ id: 'f2', into: 'f1' }]);
    assert.equal(merged.story, 'All is well.');
    assert.deepEqual(merged.refused, []);
    const refused = curationOf(textOf(JSON.stringify({ ops: [
        { op: 'add', section: 'done', text: 'x' }, { op: 'update', id: 'f1', text: 'y' }, { op: 'close', id: 'f1', why: 'wrong' }, { op: 'close', id: 'f1', why: 'merged' },
        { op: 'close', id: 'f9', why: 'merged', into: 'f1' }, { op: 'close', id: 'f1', why: 'merged', into: 'f1' }, { op: 'close', id: 'f1', why: 'merged', into: 'f9' }, 'nonsense',
    ], story: 'Still stored.' })), open);
    assert.deepEqual(refused.merges, []);
    assert.equal(refused.refused.length, 8);
    assert.match(refused.refused[0] ?? '', /add is not allowed/u);
    assert.match(refused.refused[1] ?? '', /update is not allowed/u);
    assert.equal(refused.story, 'Still stored.', 'the paragraph is kept whatever else was refused');
});

test('a fact merges once, and a fact other facts were merged into stays open', () => {
    const answer = '{"ops":[{"op":"close","id":"f1","why":"merged","into":"f2"},{"op":"close","id":"f2","why":"merged","into":"f3"},{"op":"close","id":"f1","why":"merged","into":"f3"}]}';
    const result = curationOf(textOf(answer), open);
    assert.deepEqual(result.merges, [{ id: 'f1', into: 'f2' }]);
    assert.equal(result.refused.length, 2);
    assert.match(result.refused[0] ?? '', /f2 is where another fact was merged/u);
    assert.match(result.refused[1] ?? '', /f1 is not an open fact \(or is already merged\)/u);
});

test('the paragraph is one line of at most 120 words; a longer one is refused with its word count; none is none', () => {
    const long = curationOf(textOf(JSON.stringify({ ops: [], story: words(200) })), open);
    assert.equal(long.story, null);
    assert.deepEqual(long.refused, ['the paragraph is too long: 200 words, at most 120']);
    assert.equal(curationOf(textOf('{"story":"two\\n\\nlines   here"}'), open).story, 'two lines here');
    assert.equal(curationOf(textOf('{"ops":[]}'), open).story, null);
    assert.equal(curationOf(textOf('{"story":"  "}'), open).story, null);
    assert.deepEqual(curationOf(textOf('not json'), open).refused, ['the answer is not JSON']);
    assert.deepEqual(curationOf(textOf('[1]'), open).refused, ['the answer is not an object']);
});

test('a paragraph of exactly 120 words is kept as it is', () => {
    const exact = curationOf(textOf(JSON.stringify({ ops: [], story: words(120) })), open);
    assert.equal(exact.story, words(120));
    assert.deepEqual(exact.refused, []);
});

test('a paragraph of 121 words is refused with its word count and stored as none', () => {
    const over = curationOf(textOf(JSON.stringify({ ops: [], story: words(121) })), open);
    assert.equal(over.story, null);
    assert.deepEqual(over.refused, ['the paragraph is too long: 121 words, at most 120']);
});

test('the word count ignores newlines, double spaces and the edges of the paragraph', () => {
    const spaced = `  ${words(121).replaceAll(' w6', '\n\n w6')}   `;
    const over = curationOf(textOf(JSON.stringify({ ops: [], story: spaced })), open);
    assert.equal(over.story, null);
    assert.deepEqual(over.refused, ['the paragraph is too long: 121 words, at most 120']);
});

test('a too-long paragraph is refused after the merge refusals, and the clean merge is kept', () => {
    const answer = JSON.stringify({ ops: [{ op: 'close', id: 'f2', why: 'merged', into: 'f1' }, { op: 'close', id: 'f9', why: 'merged', into: 'f1' }], story: words(121) });
    const result = curationOf(textOf(answer), open);
    assert.deepEqual(result.merges, [{ id: 'f2', into: 'f1' }]);
    assert.equal(result.refused.length, 2);
    assert.match(result.refused[0] ?? '', /f9 is not an open fact \(or is already merged\)/u);
    assert.equal(result.refused[1], 'the paragraph is too long: 121 words, at most 120');
    assert.equal(result.story, null);
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

test('the document names facts f1…fn in the order given, with their times, whys and closes', () => {
    const { document, facts: named } = curatorInput({ name: text(''), language: text('en'), rubric: text(RUBRIC.items), facts, clock: { now: instant(NOW), zone: text('UTC') } });
    assert.deepEqual([...named.keys()], ['f1', 'f2', 'f3', 'f4', 'f5']);
    assert.match(document, /<fact id="f4" section="decisions" state="open" first="16:00" last="16:00" why="an import guard cannot stop &lt;sibling&gt; modules">Keep the guard/u);
    assert.match(document, /first="16:10" last="16:10" closed="wrong" closedat="16:15"/u);
    assert.match(document, /<rubric>- \*\*I1 atomic\*\* — the item states one fact/u, 'the rubric file\'s item checks, verbatim');
});

