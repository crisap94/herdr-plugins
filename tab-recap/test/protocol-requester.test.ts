import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observe, request, withdraw } from '#src/protocol/requester.ts';
import type { AnswerState } from '#src/protocol/requester.ts';
import { requestId } from '#src/protocol/primitives.ts';
import type { RequestId } from '#src/protocol/primitives.ts';
import { compactLike, handoffLike, nameOf, parsedOf, toolOf, unwrap } from './fakes/protocol-exchanges.ts';

const idOf = (raw: string, grammar: 'legacy-length' | 'token-safe'): RequestId => unwrap(requestId(raw, grammar));

const observeOwn = (raw: string, id: string): AnswerState => unwrap(observe(handoffLike, { [nameOf('tab-recap-handoff')]: raw }, idOf(id, 'token-safe')));

test('an absent or empty answer is not seen', () => {
    assert.deepEqual(observeOwn('', 'r1'), { kind: 'not-seen' });
    assert.deepEqual(unwrap(observe(handoffLike, {}, idOf('r1', 'token-safe'))), { kind: 'not-seen' });
});

test('the three live stages of the own id are observed as their kind', () => {
    assert.deepEqual(observeOwn('r1:queued', 'r1'), { kind: 'queued' });
    assert.deepEqual(observeOwn('r1:running', 'r1'), { kind: 'running' });
    assert.deepEqual(observeOwn('r1:done', 'r1'), { kind: 'done' });
});

test('a declared failure stage is observed with its reason', () => {
    assert.deepEqual(observeOwn('r1:failed-refused', 'r1'), { kind: 'failed', reason: 'refused' });
    assert.deepEqual(observeOwn('r1:failed-bad-id', 'r1'), { kind: 'failed', reason: 'bad-id' });
});

test('a stage the descriptor does not declare is unreadable', () => {
    assert.deepEqual(observeOwn('r1:failed-unknown', 'r1'), { kind: 'unreadable' });
    assert.deepEqual(observeOwn('r1:compacted', 'r1'), { kind: 'unreadable' });
    assert.deepEqual(observeOwn('r1', 'r1'), { kind: 'unreadable' });
});

test('an answer for another id is foreign, and names that id', () => {
    assert.deepEqual(observeOwn('b2:done', 'a1'), { kind: 'foreign-id', id: 'b2' });
    assert.deepEqual(observeOwn('b2:queued', 'r1'), { kind: 'foreign-id', id: 'b2' });
});

test('a request writes its serialized value under the tool request name', () => {
    const writes = unwrap(request(handoffLike, toolOf('alpha'), parsedOf(handoffLike, 'r1:beta:urgent')));
    assert.deepEqual(writes, [{ name: 'handoff-req-alpha', value: 'r1:beta:urgent' }]);
});

test('a compact request keeps its legacy note as the rest of the value', () => {
    const writes = unwrap(request(compactLike, toolOf('coordinator'), parsedOf(compactLike, 'r.7:why')));
    assert.deepEqual(writes, [{ name: 'compact-req-coordinator', value: 'r.7:why' }]);
});

test('a request that breaks its field grammar is refused and writes nothing', () => {
    const value = { ...parsedOf(handoffLike, 'r1:beta'), target: 'two words' };
    assert.deepEqual(request(handoffLike, toolOf('alpha'), value), {
        kind: 'err',
        error: { reason: 'bad-characters', subject: 'target' },
    });
});

test('withdrawing a request clears its name', () => {
    assert.deepEqual(unwrap(withdraw(handoffLike, toolOf('alpha'))), [{ name: 'handoff-req-alpha', value: null }]);
});
