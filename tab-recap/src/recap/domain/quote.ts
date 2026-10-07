// Whether a quote is in a text: compared by words (`Intl.Segmenter`), so whitespace and punctuation do not matter and case does.
import { ANCHOR_CHARS, quotedIn as inFolded } from './gates/g11-anchor.ts';
import { foldedOf } from './gates/words.ts';

/** The longest a quote (an anchor) may be: the gate's. */
export const QUOTE_CHARS = ANCHOR_CHARS;

/** `quote` is found in `text` as whole words in a row, as gate G11 finds an anchor in the input; a quote with no word is in nothing. */
export const quotedIn = (quote: string, text: string): boolean => inFolded(quote, foldedOf(text));

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
