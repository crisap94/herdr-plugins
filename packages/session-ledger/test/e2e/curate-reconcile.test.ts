import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEngine } from '@stateforge-labs/session-ledger';
import { brand } from '@stateforge-labs/session-ledger';
import { acceptedRepair, storyRepair } from '@stateforge-labs/session-ledger';
import { STORY_TOO_LONG, STORY_WORDS, curationOf, parseOffer, parseStory, type Curation } from '@stateforge-labs/session-ledger';
import { createEngineWorld, engineCases, type EngineWorld } from '@stateforge-labs/session-ledger/testkit';

const text = brand<string, 'Text'>;
const open = new Set([text('f1'), text('f2'), text('f3')]);

for (const id of ['CUR-8', 'CUR-9', 'CUR-10', 'CUR-11', 'CUR-12', 'CUR-13', 'CUR-14', 'CUR-15', 'CUR-16']) {
    test(`engine case ${id} holds on the engine`, async () => {
        const found = engineCases.find((kase) => kase.id === id);
        assert.ok(found);
        const world: EngineWorld = createEngineWorld();
        await found.run(world, createEngine(world.plugs));
    });
}

test('a curation keeps valid merges, refuses the rest with the plugin wording and reads the story', () => {
    const answer = JSON.stringify({
        story: 'one short paragraph',
        ops: [
            { op: 'close', id: 'f1', why: 'merged', into: 'f2' },
            { op: 'close', id: 'f1', why: 'merged', into: 'f3' },
            { op: 'close', id: 'f2', why: 'merged', into: 'f3' },
            { op: 'close', id: 'f9', why: 'merged', into: 'f3' },
            { op: 'close', id: 'f3', why: 'done' },
            { op: 'add', id: 'f3' },
            'x',
        ],
    });
    const checked = curationOf(text(answer), open);
    assert.deepEqual(checked.merges, [{ id: 'f1', into: 'f2' }]);
    assert.equal(checked.story, 'one short paragraph');
    assert.deepEqual(checked.refused, [
        'f1 is not an open fact (or is already merged)',
        'f2 is where another fact was merged: it stays open',
        'f9 is not an open fact (or is already merged)',
        'close f3 must say why "merged" and the fact it merges into',
        'add is not allowed: the curator may only close',
        'not an operation',
    ]);
});

test('an answer that is not JSON or not an object is refused whole', () => {
    assert.deepEqual(curationOf(text('nope'), open).refused, ['the answer is not JSON']);
    assert.deepEqual(curationOf(text('[1]'), open).refused, ['the answer is not an object']);
    assert.equal(curationOf(text('[1]'), open).story, null);
});

test('a paragraph over the word limit is refused and not kept', () => {
    const long = Array.from({ length: STORY_WORDS + 1 }, () => 'word').join(' ');
    const checked = curationOf(text(JSON.stringify({ story: long })), open);
    assert.equal(checked.story, null);
    assert.deepEqual(checked.refused, [`${STORY_TOO_LONG}: ${STORY_WORDS + 1} words, at most ${STORY_WORDS}`]);
    assert.equal(parseStory('  two   words '), 'two words');
    assert.equal(parseStory('   '), null);
    assert.equal(parseStory(7), null);
});

test('an offer reads the fields it needs and refuses a value that is not an object', () => {
    assert.equal(parseOffer('x'), null);
    assert.deepEqual(parseOffer({ op: 'close', id: 'f1', into: 'f2', why: 'merged' }), { kind: 'close', shown: 'f1', id: 'f1', into: 'f2', why: 'merged' });
    assert.deepEqual(parseOffer({ op: 3 }), { kind: '3', shown: 'undefined', id: null, into: null, why: null });
});

test('a repair request quotes the first answer and lists what was refused', () => {
    const checked = curationOf(text('{"ops":[{"op":"close","id":"f9","why":"merged","into":"f1"}]}'), open);
    const asked = storyRepair(text('<doc/>'), text('{"ops":[]}'), checked);
    assert.ok(asked.startsWith('<doc/>\n\n<previous-answer>\n{"ops":[]}\n</previous-answer>\n\n<refused>\n- f9 is not an open fact (or is already merged)\n- no paragraph\n</refused>'));
    const long = curationOf(text(JSON.stringify({ story: Array.from({ length: 121 }, () => 'w').join(' ') })), open);
    assert.ok(!storyRepair(text('<doc/>'), text('{}'), long).includes('- no paragraph'));
});

test('a repaired answer is kept unless it is not JSON, not an object or not an answer', () => {
    const first = { kind: 'curated', text: text('{"ops":[]}') } as const;
    const reading = (answer: { readonly kind: string; readonly text?: string }): Curation => curationOf(text(answer.text ?? ''), open);
    const good = { kind: 'curated', text: text('{"story":"fixed"}') } as const;
    assert.equal(acceptedRepair(first, good, reading), good);
    assert.equal(acceptedRepair(first, { kind: 'curated', text: text('prose') }, reading), first);
    assert.equal(acceptedRepair(first, { kind: 'curated', text: text('[]') }, reading), first);
    const failed = { kind: 'unknown', why: { why: 'not-found', what: text('x') } } as const;
    assert.equal(acceptedRepair(first, failed, reading), first);
});
