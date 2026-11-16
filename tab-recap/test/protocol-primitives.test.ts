import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExchangeName, parseExchangeVersion, parseRequestId, parseTokenName, parseTokenValue, parseToolName } from '#src/protocol/primitives.ts';

test('a token value of 80 characters is accepted and 81 is refused, never truncated', () => {
    assert.equal(parseTokenValue('x'.repeat(80)).kind, 'ok');
    assert.deepEqual(parseTokenValue('x'.repeat(81)), { kind: 'err', error: { reason: 'too-long', subject: 'TokenValue' } });
});

test('an empty token value is allowed', () => {
    assert.deepEqual(parseTokenValue(''), { kind: 'ok', value: '' });
});

test('a token name of 32 characters is accepted and 33 is refused', () => {
    assert.equal(parseTokenName('n'.repeat(32)).kind, 'ok');
    assert.deepEqual(parseTokenName('n'.repeat(33)), { kind: 'err', error: { reason: 'too-long', subject: 'TokenName' } });
});

test('a token name is refused when empty or outside its characters', () => {
    assert.deepEqual(parseTokenName(''), { kind: 'err', error: { reason: 'empty', subject: 'TokenName' } });
    assert.deepEqual(parseTokenName('tab.recap'), { kind: 'err', error: { reason: 'bad-characters', subject: 'TokenName' } });
});

test('a legacy request id may hold a dot, and is refused above 16 characters or with a colon', () => {
    assert.equal(parseRequestId('r.7', 'legacy-length').kind, 'ok');
    assert.equal(parseRequestId('r'.repeat(16), 'legacy-length').kind, 'ok');
    assert.deepEqual(parseRequestId('r'.repeat(17), 'legacy-length'), { kind: 'err', error: { reason: 'too-long', subject: 'RequestId' } });
    assert.deepEqual(parseRequestId('r:7', 'legacy-length'), { kind: 'err', error: { reason: 'bad-characters', subject: 'RequestId' } });
});

test('a token-safe request id refuses a dot', () => {
    assert.equal(parseRequestId('r_7-x', 'token-safe').kind, 'ok');
    assert.deepEqual(parseRequestId('r.7', 'token-safe'), { kind: 'err', error: { reason: 'bad-characters', subject: 'RequestId' } });
});

test('a tool name of 20 characters is accepted and 21 is refused', () => {
    assert.equal(parseToolName('t'.repeat(20)).kind, 'ok');
    assert.deepEqual(parseToolName('t'.repeat(21)), { kind: 'err', error: { reason: 'too-long', subject: 'ToolName' } });
});

test('an exchange name is lowercase, starts with a letter, and at most 16 characters', () => {
    assert.equal(parseExchangeName('handoff-2').kind, 'ok');
    assert.equal(parseExchangeName('a'.repeat(16)).kind, 'ok');
    assert.deepEqual(parseExchangeName('a'.repeat(17)), { kind: 'err', error: { reason: 'too-long', subject: 'ExchangeName' } });
    assert.deepEqual(parseExchangeName('Compact'), { kind: 'err', error: { reason: 'bad-characters', subject: 'ExchangeName' } });
    assert.deepEqual(parseExchangeName('2fa'), { kind: 'err', error: { reason: 'bad-characters', subject: 'ExchangeName' } });
});

test('an exchange version is an integer from 1 to 99', () => {
    assert.deepEqual(parseExchangeVersion(1), { kind: 'ok', value: 1 });
    assert.deepEqual(parseExchangeVersion(99), { kind: 'ok', value: 99 });
    assert.equal(parseExchangeVersion(0).kind, 'err');
    assert.equal(parseExchangeVersion(100).kind, 'err');
    assert.equal(parseExchangeVersion(1.5).kind, 'err');
});
