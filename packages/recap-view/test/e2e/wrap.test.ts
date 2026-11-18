import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coloured, elapsed, plain, plainMarkdown, visibleLength, wrap } from '@stateforge-labs/recap-view/unstable/wrap.ts';

test('wrap breaks words onto lines no wider than the width', () => {
    assert.deepEqual(wrap('one two three', 8), ['one two', 'three']);
    assert.deepEqual(wrap('', 10), ['']);
});

test('wrap cuts a word wider than the line into pieces', () => {
    assert.deepEqual(wrap('abcdefghijklmnop', 8), ['abcdefgh', 'ijklmnop']);
});

test('visibleLength counts terminal cells', () => {
    assert.equal(visibleLength('abc'), 3);
});

test('plain styles leave the text as it is and coloured keeps it', () => {
    assert.equal(plain.bold('x'), 'x');
    assert.ok(coloured.red('x').includes('x'));
});

test('plainMarkdown turns headings into upper case and bullets into dots', () => {
    assert.deepEqual(plainMarkdown('# Title\n\n- item', 40, plain), ['TITLE', '', '• item']);
});

test('elapsed reports the largest whole unit', () => {
    assert.deepEqual(elapsed(4000), { amount: 4, unit: 's' });
    assert.deepEqual(elapsed(120_000), { amount: 2, unit: 'min' });
    assert.deepEqual(elapsed(7_200_000), { amount: 2, unit: 'h' });
    assert.deepEqual(elapsed(172_800_000), { amount: 2, unit: 'd' });
});
