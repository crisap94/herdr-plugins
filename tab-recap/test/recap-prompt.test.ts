import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARGV_BYTES, argvPrompt, fitBytes } from '#src/adapters/recap-prompt.ts';

test('fitBytes keeps what fits, drops the OLDEST lines first, and counts bytes not characters', () => {
    assert.equal(fitBytes('a\nb', 10), 'a\nb');
    assert.equal(fitBytes('old\nmid\nnew', 7), 'mid\nnew');
    const accented = Array.from({ length: 100 }, (_, i) => `línea ${i} ñandú`).join('\n');
    const fitted = fitBytes(accented, 500);
    assert.ok(Buffer.byteLength(fitted) <= 500);
    assert.ok(fitted.endsWith('línea 99 ñandú'), 'the newest line survives');
});

test('fitBytes: one overlong multibyte line loses its head, never a half character', () => {
    const fitted = fitBytes('日本語'.repeat(100), 100);
    assert.ok(Buffer.byteLength(fitted) <= 100);
    assert.ok(!fitted.includes('�'));
    assert.equal(fitBytes('x', 0), '');
});

test('an argv prompt is bounded: the excerpt is trimmed, the instructions and the previous recap are not', () => {
    const excerpt = Array.from({ length: 20_000 }, (_, i) => `turn ${i}: ${'é'.repeat(20)}`).join('\n');
    const prompt = argvPrompt({ previous: 'PREV-RECAP', excerpt, words: 450, language: 'en', previousLanguage: 'en', lanes: ['claude in w1:p1'] });
    assert.ok(Buffer.byteLength(prompt) <= ARGV_BYTES);
    assert.ok(prompt.includes('PREV-RECAP') && prompt.includes('## Goal') && prompt.includes('turn 19999'));
    assert.ok(!prompt.includes('turn 0:'));
});
