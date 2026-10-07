// Quotes: found by words, whatever the whitespace and punctuation; case counts; a piece of a text is always a verbatim part of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceOf, QUOTE_CHARS, quotedIn } from '#src/recap/domain/quote.ts';

test('a quote is found by its words: whitespace, line ends and punctuation do not matter, case does', () => {
    const text = 'The   pipeline\nwas green, then `npm test` failed on part6.';
    assert.ok(quotedIn('pipeline was green', text));
    assert.ok(quotedIn('npm  test failed on part6', text));
    assert.ok(!quotedIn('Pipeline was green', text), 'case is kept');
    assert.ok(!quotedIn('the pipeline was red', text));
    assert.ok(!quotedIn('pipe', text), 'half a word is not a word');
    assert.ok(!quotedIn('  ... ', text), 'a quote with no word is in nothing');
});

test('a piece of a long text is at most QUOTE_CHARS, starts and ends on word edges, and is a verbatim part of the text', () => {
    const text = Array.from({ length: 80 }, (_, at) => `word${at}`).join(' ');
    for (const at of [0, 300, Number.MAX_SAFE_INTEGER]) {
        const piece = pieceOf(text, at);
        assert.ok(piece.length <= QUOTE_CHARS && piece.length > 60, `${at}: ${piece.length}`);
        assert.ok(text.includes(piece));
        assert.ok(/^word\d+/.test(piece) && /word\d+$/.test(piece), piece);
    }
    assert.equal(pieceOf('  short  '), 'short');
});
