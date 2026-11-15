import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type Cursor, type Frame, type Height, type Line, parseCursor, parseHeight, parseLine, screen } from '@stateforge-labs/recap-view';

function lineOf(text: string): Line {
    const read = parseLine(text);
    if (read.kind === 'err') {
        throw new Error(read.error);
    }
    return read.value;
}

function heightOf(value: number): Height {
    const read = parseHeight(value);
    if (read.kind === 'err') {
        throw new Error(read.error);
    }
    return read.value;
}

function cursorOf(value: number): Cursor {
    const read = parseCursor(value);
    if (read.kind === 'err') {
        throw new Error(read.error);
    }
    return read.value;
}

function frameOf(count: number): Frame {
    return Array.from({ length: count }, (_, index) => lineOf(`l${index}`));
}

test('a frame shorter than the room is padded with blank lines to height minus one', () => {
    const result = screen(frameOf(2), heightOf(6), cursorOf(0));
    assert.deepEqual(result.lines, ['l0', 'l1', '', '', '']);
    assert.equal(result.cursor, 0);
});

test('a cursor past the end is clamped to the length minus the room', () => {
    const result = screen(frameOf(10), heightOf(5), cursorOf(20));
    assert.deepEqual(result.lines, ['l6', 'l7', 'l8', 'l9']);
    assert.equal(result.cursor, 6);
});

test('a negative cursor gives the top of the frame', () => {
    const result = screen(frameOf(10), heightOf(5), cursorOf(-3));
    assert.deepEqual(result.lines, ['l0', 'l1', 'l2', 'l3']);
    assert.equal(result.cursor, 0);
});

test('a height below three gives a room of two lines', () => {
    const result = screen(frameOf(3), heightOf(1), cursorOf(0));
    assert.deepEqual(result.lines, ['l0', 'l1']);
});

test('the parsers reject non-integers, non-numbers and non-strings', () => {
    assert.deepEqual(parseHeight(1.5), { kind: 'err', error: 'not-a-whole-number' });
    assert.deepEqual(parseCursor(1.5), { kind: 'err', error: 'not-a-whole-number' });
    assert.deepEqual(parseHeight('x'), { kind: 'err', error: 'not-a-whole-number' });
    assert.deepEqual(parseLine(3), { kind: 'err', error: 'not-a-string' });
    assert.deepEqual(parseLine('x'), { kind: 'ok', value: 'x' });
});
