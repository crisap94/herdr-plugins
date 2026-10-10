import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerValue, askedOf, badIdAnswer, endAnswerOf, refusalAnswerOf, VALUE_MAX } from '#src/recap/domain/compact-request.ts';

test('askedOf reads a request value exactly as today: id, note and validity', () => {
    const cases: readonly [string, ReturnType<typeof askedOf>][] = [
        ['', null],
        ['r7', { id: 'r7', note: null, valid: true }],
        ['r7:please keep the parser', { id: 'r7', note: 'please keep the parser', valid: true }],
        ['r.7', { id: 'r.7', note: null, valid: true }],
        ['r.7:why', { id: 'r.7', note: 'why', valid: true }],
        [' :n', { id: ' ', note: 'n', valid: true }],
        ['r7:', { id: 'r7', note: null, valid: true }],
        ['r7:   ', { id: 'r7', note: null, valid: true }],
        ['r7:  padded  ', { id: 'r7', note: '  padded  ', valid: true }],
        ['r7:a:b', { id: 'r7', note: 'a:b', valid: true }],
        [':x', { id: '', note: 'x', valid: false }],
        [':', { id: '', note: null, valid: false }],
        ['a'.repeat(16), { id: 'a'.repeat(16), note: null, valid: true }],
        ['a'.repeat(17), { id: 'a'.repeat(17), note: null, valid: false }],
        [`r7:${'n'.repeat(200)}`, { id: 'r7', note: 'n'.repeat(77), valid: true }],
        [`${'a'.repeat(16)}:${'n'.repeat(200)}`, { id: 'a'.repeat(16), note: 'n'.repeat(63), valid: true }],
    ];
    for (const [raw, expected] of cases) {
        assert.deepEqual(askedOf(raw), expected, JSON.stringify(raw));
    }
});

test('answerValue is id:stage, cut at 80 characters and never refused', () => {
    assert.equal(VALUE_MAX, 80);
    assert.equal(answerValue('r7', 'queued'), 'r7:queued');
    assert.equal(answerValue('r7', 'running'), 'r7:running');
    assert.equal(answerValue('r7', 'done'), 'r7:done');
    assert.equal(answerValue('r7', 'failed-interrupted'), 'r7:failed-interrupted');
    assert.equal(answerValue('', 'queued'), ':queued');
    assert.equal(answerValue('a'.repeat(16), 'x'.repeat(63)), `${'a'.repeat(16)}:${'x'.repeat(63)}`, 'exactly 80 is kept');
    assert.equal(answerValue('a'.repeat(16), 'x'.repeat(70)), `${'a'.repeat(16)}:${'x'.repeat(63)}`, 'over 80 is cut');
    assert.equal(answerValue('a'.repeat(17), 'x'.repeat(70)), `${'a'.repeat(17)}:${'x'.repeat(62)}`, 'a 17-character id is cut too');
    assert.equal(answerValue('r7', 'failed-' + 'z'.repeat(100)).length, 80);
});

test('badIdAnswer keeps the first 16 characters of the id and says failed-bad-id', () => {
    assert.equal(badIdAnswer('r7'), 'r7:failed-bad-id');
    assert.equal(badIdAnswer(''), ':failed-bad-id');
    assert.equal(badIdAnswer('a'.repeat(17)), `${'a'.repeat(16)}:failed-bad-id`);
});

test('endAnswerOf is done for a compaction and a slug of the reason otherwise', () => {
    assert.equal(endAnswerOf('compacted', null), 'done');
    assert.equal(endAnswerOf('compacted', 'anything'), 'done');
    assert.equal(endAnswerOf('failed', 'agent busy'), 'failed-agent-busy');
    assert.equal(endAnswerOf('failed', 'Not Ready!!'), 'failed-not-ready');
    assert.equal(endAnswerOf('skipped', null), 'failed-skipped');
    assert.equal(endAnswerOf('failed', ''), 'failed-unknown');
    assert.equal(endAnswerOf('failed', '   '), 'failed-unknown');
});

test('refusalAnswerOf slugs the reason', () => {
    assert.equal(refusalAnswerOf('bad id'), 'failed-bad-id');
    assert.equal(refusalAnswerOf('Not a lane'), 'failed-not-a-lane');
    assert.equal(refusalAnswerOf(''), 'failed-unknown');
});
