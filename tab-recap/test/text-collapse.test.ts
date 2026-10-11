import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collapsedText } from '#src/recap/domain/text-collapse.ts';
import { plainText } from '#src/recap/domain/coordination.ts';
import { requestNoteOf } from '#src/recap/application/compact-start.ts';

test('space turns every control character into a space and collapses the runs', () => {
    assert.equal(collapsedText('a\tb\u001b[31mred\u0007 x', 'space'), 'a b [31mred x');
    assert.equal(collapsedText('line one\r\nline two', 'space'), 'line one line two');
});

test('remove drops a control character that is not whitespace and spaces the whitespace one', () => {
    assert.equal(collapsedText('a\tb\u001b[31mred\u0007 x', 'remove'), 'a b[31mred x');
    assert.equal(collapsedText('keep\u0000\u009b this', 'remove'), 'keep this');
});

test('the request note and the token text both use it', () => {
    assert.equal(requestNoteOf('a\tb\u001b[31mred\u0007 x'), 'a b[31mred x');
    assert.equal(plainText('  x\u0007\u0007 y  '), 'x y');
});
