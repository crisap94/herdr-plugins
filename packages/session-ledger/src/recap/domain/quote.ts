import { countOf, type Count } from './count.ts';
import { ANCHOR_CHARS, quotedIn as anchorQuotedIn, type Quoted } from './gates/g11-anchor.ts';
import { foldedOf } from './gates/words.ts';
import { textOf, type Text } from './text.ts';

export const QUOTE_CHARS = ANCHOR_CHARS;

export const quotedIn = (quote: Text, text: Text): Quoted => anchorQuotedIn(quote, foldedOf(text));

export function pieceOf(text: Text, at: Count = countOf(0)): Text {
    const body = text.trim();
    if (body.length <= QUOTE_CHARS) return textOf(body);
    const from = Math.max(0, Math.min(at - Math.floor(QUOTE_CHARS / 3), body.length - QUOTE_CHARS));
    const piece = body.slice(from, from + QUOTE_CHARS);
    const [head, tail] = [from > 0 ? piece.search(/\s/) : -1, from + QUOTE_CHARS < body.length ? piece.search(/\s\S*$/) : -1];
    return textOf(piece.slice(head >= 0 ? head : 0, tail > 0 ? tail : piece.length).trim());
}
