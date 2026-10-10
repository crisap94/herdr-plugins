import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeName, exchangeVersion, requestId, tokenName, tokenValue, toolName } from '#src/protocol/primitives.ts';

test('a token value of 80 characters is accepted and 81 is refused, never truncated', () => {
    assert.equal(tokenValue('x'.repeat(80)).kind, 'ok');
    assert.deepEqual(tokenValue('x'.repeat(81)), { kind: 'err', error: { reason: 'too-long', subject: 'TokenValue' } });
});

test('an empty token value is allowed', () => {
    assert.deepEqual(tokenValue(''), { kind: 'ok', value: '' });
});

test('a token name of 32 characters is accepted and 33 is refused', () => {
    assert.equal(tokenName('n'.repeat(32)).kind, 'ok');
    assert.deepEqual(tokenName('n'.repeat(33)), { kind: 'err', error: { reason: 'too-long', subject: 'TokenName' } });
});

test('a token name is refused when empty or outside its characters', () => {
    assert.deepEqual(tokenName(''), { kind: 'err', error: { reason: 'empty', subject: 'TokenName' } });
    assert.deepEqual(tokenName('tab.recap'), { kind: 'err', error: { reason: 'bad-characters', subject: 'TokenName' } });
});

test('a legacy request id may hold a dot, and is refused above 16 characters or with a colon', () => {
    assert.equal(requestId('r.7', 'legacy-length').kind, 'ok');
    assert.equal(requestId('r'.repeat(16), 'legacy-length').kind, 'ok');
    assert.deepEqual(requestId('r'.repeat(17), 'legacy-length'), { kind: 'err', error: { reason: 'too-long', subject: 'RequestId' } });
    assert.deepEqual(requestId('r:7', 'legacy-length'), { kind: 'err', error: { reason: 'bad-characters', subject: 'RequestId' } });
});

test('a token-safe request id refuses a dot', () => {
    assert.equal(requestId('r_7-x', 'token-safe').kind, 'ok');
    assert.deepEqual(requestId('r.7', 'token-safe'), { kind: 'err', error: { reason: 'bad-characters', subject: 'RequestId' } });
});

test('a tool name of 20 characters is accepted and 21 is refused', () => {
    assert.equal(toolName('t'.repeat(20)).kind, 'ok');
    assert.deepEqual(toolName('t'.repeat(21)), { kind: 'err', error: { reason: 'too-long', subject: 'ToolName' } });
});

test('an exchange name is lowercase, starts with a letter, and at most 16 characters', () => {
    assert.equal(exchangeName('handoff-2').kind, 'ok');
    assert.equal(exchangeName('a'.repeat(16)).kind, 'ok');
    assert.deepEqual(exchangeName('a'.repeat(17)), { kind: 'err', error: { reason: 'too-long', subject: 'ExchangeName' } });
    assert.deepEqual(exchangeName('Compact'), { kind: 'err', error: { reason: 'bad-characters', subject: 'ExchangeName' } });
    assert.deepEqual(exchangeName('2fa'), { kind: 'err', error: { reason: 'bad-characters', subject: 'ExchangeName' } });
});

test('an exchange version is an integer from 1 to 99', () => {
    assert.deepEqual(exchangeVersion(1), { kind: 'ok', value: 1 });
    assert.deepEqual(exchangeVersion(99), { kind: 'ok', value: 99 });
    assert.equal(exchangeVersion(0).kind, 'err');
    assert.equal(exchangeVersion(100).kind, 'err');
    assert.equal(exchangeVersion(1.5).kind, 'err');
});
