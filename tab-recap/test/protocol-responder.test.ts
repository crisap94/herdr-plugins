import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answer, take } from '#src/protocol/responder.ts';
import type { SeenCheck, Taking } from '#src/protocol/responder.ts';
import { requestId } from '#src/protocol/primitives.ts';
import type { ExchangeName, RequestId, ToolName } from '#src/protocol/primitives.ts';
import { badIdAnswer } from '#src/recap/domain/compact-request.ts';
import { compactLike, handoffLike, registryOf, unwrap } from './fakes/protocol-exchanges.ts';

const registry = registryOf([compactLike, handoffLike]);

const nothingSeen: SeenCheck = () => false;

const onlyHandoffAlphaR1Seen: SeenCheck = (exchange: ExchangeName, tool: ToolName, id: RequestId) =>
    exchange === 'handoff' && tool === 'alpha' && id === 'r1';

const takeFrom = (tokens: Record<string, string>, seen: SeenCheck = nothingSeen): Taking => take(registry, tokens, seen);

const idOf = (raw: string): RequestId => unwrap(requestId(raw, 'token-safe'));

const refusedOf = (tokens: Record<string, string>): { rawId: string; answer: string }[] => takeFrom(tokens).refused.map((refusal) => ({ rawId: refusal.rawId, answer: refusal.answer }));

test('a request token with a registered prefix is taken with its tool, id and parsed value', () => {
    const result = takeFrom({ 'handoff-req-alpha': 'r1:beta:urgent' });
    assert.deepEqual(result.refused, []);
    assert.deepEqual(
        result.taken.map(({ exchange, tool, id, value }) => ({ exchange, tool, id, value })),
        [{ exchange: handoffLike, tool: 'alpha', id: 'r1', value: { id: 'r1', target: 'beta', urgent: true } }],
    );
});

test('the answer token, the capability token and unregistered names are not requests', () => {
    const result = takeFrom({
        'tab-recap-handoff': 'r1:done',
        'tab-recap-x': 'handoff1,kinds1',
        'other-req-alpha': 'r1:beta',
    });
    assert.deepEqual(result, { taken: [], refused: [] });
});

test('an empty request value is no request', () => {
    assert.deepEqual(takeFrom({ 'handoff-req-alpha': '' }), { taken: [], refused: [] });
});

test('a tool name that is not a valid ToolName is no request', () => {
    assert.deepEqual(takeFrom({ [`handoff-req-${'a'.repeat(21)}`]: 'r1:beta' }), { taken: [], refused: [] });
});

test('a request whose id the seen check knows is not taken again', () => {
    assert.deepEqual(takeFrom({ 'handoff-req-alpha': 'r1:beta' }, onlyHandoffAlphaR1Seen), { taken: [], refused: [] });
    assert.equal(takeFrom({ 'handoff-req-alpha': 'r2:beta' }, onlyHandoffAlphaR1Seen).taken.length, 1);
});

test('a token-safe request with a dotted id is refused, answered failed-bad-id, and requests nothing', () => {
    const result = takeFrom({ 'handoff-req-alpha': 'r.7:beta' });
    assert.deepEqual(result.taken, []);
    assert.deepEqual(refusedOf({ 'handoff-req-alpha': 'r.7:beta' }), [{ rawId: 'r.7', answer: 'r.7:failed-bad-id' }]);
});

test('a bad compact id is refused with exactly the answer the current code writes', () => {
    for (const rawId of ['', 'x'.repeat(17), 'r'.repeat(40)]) {
        assert.deepEqual(
            refusedOf({ 'compact-req-coordinator': `${rawId}:note` }).map((refusal) => refusal.answer),
            [badIdAnswer(rawId)],
            `id ${JSON.stringify(rawId)}`,
        );
    }
});

test('a legacy compact id with a dot is taken, as before the protocol', () => {
    assert.deepEqual(
        takeFrom({ 'compact-req-coordinator': 'r.7:why' }).taken.map(({ id, value }) => ({ id, value })),
        [{ id: 'r.7', value: { id: 'r.7', note: 'why' } }],
    );
});

test('a request whose body breaks its grammar is neither taken nor refused', () => {
    assert.deepEqual(takeFrom({ 'handoff-req-alpha': 'r1' }), { taken: [], refused: [] });
});

test('an answer is the id and stage in the exchange answer token', () => {
    assert.deepEqual(unwrap(answer(handoffLike, idOf('r1'), 'running')), { name: 'tab-recap-handoff', value: 'r1:running' });
});

test('an answer that would exceed 80 characters is refused where the exchange does not truncate', () => {
    assert.equal(answer(handoffLike, idOf('r1'), 'x'.repeat(78)).kind, 'err');
});

test('a compact answer is truncated to 80 characters, as before the protocol', () => {
    const written = unwrap(answer(compactLike, unwrap(requestId('r1', 'legacy-length')), 'x'.repeat(78)));
    assert.equal(written.value, `r1:${'x'.repeat(78)}`.slice(0, 80));
});
