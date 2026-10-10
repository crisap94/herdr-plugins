import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observe, request } from '#src/protocol/requester.ts';
import type { Observation } from '#src/protocol/requester.ts';
import { answer, take } from '#src/protocol/responder.ts';
import type { SeenCheck, Taken } from '#src/protocol/responder.ts';
import { requestId } from '#src/protocol/primitives.ts';
import type { ExchangeName, RequestId, ToolName } from '#src/protocol/primitives.ts';
import type { Registry } from '#src/protocol/registry.ts';
import { handoffLike, parsedOf, registryOf, toolOf, unwrap } from './fakes/protocol-exchanges.ts';
import { FakeTokenMap } from './fakes/token-map.ts';

const registry: Registry = registryOf([handoffLike]);

const requestToken = 'handoff-req-alpha';

const answerToken = 'tab-recap-handoff';

const idOf = (raw: string): RequestId => unwrap(requestId(raw, 'token-safe'));

const ask = (map: FakeTokenMap, raw: string): void => {
    map.apply(unwrap(request(handoffLike, toolOf('alpha'), parsedOf(handoffLike, raw))));
};

const observeAs = (map: FakeTokenMap, raw: string): Observation => unwrap(observe(handoffLike, map.snapshot(), idOf(raw)));

const keyOf = (exchange: ExchangeName, tool: ToolName, id: RequestId): string => `${exchange}\u0000${tool}\u0000${id}`;

const ledger = (): { readonly seen: SeenCheck; readonly remember: (taken: readonly Taken[]) => void } => {
    const remembered = new Set<string>();
    const seen: SeenCheck = (exchange, tool, id) => remembered.has(keyOf(exchange, tool, id));
    const remember = (taken: readonly Taken[]): void => {
        for (const { exchange, tool, id } of taken) {
            remembered.add(keyOf(exchange.name, tool, id));
        }
    };
    return { seen, remember };
};

test('a request rewritten with no event is taken by the next read of the map', () => {
    const map = new FakeTokenMap();
    ask(map, 'r1:beta');
    const eventsBefore = map.events.length;
    map.rewriteUnchangedNoEvent(requestToken, 'r2:beta');
    assert.equal(map.events.length, eventsBefore);
    const { taken } = take(registry, map.snapshot(), ledger().seen);
    assert.deepEqual(taken.map((item) => item.id), ['r2']);
});

test('a collapsed burst of answers is observed as its last stage, from one event', () => {
    const map = new FakeTokenMap();
    map.collapseBurst(answerToken, ['r1:queued', 'r1:running', 'r1:done']);
    assert.equal(map.events.length, 1);
    assert.deepEqual(observeAs(map, 'r1'), { kind: 'done' });
});

test('a time-to-live expiry is an event, and the requester reads not-seen rather than inferring', () => {
    const map = new FakeTokenMap();
    map.write(answerToken, 'r1:done');
    assert.deepEqual(observeAs(map, 'r1'), { kind: 'done' });
    map.expire(answerToken);
    assert.deepEqual(map.events.at(-1), { name: answerToken, value: null });
    assert.deepEqual(observeAs(map, 'r1'), { kind: 'not-seen' });
});

test('a request cleared before the take is not taken', () => {
    const map = new FakeTokenMap();
    ask(map, 'r1:beta');
    map.clear(requestToken);
    assert.deepEqual(take(registry, map.snapshot(), ledger().seen), { taken: [], refused: [] });
});

test('an answer for another id is foreign, and the requester keeps waiting for its own', () => {
    const map = new FakeTokenMap();
    map.write(answerToken, 'b2:done');
    assert.deepEqual(observeAs(map, 'a1'), { kind: 'foreign-id', id: 'b2' });
    map.write(answerToken, 'a1:running');
    assert.deepEqual(observeAs(map, 'a1'), { kind: 'running' });
});

test('after a restart a request already taken is not taken again when the ledger survived', () => {
    const map = new FakeTokenMap();
    const survived = ledger();
    ask(map, 'r1:beta');
    const first = take(registry, map.snapshot(), survived.seen);
    survived.remember(first.taken);
    map.apply([unwrap(answer(handoffLike, idOf('r1'), 'queued'))]);
    assert.equal(first.taken.length, 1);
    assert.deepEqual(take(registry, map.snapshot(), survived.seen), { taken: [], refused: [] });
});

test('a requester, a responder and the answer stages move one request from queued to done', () => {
    const map = new FakeTokenMap();
    const responder = ledger();
    ask(map, 'r1:beta');
    const taken = take(registry, map.snapshot(), responder.seen);
    responder.remember(taken.taken);
    const [first] = taken.taken;
    assert.ok(first !== undefined);
    for (const stage of ['queued', 'running', 'done'] as const) {
        map.apply([unwrap(answer(handoffLike, first.id, stage))]);
        assert.deepEqual(observeAs(map, 'r1'), { kind: stage });
    }
});
