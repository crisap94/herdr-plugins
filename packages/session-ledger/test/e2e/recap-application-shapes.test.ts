import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askBackFor, MAX_FACT_QUESTIONS, THIN_CHARS, wanted } from '@stateforge-labs/session-ledger';
import { chunksOf, CHUNK_CHARS, newestOf } from '@stateforge-labs/session-ledger';
import { answerTextOf, headlineOf, objectIn, renderRecap, tidy } from '@stateforge-labs/session-ledger';
import { capStubs, MAX_STUBS, triggersOf, type Stub } from '@stateforge-labs/session-ledger';
import { brand } from '@stateforge-labs/session-ledger';
import { clipHead, clipTurn } from '@stateforge-labs/session-ledger';
import { NO_SECTIONS } from '@stateforge-labs/session-ledger';
import { parseText, type Text } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import type { Entry } from '@stateforge-labs/session-ledger';
import type { InputFact } from '@stateforge-labs/session-ledger';

const count = brand<number, 'Count'>;

const clock = { now: instant(1_000_000), zone: brand<string, 'Text'>('UTC') };

const textOf = (value: string): Text => {
    const parsed = parseText(value);
    if (parsed.kind !== 'ok') {
        throw new Error('not text');
    }
    return parsed.value;
};

const stub = (kind: Stub['kind'], anchor: string): Stub => ({ kind, section: 'done', ref: null, anchor: textOf(anchor), at: null });

const fact: InputFact = { id: textOf('f1'), section: 'decisions', text: textOf('use sqlite storage'), state: 'open', first: instant(1), last: instant(1), why: null, ref: null, anchor: null, agent: null, closed: null };

test('the ask-back questions are asked only when the recap is thin or spans chunks', () => {
    assert.equal(THIN_CHARS, 2_000);
    assert.equal(MAX_FACT_QUESTIONS, 5);
    assert.equal(wanted({ chunks: count(1), chars: count(100), candidates: [] }), false);
    assert.equal(wanted({ chunks: count(2), chars: count(100), candidates: [] }), true);
    assert.equal(wanted({ chunks: count(1), chars: count(5_000), candidates: [] }), true);
    const questions = askBackFor({ chunks: count(2), chars: count(100), candidates: [], open: [fact], said: textOf('we will use sqlite storage now') });
    assert.equal(questions[0]?.id, 'q1');
    assert.ok(questions.some((question) => question.text === 'What changed about the open fact "use sqlite storage"?'));
    assert.deepEqual(askBackFor({ chunks: count(1), chars: count(100), candidates: [], open: [fact], said: textOf('') }), []);
});

test('the triggers find commits, errors, questions and edits in transcript entries', () => {
    const entries: Entry[] = [
        { role: 'tool', kind: 'shell', text: textOf('git commit -m "ship it"') },
        { role: 'tool', kind: 'shell', text: textOf('npm test: Error: boom') },
        { role: 'user', text: textOf('Should we ship?') },
        { role: 'tool', kind: 'edit', text: textOf('src/a.ts') },
        { role: 'tool', kind: 'read', text: textOf('src/b.ts') },
    ];
    const stubs = triggersOf(entries);
    assert.deepEqual(stubs.map((one) => one.kind), ['commit', 'error', 'question', 'edit']);
    assert.equal(stubs[0]?.section, 'done');
    assert.equal(stubs[2]?.section, 'needs');
    assert.equal(MAX_STUBS, 12);
});

test('the trigger cap keeps the most important stubs in their original order', () => {
    const stubs = [stub('edit', 'e'), stub('commit', 'c'), stub('question', 'q')];
    assert.deepEqual(capStubs(stubs, count(2)).map((one) => one.anchor), ['c', 'q']);
    assert.deepEqual(capStubs(stubs, count(1)).map((one) => one.anchor), ['c']);
});

