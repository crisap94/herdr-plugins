import { textOf } from '@stateforge-labs/session-ledger';
import { countOf } from '@stateforge-labs/session-ledger';
import { instant } from '@stateforge-labs/session-ledger';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARGV_BYTES, argvText, fitText, promptText } from '#src/adapters/job/prompts/recap-prompt.ts';
import type { Entry } from '@stateforge-labs/session-ledger';
import { requestOf } from '#test/support.ts';

test('fitBytes keeps what fits, drops the OLDEST lines first, and counts bytes not characters', () => {
    assert.equal(fitText(textOf('a\nb'), countOf(10)), 'a\nb');
    assert.equal(fitText(textOf('old\nmid\nnew'), countOf(7)), 'mid\nnew');
    const accented = Array.from({ length: 100 }, (_, i) => `línea ${i} ñandú`).join('\n');
    const fitted = fitText(textOf(accented), countOf(500));
    assert.ok(Buffer.byteLength(fitted) <= 500);
    assert.ok(fitted.endsWith('línea 99 ñandú'), 'the newest line survives');
});

test('fitBytes: one overlong multibyte line loses its head, never a half character', () => {
    const fitted = fitText(textOf('日本語'.repeat(100)), countOf(100));
    assert.ok(Buffer.byteLength(fitted) <= 100);
    assert.ok(!fitted.includes('�'));
    assert.equal(fitText(textOf('x'), countOf(0)), '');
});

test('an argv prompt is bounded: whole oldest turns are dropped, the instructions and the ledger are not, and the markup stays whole', () => {
    const entries = Array.from({ length: 200 }, (_, i): Entry => ({ role: 'agent', text: textOf(`turn ${i}: ${'日'.repeat(1500)}`) }));
    const request = requestOf({ entries, ledgers: [{ task: null, facts: [{ id: textOf('f1'), section: 'goal', text: textOf('PREV-RECAP'), state: 'open', first: instant(1), last: instant(1), why: null, ref: null, anchor: null, agent: null, closed: null }] }] });
    assert.ok(Buffer.byteLength(promptText(request)) > ARGV_BYTES, 'the full document would not fit');
    const text = argvText(request);
    assert.ok(Buffer.byteLength(text) <= ARGV_BYTES);
    assert.ok(text.includes('PREV-RECAP') && text.includes('Operations on the ledger') && text.includes('turn 199:'));
    assert.ok(!text.includes('turn 0:'));
    const turns = text.match(/<turn /g)?.length ?? 0;
    assert.equal(turns, text.match(/<\/turn>/g)?.length, 'no turn is cut in half');
    assert.match(text, /omitted="\d+"/, 'the writer is told how many turns were left out');
});
