import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerToken, answerValue, defineExchange, parseRequest, requestName, serializeRequest } from '#src/protocol/exchange.ts';
import type { Exchange } from '#src/protocol/exchange.ts';
import { buildRegistry } from '#src/protocol/registry.ts';
import type { RegistryRefusal } from '#src/protocol/registry.ts';
import { parseAnswerStage, parseExchangeName, parseExchangeVersion, parseFieldName, parseIdText, parseRequestId, parseRequestPrefix, parseTokenName, parseTokenValue, parseToolName } from '#src/protocol/primitives.ts';
import { must } from '#src/protocol/result.ts';
import type { AnswerStage, RequestId, RequestPrefix, TokenName } from '#src/protocol/primitives.ts';
import type { Result } from '#src/protocol/result.ts';
import { compact } from '#src/protocol/exchanges/compact.ts';

const brand = <T, E>(result: Result<T, E>): T => {
    if (result.kind === 'err') {
        throw new Error(`refused: ${JSON.stringify(result.error)}`);
    }
    return result.value;
};

const prefixed = (raw: string): RequestPrefix => brand(parseRequestPrefix(raw));

const stage = (raw: string): AnswerStage => brand(parseAnswerStage(raw));

const probe = (raw: string, over: Partial<Exchange> = {}): Exchange => defineExchange({
    name: brand(parseExchangeName(raw)),
    version: brand(parseExchangeVersion(1)),
    requestPrefix: prefixed('probe-req-'),
    request: [{ kind: 'id', grammar: 'token-safe' }],
    answerStages: ['queued', 'running', 'done'].map(stage),
    failureReasons: ['bad-id', 'interrupted'],
    events: [],
    optIn: null,
    timing: {},
    answerFit: 'whole',
    ...over,
});

const names = (raws: readonly string[]): readonly TokenName[] => raws.map((raw) => brand(parseTokenName(raw)));

const refused = (result: Result<unknown, RegistryRefusal>): RegistryRefusal => {
    if (result.kind === 'ok') {
        throw new Error('the registry was built');
    }
    return result.error;
};

test('a registry of distinct exchanges lists the fixed names and one answer token per exchange', () => {
    const built = brand(buildRegistry([probe('probe'), probe('other-x', { requestPrefix: prefixed('other-req-') })], names(['status'])));
    assert.deepEqual(built.ownNames, ['status', 'tab-recap-probe', 'tab-recap-other-x']);
});

test('two exchanges sharing a name are refused', () => {
    const result = buildRegistry([probe('probe'), probe('probe', { requestPrefix: prefixed('other-req-') })], []);
    assert.deepEqual(refused(result), { reason: 'duplicate-name', detail: 'probe' });
});

test('two exchanges sharing a request prefix are refused', () => {
    const result = buildRegistry([probe('probe'), probe('other-x')], []);
    assert.deepEqual(refused(result), { reason: 'duplicate-prefix', detail: 'probe-req-' });
});

test('a request prefix that lets a 20-character tool name pass 32 characters is refused, 12 is accepted', () => {
    const tooLong = buildRegistry([probe('probe', { requestPrefix: prefixed('probe-req-xyz') })], []);
    assert.deepEqual(refused(tooLong), { reason: 'name-too-long', detail: 'probe' });
    assert.equal(buildRegistry([probe('probe', { requestPrefix: prefixed('compact-req-') })], []).kind, 'ok');
});

test('an exchange that does not declare the restart reason interrupted is refused: a restart answers every exchange with it', () => {
    assert.deepEqual(refused(buildRegistry([probe('probe', { failureReasons: ['bad-id'] })], [])), { reason: 'missing-interrupted', detail: 'probe' });
    assert.equal(buildRegistry([probe('probe', { failureReasons: ['bad-id', 'interrupted'] })], []).kind, 'ok');
});

test('a derived answer longer than 80 characters is refused, unless the exchange truncates it', () => {
    const longStage = { answerStages: [stage('x'.repeat(64))] };
    assert.deepEqual(refused(buildRegistry([probe('probe', longStage)], [])), { reason: 'value-too-long', detail: 'probe' });
    assert.equal(buildRegistry([probe('probe', { answerStages: [stage('x'.repeat(63))] })], []).kind, 'ok');
    assert.equal(buildRegistry([probe('probe', { ...longStage, answerFit: 'truncate' })], []).kind, 'ok');
});

test('a registry whose own names exceed ten per pane is refused, and ten is accepted', () => {
    const fixed = names(Array.from({ length: 9 }, (_, at) => `fixed-${at}`));
    assert.equal(buildRegistry([probe('probe')], fixed).kind, 'ok');
    const result = buildRegistry([probe('probe'), probe('other-x', { requestPrefix: prefixed('other-req-') })], fixed);
    assert.deepEqual(refused(result), { reason: 'too-many-own-names', detail: '11 names, at most 10 per pane' });
});

test('the answer token and request names derive from the exchange', () => {
    const exchange = probe('probe');
    assert.deepEqual(brand(answerToken(exchange)), 'tab-recap-probe');
    assert.deepEqual(brand(requestName(exchange, brand(parseToolName('coordinator')))), 'probe-req-coordinator');
});

test('a truncating exchange answers exactly as the compaction answer did', () => {
    const exchange = probe('compact', { request: [{ kind: 'id', grammar: 'legacy-length' }], answerFit: 'truncate' });
    const id: RequestId = brand(parseRequestId('r.7', 'legacy-length'));
    const failed = 'failed-' + 'z'.repeat(90);
    assert.equal(brand(answerValue(exchange, parseIdText(id), failed)), brand(answerValue(compact, parseIdText('r.7'), failed)));
});

test('a refusing exchange refuses a value longer than 80 characters instead of truncating it', () => {
    const exchange = probe('probe');
    const id = brand(parseRequestId('r_7', 'token-safe'));
    assert.deepEqual(answerValue(exchange, parseIdText(id), 'x'.repeat(80)), { kind: 'err', error: { reason: 'too-long', subject: 'TokenValue' } });
});

test('a request is parsed and serialized by its exchange descriptor', () => {
    const exchange = probe('probe', {
        request: [{ kind: 'id', grammar: 'token-safe' }, { kind: 'word', name: must(parseFieldName('tool')), presence: 'required' }],
    });
    const parsed = parseRequest(exchange, must(parseTokenValue('r_7:coordinator')));
    assert.deepEqual(parsed, { kind: 'ok', value: { id: brand(parseRequestId('r_7', 'token-safe')), tool: 'coordinator' } });
    if (parsed.kind === 'ok') {
        assert.deepEqual(serializeRequest(exchange, parsed.value), { kind: 'ok', value: 'r_7:coordinator' });
    }
});

test('a request prefix that is a prefix of another exchange\'s prefix is refused, so the longest-match rule is never needed', () => {
    const result = buildRegistry([probe('probe'), probe('other-x', { requestPrefix: prefixed('probe-req-deep-') })], []);
    assert.deepEqual(refused(result), { reason: 'prefix-overlap', detail: 'probe-req-' });
});