test('the recap text is tidied, its JSON object is read, and its headline is the first need or now line', () => {
    assert.equal(tidy(textOf('- **Ship**   the build  ')), 'Ship the build');
    assert.equal(tidy(textOf('none')), '');
    assert.equal(tidy(textOf('a b c d e f g h i j k l m n o p q'), count(4)), 'a b c d…');
    assert.deepEqual(objectIn(textOf('note {"goal":"x"} trailing')), { goal: 'x' });
    assert.equal(objectIn(textOf('no braces here')), undefined);
    assert.equal(answerTextOf(textOf('{"a":1}')), '{"a":1}');
    assert.equal(answerTextOf(textOf('here: {"goal":"x"}')), '{"goal":"x"}');
    assert.equal(answerTextOf(textOf('plain words')), 'plain words');
    const sections = { ...NO_SECTIONS, goal: textOf('Ship'), needs: [textOf('Approve it')], now: [textOf('Testing')] };
    assert.equal(renderRecap(sections, 'en').split('\n')[0], '## Goal');
    assert.match(renderRecap(sections, 'en'), /- Approve it/u);
    assert.deepEqual(headlineOf(sections), { kind: 'needs', text: 'Approve it' });
    assert.deepEqual(headlineOf({ ...NO_SECTIONS, now: [textOf('Testing')] }), { kind: 'now', text: 'Testing' });
    assert.equal(headlineOf(NO_SECTIONS), null);
});

test('the transcript splits into chunks within a limit, and the newest chunk fits its budget', () => {
    assert.equal(CHUNK_CHARS, 6_000);
    const entries: Entry[] = [
        { role: 'user', text: textOf('first question'), at: instant(1_000_000) },
        { role: 'agent', text: textOf('first answer') },
        { role: 'user', text: textOf('second question') },
        { role: 'agent', text: textOf('second answer') },
    ];
    const chunks = chunksOf(entries, clock, count(120));
    assert.ok(chunks.length >= 1);
    assert.equal(chunks.flatMap((chunk) => chunk.entries).length, entries.length);
    assert.equal(chunksOf(entries, clock).length, 1);
    assert.equal(newestOf([], clock, count(100)), null);
    assert.ok(newestOf(entries, clock, count(10_000))?.markup.includes('second answer'));
});

test('the newest pieces that fit are whole pieces, never one cut in half', () => {
    const entries: Entry[] = [];
    for (let turn = 0; turn < 6; turn += 1) {
        entries.push({ role: 'user', text: textOf(`question ${turn}`), at: instant(1_000_000 + turn) }, { role: 'agent', text: textOf(`answer ${turn} ${'word '.repeat(40)}`) });
    }
    const whole = chunksOf(entries, clock, count(1_000_000))[0];
    assert.ok(whole !== undefined);
    const limit = count(Math.floor(whole.markup.length / 2) + 40);
    const tail = newestOf(entries, clock, limit);
    assert.ok(tail !== null && tail.markup.length <= limit + 1);
    assert.ok(tail.entries.length >= 1 && tail.entries.length < entries.length);
    assert.deepEqual(tail.entries, entries.slice(entries.length - tail.entries.length));
    assert.equal(tail.markup.match(/<turn /g)?.length, tail.entries.length);
    assert.equal(tail.markup.match(/<\/turn>/g)?.length, tail.entries.length);
    assert.ok(tail.markup.includes('answer 5 '));
    assert.ok(tail.markup.includes('word '.repeat(39)));
});

test('the newest piece is kept even when it alone is bigger than the limit', () => {
    const huge = newestOf([{ role: 'agent', text: textOf('x'.repeat(5_000)) }], clock, count(10));
    assert.equal(huge?.entries.length, 1);
    const older: Entry[] = [{ role: 'user', text: textOf('earlier question') }, { role: 'agent', text: textOf('x'.repeat(5_000)) }];
    const last = newestOf(older, clock, count(10));
    assert.deepEqual(last?.entries, older.slice(1));
});

test('the clip helpers keep the head and tail of a long turn and the head of a long value', () => {
    assert.deepEqual(clipTurn('agent', textOf('short')), { text: 'short', clipped: false });
    const long = `${'a'.repeat(900)}${'b'.repeat(900)}`;
    const clipped = clipTurn('agent', textOf(long));
    assert.equal(clipped.clipped, true);
    assert.ok(clipped.text.includes('[…]'));
    assert.deepEqual(clipHead(textOf('abcdef'), count(3)), { text: 'abc', clipped: true });
    assert.deepEqual(clipHead(textOf('ab'), count(3)), { text: 'ab', clipped: false });
});
