import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUBRIC } from '#src/adapters/rubric.ts';
import { curatorInput } from '#src/recap/application/curator-input.ts';
import { curationOf, STORY_WORDS } from '#src/recap/domain/curation.ts';
import { facts, NOW } from '#test/fakes/curated-facts.ts';
import { dtdTest, validate } from '#test/xmllint.ts';

const open = new Set(['f1', 'f2', 'f3']);

test('the curator may close an open fact as merged into another open one — and nothing else', () => {
    const merged = curationOf('{"ops":[{"op":"close","id":"f2","why":"merged","into":"f1"}],"story":"All is well."}', open);
    assert.deepEqual(merged.merges, [{ id: 'f2', into: 'f1' }]);
    assert.equal(merged.story, 'All is well.');
    assert.deepEqual(merged.refused, []);
    const refused = curationOf(JSON.stringify({ ops: [
        { op: 'add', section: 'done', text: 'x' }, { op: 'update', id: 'f1', text: 'y' }, { op: 'close', id: 'f1', why: 'wrong' }, { op: 'close', id: 'f1', why: 'merged' },
        { op: 'close', id: 'f9', why: 'merged', into: 'f1' }, { op: 'close', id: 'f1', why: 'merged', into: 'f1' }, { op: 'close', id: 'f1', why: 'merged', into: 'f9' }, 'nonsense',
    ], story: 'Still stored.' }), open);
    assert.deepEqual(refused.merges, []);
    assert.equal(refused.refused.length, 8);
    assert.match(refused.refused[0] ?? '', /add is not allowed/u);
    assert.match(refused.refused[1] ?? '', /update is not allowed/u);
    assert.equal(refused.story, 'Still stored.', 'the paragraph is kept whatever else was refused');
});

test('a fact merges once, and a fact other facts were merged into stays open', () => {
    const answer = '{"ops":[{"op":"close","id":"f1","why":"merged","into":"f2"},{"op":"close","id":"f2","why":"merged","into":"f3"},{"op":"close","id":"f1","why":"merged","into":"f3"}]}';
    const result = curationOf(answer, open);
    assert.deepEqual(result.merges, [{ id: 'f1', into: 'f2' }]);
    assert.equal(result.refused.length, 2);
    assert.match(result.refused[0] ?? '', /f2 is where another fact was merged/u);
    assert.match(result.refused[1] ?? '', /f1 is not an open fact \(or is already merged\)/u);
});

test('the paragraph is one line of at most 120 words; a longer one is cut there and says so; none is none', () => {
    const long = Array.from({ length: 200 }, (_, at) => `w${at}`).join(' ');
    const cut = curationOf(JSON.stringify({ ops: [], story: long }), open).story ?? '';
    assert.equal(cut.split(' ').length, STORY_WORDS);
    assert.ok(cut.endsWith('w119…'));
    assert.equal(curationOf('{"story":"two\\n\\nlines   here"}', open).story, 'two lines here');
    assert.equal(curationOf('{"ops":[]}', open).story, null);
    assert.equal(curationOf('{"story":"  "}', open).story, null);
    assert.deepEqual(curationOf('not json', open).refused, ['the answer is not JSON']);
    assert.deepEqual(curationOf('[1]', open).refused, ['the answer is not an object']);
});


dtdTest('the curator document validates against its DTD: every state, a closed fact, text that needs escaping, an empty ledger', () => {
    const clock = { now: NOW, zone: 'UTC' };
    for (const material of [{ name: '', language: 'en', rubric: RUBRIC.items, facts, clock }, { name: 'Docs "&" more', language: 'es', rubric: RUBRIC.items, facts: [], clock }, { name: '', language: 'en', rubric: RUBRIC.items, facts: facts.slice(0, 1), clock }]) {
        const { document } = curatorInput(material);
        const verdict = validate(document, 'curator-input.dtd');
        assert.ok(verdict.valid, `${verdict.output}\n${document}`);
    }
    assert.ok(!validate('<curator_input version="1"><task language="en" now="x"/><rubric>r</rubric><ledger><fact id="f1" section="now">x</fact></ledger></curator_input>', 'curator-input.dtd').valid, 'a fact with no times is refused');
});

test('the document names facts f1…fn in the order given, with their times, whys and closes', () => {
    const { document, facts: named } = curatorInput({ name: '', language: 'en', rubric: RUBRIC.items, facts, clock: { now: NOW, zone: 'UTC' } });
    assert.deepEqual([...named.keys()], ['f1', 'f2', 'f3', 'f4', 'f5']);
    assert.match(document, /<fact id="f4" section="decisions" state="open" first="16:00" last="16:00" why="an import guard cannot stop &lt;sibling&gt; modules">Keep the guard/u);
    assert.match(document, /first="16:10" last="16:10" closed="wrong" closedat="16:15"/u);
    assert.match(document, /<rubric>- \*\*I1 atomic\*\* — the item states one fact/u, 'the rubric file\'s item checks, verbatim');
});

