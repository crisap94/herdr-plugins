import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finalAnswerOf, noteOf, VALUE_MAX } from '#src/recap/domain/compact-request.ts';
import { REGISTRY } from '#src/recap/domain/token-registry.ts';
import { failureStage, answerValue } from '#src/protocol/exchange.ts';
import { compact, COMPACT_FAILURES, COMPACT_STAGES } from '#src/protocol/exchanges/compact.ts';
import { must } from '#src/protocol/result.ts';
import { take } from '#src/protocol/responder.ts';

const readRequest = (raw: string): ReturnType<typeof take> => take(REGISTRY, { 'compact-req-coordinator': raw }, () => false);

const askedOf = (raw: string): { readonly id: string; readonly note: string | null; readonly valid: boolean } | null => {
    const read = readRequest(raw);
    const [taken] = read.taken;
    if (taken !== undefined) {
        return { id: taken.id, note: noteOf(taken.value), valid: true };
    }
    const [refused] = read.refused;
    return refused === undefined ? null : { id: refused.rawId, note: null, valid: false };
};

test('a request value is read exactly as before: id, note and validity', () => {
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
        [':x', { id: '', note: null, valid: false }],
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

test('an answer is id:stage, cut at 80 characters and never refused', () => {
    assert.equal(VALUE_MAX, 80);
    assert.equal(must(answerValue(compact, 'r7', COMPACT_STAGES.queued)), 'r7:queued');
    assert.equal(must(answerValue(compact, 'r7', COMPACT_STAGES.running)), 'r7:running');
    assert.equal(must(answerValue(compact, 'r7', COMPACT_STAGES.done)), 'r7:done');
    assert.equal(must(answerValue(compact, 'r7', failureStage(COMPACT_FAILURES.interrupted))), 'r7:failed-interrupted');
    assert.equal(must(answerValue(compact, '', COMPACT_STAGES.queued)), ':queued');
    assert.equal(must(answerValue(compact, 'a'.repeat(16), 'x'.repeat(63))), `${'a'.repeat(16)}:${'x'.repeat(63)}`, 'exactly 80 is kept');
    assert.equal(must(answerValue(compact, 'a'.repeat(16), 'x'.repeat(70))), `${'a'.repeat(16)}:${'x'.repeat(63)}`, 'over 80 is cut');
    assert.equal(must(answerValue(compact, 'a'.repeat(17), 'x'.repeat(70))), `${'a'.repeat(17)}:${'x'.repeat(62)}`, 'a 17-character id is cut too');
    assert.equal(must(answerValue(compact, 'r7', 'failed-' + 'z'.repeat(100))).length, 80);
});

const refusedAnswer = (raw: string): string | undefined => readRequest(raw).refused[0]?.answer;

test('a bad compact id is refused with failed-bad-id, its first 16 characters kept', () => {
    assert.equal(refusedAnswer('r7'), undefined, 'a good id is taken, not refused');
    assert.equal(refusedAnswer(':note'), ':failed-bad-id');
    assert.equal(refusedAnswer(`${'a'.repeat(17)}:n`), `${'a'.repeat(16)}:failed-bad-id`);
});

test('a compaction ends with done, or failed with its declared reason', () => {
    assert.equal(finalAnswerOf('compacted', null), 'done');
    assert.equal(finalAnswerOf('compacted', COMPACT_FAILURES.error), 'done');
    assert.equal(finalAnswerOf('failed', COMPACT_FAILURES.error), 'failed-error');
    assert.equal(finalAnswerOf('skipped', null), 'failed-skipped');
    assert.equal(failureStage(COMPACT_FAILURES.notALane), 'failed-not-a-lane');
});
