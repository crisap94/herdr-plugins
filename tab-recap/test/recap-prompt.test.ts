import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARGV_BYTES, argvPrompt, fitBytes, prompt } from '#src/adapters/recap-prompt.ts';
import type { Entry } from '#src/ports/transcripts.ts';
import { requestOf } from '#test/support.ts';

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

test('an argv prompt is bounded: whole oldest turns are dropped, the instructions and the ledger are not, and the markup stays whole', () => {
    const entries = Array.from({ length: 200 }, (_, i): Entry => ({ role: 'agent', text: `turn ${i}: ${'日'.repeat(1500)}` }));
    const request = requestOf({ entries, ledgers: [{ task: null, facts: [{ id: 'f1', section: 'goal', text: 'PREV-RECAP', state: 'open', first: 1, last: 1, why: null, ref: null, anchor: null, agent: null, closed: null }] }] });
    assert.ok(Buffer.byteLength(prompt(request)) > ARGV_BYTES, 'the full document would not fit');
    const text = argvPrompt(request);
    assert.ok(Buffer.byteLength(text) <= ARGV_BYTES);
    assert.ok(text.includes('PREV-RECAP') && text.includes('Operations on the ledger') && text.includes('turn 199:'));
    assert.ok(!text.includes('turn 0:'));
    const turns = text.match(/<turn /g)?.length ?? 0;
    assert.equal(turns, text.match(/<\/turn>/g)?.length, 'no turn is cut in half');
    assert.match(text, /omitted="\d+"/, 'the writer is told how many turns were left out');
});
