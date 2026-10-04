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

test('a bar docks on the top edge: the topmost pane, widest first', () => {
    const chosen = edgePane([
        { paneId: 'top-left', rect: rect(0, 0, 20, 30) },
        { paneId: 'top-wide', rect: rect(21, 0, 34, 30) },
        { paneId: 'bottom', rect: rect(0, 31, 55, 19) },
    ], 'up');
    assert.equal(chosen?.paneId, 'top-wide');
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

test('after the swap the bar is the FIRST child: moving the divider up shortens it', () => {
    const move = moveFor({ direction: 'down', ratio: 0.5, rect: rect(0, 0, 57, 24) }, 3, 'up');
    assert.ok(move !== null);
    assert.equal(move.direction, 'up');
    assert.ok(Math.abs(move.amount - (0.5 - 3 / 24)) < 1e-9);
    const tall = moveFor({ direction: 'down', ratio: 0.5, rect: rect(0, 0, 189, 53) }, 3, 'up');
    assert.ok(tall !== null && Math.abs(tall.amount - 0.4) < 1e-9, "herdr's floor is 0.1 of the height");
});

test('the top bar divider is the down-split whose top edge is the bar top edge', () => {
    const found = parentSplit([
        { direction: 'down', ratio: 0.5, rect: rect(0, 0, 57, 24) },
        { direction: 'right', ratio: 0.5, rect: rect(0, 0, 57, 24) },
    ], rect(0, 0, 57, 3), 'up');
    assert.equal(found?.direction, 'down');
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
