import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerToken, answerValue, defineExchange, parseRequest, requestName, serializeRequest } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { buildRegistry } from '#src/protocol/registry.ts';
import type { RegistryRefusal } from '#src/protocol/registry.ts';
import { exchangeName, exchangeVersion, requestId, tokenName, toolName } from '#src/protocol/primitives.ts';
import type { RequestId, TokenName } from '#src/protocol/primitives.ts';
import type { Result } from '#src/protocol/result.ts';
import { answerValue as compactAnswerValue } from '#src/recap/domain/compact-request.ts';

const brand = <T, E>(result: Result<T, E>): T => {
    if (result.kind === 'err') {
        throw new Error(`refused: ${JSON.stringify(result.error)}`);
    }
    return result.value;
};

const probe = (raw: string, over: Partial<Exchange> = {}): Exchange => defineExchange({
    name: brand(exchangeName(raw)),
    version: brand(exchangeVersion(1)),
    requestPrefix: 'probe-req-',
    request: [{ kind: 'id', grammar: 'token-safe' }],
    answerStages: ['queued', 'running', 'done'],
    failureReasons: ['bad-id'],
    events: [],
    optIn: null,
    timing: {},
    truncatesAnswer: false,
    ...over,
});

const names = (raws: readonly string[]): readonly TokenName[] => raws.map((raw) => brand(tokenName(raw)));

const refused = (result: Result<unknown, RegistryRefusal>): RegistryRefusal => {
    if (result.kind === 'ok') {
        throw new Error('the registry was built');
    }
    return result.error;
};

test('a registry of distinct exchanges lists the fixed names and one answer token per exchange', () => {
    const built = brand(buildRegistry([probe('probe'), probe('other-x', { requestPrefix: 'other-req-' })], names(['status'])));
    assert.deepEqual(built.ownNames, ['status', 'tab-recap-probe', 'tab-recap-other-x']);
});

test('two exchanges sharing a name are refused', () => {
    const result = buildRegistry([probe('probe'), probe('probe', { requestPrefix: 'other-req-' })], []);
    assert.deepEqual(refused(result), { reason: 'duplicate-name', detail: 'probe' });
});

test('two exchanges sharing a request prefix are refused', () => {
    const result = buildRegistry([probe('probe'), probe('other-x')], []);
    assert.deepEqual(refused(result), { reason: 'duplicate-prefix', detail: 'probe-req-' });
});

test('a request prefix that lets a 20-character tool name pass 32 characters is refused, 12 is accepted', () => {
    const tooLong = buildRegistry([probe('probe', { requestPrefix: 'probe-req-xyz' })], []);
    assert.deepEqual(refused(tooLong), { reason: 'name-too-long', detail: 'probe' });
    assert.equal(buildRegistry([probe('probe', { requestPrefix: 'compact-req-' })], []).kind, 'ok');
});

test('a derived answer longer than 80 characters is refused, unless the exchange truncates it', () => {
    const longStage = { answerStages: ['x'.repeat(64)] };
    assert.deepEqual(refused(buildRegistry([probe('probe', longStage)], [])), { reason: 'value-too-long', detail: 'probe' });
    assert.equal(buildRegistry([probe('probe', { answerStages: ['x'.repeat(63)] })], []).kind, 'ok');
    assert.equal(buildRegistry([probe('probe', { ...longStage, truncatesAnswer: true })], []).kind, 'ok');
});

test('a registry whose own names exceed ten per pane is refused, and ten is accepted', () => {
    const fixed = names(Array.from({ length: 9 }, (_, at) => `fixed-${at}`));
    assert.equal(buildRegistry([probe('probe')], fixed).kind, 'ok');
    const result = buildRegistry([probe('probe'), probe('other-x', { requestPrefix: 'other-req-' })], fixed);
    assert.deepEqual(refused(result), { reason: 'too-many-own-names', detail: '11 names, at most 10 per pane' });
});

test('the answer token and request names derive from the exchange', () => {
    const exchange = probe('probe');
    assert.deepEqual(brand(answerToken(exchange)), 'tab-recap-probe');
    assert.deepEqual(brand(requestName(exchange, brand(toolName('coordinator')))), 'probe-req-coordinator');
});

test('a truncating exchange answers exactly as the compaction answer did', () => {
    const exchange = probe('compact', { request: [{ kind: 'id', grammar: 'legacy-length' }], truncatesAnswer: true });
    const id: RequestId = brand(requestId('r.7', 'legacy-length'));
    const stage = 'failed-' + 'z'.repeat(90);
    assert.equal(brand(answerValue(exchange, id, stage)), compactAnswerValue('r.7', stage));
});

test('a refusing exchange refuses a value longer than 80 characters instead of truncating it', () => {
    const exchange = probe('probe');
    const id = brand(requestId('r_7', 'token-safe'));
    assert.deepEqual(answerValue(exchange, id, 'x'.repeat(80)), { kind: 'err', error: { reason: 'too-long', subject: 'TokenValue' } });
});

test('a request is parsed and serialized by its exchange descriptor', () => {
    const exchange = probe('probe', {
        request: [{ kind: 'id', grammar: 'token-safe' }, { kind: 'word', name: 'tool', optional: false }],
    });
    const parsed = parseRequest(exchange, 'r_7:coordinator');
    assert.deepEqual(parsed, { kind: 'ok', value: { id: brand(requestId('r_7', 'token-safe')), tool: 'coordinator' } });
    if (parsed.kind === 'ok') {
        assert.deepEqual(serializeRequest(exchange, parsed.value), { kind: 'ok', value: 'r_7:coordinator' });
    }
});
