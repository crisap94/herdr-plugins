import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    paneId,
    parseAgentKind,
    parsePaneId,
    parseSessionId,
    parseSessionPath,
    parseTabId,
    parseWorkspaceId,
    tabId,
} from '#src/recap/domain/ids.ts';

const PARSERS = [
    parsePaneId,
    parseTabId,
    parseWorkspaceId,
    parseSessionId,
    parseSessionPath,
    parseAgentKind,
];

const NOT_TEXT = [undefined, null, 1, true, {}, []];
const BLANK = ['', '   '];

test('every id parser accepts a non-empty string and keeps its value', () => {
    for (const parse of PARSERS) {
        assert.deepEqual(parse('w1:t3'), { kind: 'ok', value: 'w1:t3' });
    }
});

test('every id parser refuses a blank string with the empty failure', () => {
    for (const parse of PARSERS) {
        for (const input of BLANK) {
            assert.deepEqual(parse(input), { kind: 'err', error: { kind: 'empty' } });
        }
    }
});

test('every id parser refuses a non-string with the not-a-string failure', () => {
    for (const parse of PARSERS) {
        for (const input of NOT_TEXT) {
            assert.deepEqual(parse(input), { kind: 'err', error: { kind: 'not-a-string' } });
        }
    }
});

test('every id parser never throws, whatever the input', () => {
    const hostile = { toString: (): never => { throw new Error('boom'); } };
    for (const parse of PARSERS) {
        assert.doesNotThrow(() => parse(hostile));
    }
});

test('a parsed pane id is the same value the throwing constructor makes', () => {
    const parsed = parsePaneId('w1:t3');
    assert.equal(parsed.kind === 'ok' && parsed.value, paneId('w1:t3'));
});

test('a parsed tab id is the same value the throwing constructor makes', () => {
    const parsed = parseTabId('w1:t3');
    assert.equal(parsed.kind === 'ok' && parsed.value, tabId('w1:t3'));
});

test('the throwing constructors keep throwing on an empty id', () => {
    assert.throws(() => paneId(''), { name: 'NotAnIdentifierError' });
});
