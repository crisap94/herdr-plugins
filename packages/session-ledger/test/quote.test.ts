import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pieceOf, QUOTE_CHARS, quotedIn } from '@stateforge-labs/session-ledger/unstable/recap/domain/quote.ts';
import { textOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/text.ts';
import { countOf } from '@stateforge-labs/session-ledger/unstable/recap/domain/count.ts';

test('a quote is found by its words: whitespace, line ends and punctuation do not matter, case does', () => {
    const text = 'The   pipeline\nwas green, then `npm test` failed on part6.';
    assert.ok(quotedIn(textOf('pipeline was green'), textOf(text)));
    assert.ok(quotedIn(textOf('npm  test failed on part6'), textOf(text)));
    assert.ok(!quotedIn(textOf('Pipeline was green'), textOf(text)), 'case is kept');
    assert.ok(!quotedIn(textOf('the pipeline was red'), textOf(text)));
    assert.ok(!quotedIn(textOf('pipe'), textOf(text)), 'half a word is not a word');
    assert.ok(!quotedIn(textOf('  ... '), textOf(text)), 'a quote with no word is in nothing');
});

test('a piece of a long text is at most QUOTE_CHARS, starts and ends on word edges, and is a verbatim part of the text', () => {
    const text = Array.from({ length: 80 }, (_, at) => `word${at}`).join(' ');
    for (const at of [0, 300, Number.MAX_SAFE_INTEGER]) {
        const piece = pieceOf(textOf(text), countOf(at));
        assert.ok(piece.length <= QUOTE_CHARS && piece.length > 60, `${at}: ${piece.length}`);
        assert.ok(text.includes(piece));
        assert.ok(/^word\d+/.test(piece) && /word\d+$/.test(piece), piece);
    }
    assert.equal(pieceOf(textOf('  short  ')), 'short');
});
