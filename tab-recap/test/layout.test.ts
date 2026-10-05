import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgePane, moveFor, parentSplit, targetCols } from '#src/recap/domain/layout.ts';

const rect = (x: number, y: number, width: number, height: number): { x: number; y: number; width: number; height: number } => ({ x, y, width, height });

test('a side column splits the pane on the right edge, tallest first', () => {
    const chosen = edgePane([
        { paneId: 'left', rect: rect(0, 0, 100, 50) },
        { paneId: 'right-top', rect: rect(101, 0, 88, 20) },
        { paneId: 'right-tall', rect: rect(101, 21, 88, 33) },
    ], 'right');
    assert.equal(chosen?.paneId, 'right-tall');
});

test('a bar docks on the bottom edge: the lowest pane, widest first', () => {
    const chosen = edgePane([
        { paneId: 'top', rect: rect(0, 0, 55, 30) },
        { paneId: 'bottom-left', rect: rect(0, 31, 20, 19) },
        { paneId: 'bottom-wide', rect: rect(21, 31, 34, 19) },
    ], 'down');
    assert.equal(chosen?.paneId, 'bottom-wide');
    assert.equal(edgePane([{ paneId: 'only', rect: rect(0, 0, 55, 50) }], 'down')?.paneId, 'only');
});

test('the width follows the fraction, inside the bounds', () => {
    const sizing = { fraction: 0.3, minCols: 36, maxCols: 64 };
    assert.equal(targetCols(189, sizing), 57);
    assert.equal(targetCols(100, sizing), 36);
    assert.equal(targetCols(400, sizing), 64);
});

test('moving the divider right narrows a side column, measured on herdr 0.9.0', () => {
    const split = { direction: 'right', ratio: 0.5, rect: rect(0, 0, 189, 54) };
    const move = moveFor(split, 57, 'right');
    assert.ok(move !== null);
    assert.equal(move.direction, 'right');
    assert.ok(Math.abs(move.amount - (1 - 57 / 189 - 0.5)) < 1e-9);
    assert.equal(moveFor({ ...split, ratio: 1 - 57 / 189 }, 57, 'right'), null, 'already there: no move');
});

test('a bottom bar is the SECOND child of a down-split: moving the divider down shortens it', () => {
    const move = moveFor({ direction: 'down', ratio: 0.5, rect: rect(0, 0, 57, 24) }, 3, 'down');
    assert.ok(move !== null);
    assert.equal(move.direction, 'down');
    assert.ok(Math.abs(move.amount - (1 - 3 / 24 - 0.5)) < 1e-9);
    const tall = moveFor({ direction: 'down', ratio: 0.5, rect: rect(0, 0, 189, 53) }, 1, 'down');
    assert.ok(tall !== null && Math.abs(tall.amount - (0.95 - 0.5)) < 1e-9, 'the divider never goes past 0.95 of the height');
    assert.equal(moveFor({ direction: 'down', ratio: 1 - 3 / 24, rect: rect(0, 0, 57, 24) }, 3, 'down'), null, 'already there: no move');
});

test('the bottom bar divider is the down-split whose bottom edge is the bar bottom edge', () => {
    const found = parentSplit([
        { direction: 'down', ratio: 0.9, rect: rect(0, 0, 57, 24) },
        { direction: 'right', ratio: 0.5, rect: rect(0, 0, 57, 24) },
        { direction: 'down', ratio: 0.5, rect: rect(0, 0, 57, 12) },
    ], rect(0, 21, 57, 3), 'down');
    assert.ok(found !== null);
    assert.equal(found.direction, 'down');
    assert.equal(found.rect.height, 24, 'the innermost down-split that ends where the bar ends');
});

test('the divider to move is the innermost split along the axis, ending at the column', () => {
    const column = rect(140, 0, 49, 54);
    const found = parentSplit([
        { direction: 'right', ratio: 0.5, rect: rect(0, 0, 189, 54) },
        { direction: 'right', ratio: 0.5, rect: rect(95, 0, 94, 54) },
        { direction: 'down', ratio: 0.5, rect: rect(95, 0, 94, 54) },
    ], column, 'right');
    assert.equal(found?.rect.x, 95);
});
