// Whether a quote is in a text: compared by words (`Intl.Segmenter`), so whitespace and punctuation do not matter and case does.
const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });

/** The words of `text`, in order, as one space-separated line. */
export const wordsOf = (text: string): string => [...WORDS.segment(text)].filter((part) => part.isWordLike === true).map((part) => part.segment).join(' ');

/** The longest a quote (an anchor) may be. */
export const QUOTE_CHARS = 120;

/** `quote` is found in `text` after folding both to their words; a quote with no word is in nothing. */
export function quotedIn(quote: string, text: string): boolean {
    const needle = wordsOf(quote);
    return needle !== '' && ` ${wordsOf(text)} `.includes(` ${needle} `);
}

/** At most QUOTE_CHARS characters of `text` around `at`, cut at word edges, as a verbatim piece of it (never rewritten). */
export function pieceOf(text: string, at = 0): string {
    const body = text.trim();
    if (body.length <= QUOTE_CHARS) {
        return body;
    }
    const from = Math.max(0, Math.min(at - Math.floor(QUOTE_CHARS / 3), body.length - QUOTE_CHARS));
    const piece = body.slice(from, from + QUOTE_CHARS);
    const [head, tail] = [from > 0 ? piece.search(/\s/) : -1, from + QUOTE_CHARS < body.length ? piece.search(/\s\S*$/) : -1];
    return piece.slice(head >= 0 ? head : 0, tail > 0 ? tail : piece.length).trim();
}
