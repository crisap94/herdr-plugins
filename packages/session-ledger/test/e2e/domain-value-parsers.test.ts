import assert from 'node:assert/strict';
import { test } from 'node:test';
import { err, must, ok } from '@stateforge-labs/session-ledger';
import { parseCount, parsePositiveCount } from '@stateforge-labs/session-ledger';
import { parseIdleHold } from '@stateforge-labs/session-ledger';
import { parseProbability } from '@stateforge-labs/session-ledger';
import { parseNonEmptyText } from '@stateforge-labs/session-ledger';
import { parseDuration, parseInstant, parseMilliseconds } from '@stateforge-labs/session-ledger';
import { parseHarnessKind, parseScopeId, parseSessionKey, parseCompactionId, parseDecisionId, placementOf } from '@stateforge-labs/session-ledger';
import { parseTokenAmount } from '@stateforge-labs/session-ledger';
import { parseUsd } from '@stateforge-labs/session-ledger';
import { harness, key, scope } from '@stateforge-labs/session-ledger/testkit';

test('ok and err build tagged results, and must unwraps ok and throws on err', () => {
    assert.deepEqual(ok(3), { kind: 'ok', value: 3 });
    assert.deepEqual(err({ kind: 'empty' }), { kind: 'err', error: { kind: 'empty' } });
    assert.equal(must(ok(3)), 3);
    assert.throws(() => must(err({ kind: 'empty' })), /refused a load-time constant/);
});

test('a count is a safe whole number, zero or more', () => {
    assert.deepEqual(parseCount(0), ok(0));
    assert.deepEqual(parseCount(7), ok(7));
    for (const input of ['7', null, undefined]) {
        assert.deepEqual(parseCount(input), err({ kind: 'not-a-number' }));
    }
    for (const input of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.deepEqual(parseCount(input), err({ kind: 'not-an-integer' }));
    }
    for (const input of [-1, Number.MAX_SAFE_INTEGER + 1]) {
        assert.deepEqual(parseCount(input), err({ kind: 'out-of-range' }));
    }
});

test('a positive count refuses zero and passes the count failure through', () => {
    assert.deepEqual(parsePositiveCount(1), ok(1));
    assert.deepEqual(parsePositiveCount(0), err({ kind: 'out-of-range' }));
    assert.deepEqual(parsePositiveCount(-1), err({ kind: 'out-of-range' }));
    assert.deepEqual(parsePositiveCount(2.5), err({ kind: 'not-an-integer' }));
    assert.deepEqual(parsePositiveCount('1'), err({ kind: 'not-a-number' }));
});

test('milliseconds, instants and durations share one parse', () => {
    for (const parse of [parseMilliseconds, parseInstant, parseDuration]) {
        assert.deepEqual(parse(0), ok(0));
        assert.deepEqual(parse(1500), ok(1500));
        assert.deepEqual(parse(0.5), ok(0.5));
        for (const input of ['5', null, Number.NaN, Number.POSITIVE_INFINITY]) {
            assert.deepEqual(parse(input), err({ kind: 'not-a-number' }));
        }
        assert.deepEqual(parse(-1), err({ kind: 'out-of-range' }));
    }
});

test('a token amount is a finite number, zero or more, and NaN is out of range', () => {
    assert.deepEqual(parseTokenAmount(0), ok(0));
    assert.deepEqual(parseTokenAmount(12.5), ok(12.5));
    assert.deepEqual(parseTokenAmount('1'), err({ kind: 'not-a-number' }));
    for (const input of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.deepEqual(parseTokenAmount(input), err({ kind: 'out-of-range' }));
    }
});

test('a usd amount is any finite number, negative included', () => {
    for (const input of [0, 0.25, -3]) {
        assert.deepEqual(parseUsd(input), ok(input));
    }
    assert.deepEqual(parseUsd('1'), err({ kind: 'not-a-number' }));
    for (const input of [Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.deepEqual(parseUsd(input), err({ kind: 'out-of-range' }));
    }
});

test('a probability is a number from zero to one, anything else is null', () => {
    for (const input of [0, 0.5, 1]) {
        assert.equal(parseProbability(input), input);
    }
    for (const input of [-0.01, 1.01, Number.NaN, '0.5', null]) {
        assert.equal(parseProbability(input), null);
    }
});

test('only the exact word off turns the idle hold off', () => {
    assert.equal(parseIdleHold('off'), 'off');
    for (const input of ['on', 'OFF', '', undefined, 0]) {
        assert.equal(parseIdleHold(input), 'on');
    }
});

test('a non-empty text keeps its value untrimmed and refuses blank or non-string input', () => {
    assert.deepEqual(parseNonEmptyText('a'), ok('a'));
    assert.deepEqual(parseNonEmptyText(' a '), ok(' a '));
    assert.deepEqual(parseNonEmptyText(''), err({ kind: 'empty' }));
    assert.deepEqual(parseNonEmptyText('  \n'), err({ kind: 'empty' }));
    assert.deepEqual(parseNonEmptyText(5), err({ kind: 'not-a-string' }));
});

test('pane, tab and agent ids refuse blank and non-string input', () => {
    for (const parse of [parseSessionKey, parseScopeId, parseHarnessKind]) {
        assert.deepEqual(parse('p1'), ok('p1'));
        assert.deepEqual(parse(''), err({ kind: 'empty' }));
        assert.deepEqual(parse('   '), err({ kind: 'empty' }));
        assert.deepEqual(parse(7), err({ kind: 'not-a-string' }));
    }
});

test('decision and compaction ids accept an empty string but not a non-string', () => {
    for (const parse of [parseDecisionId, parseCompactionId]) {
        assert.deepEqual(parse('d1'), ok('d1'));
        assert.deepEqual(parse(''), ok(''));
        assert.deepEqual(parse(7), err({ kind: 'not-a-string' }));
    }
});

test('a placement names the scope, key and agent of a candidate and keeps the candidate', () => {
    const candidate = { scope: scope('tab-1'), key: key('pane-1'), harness: harness('claude'), ready: true };
    const placement = placementOf(candidate);
    assert.deepEqual(placement, { candidate, scope: 'tab-1', key: 'pane-1', agent: 'claude' });
    assert.equal(placement.candidate, candidate);
    const blankScope = { ...candidate, scope: '' as typeof candidate.scope };
    assert.throws(() => placementOf(blankScope), /refused a load-time constant/);
});
