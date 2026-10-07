// Words of an item, by user-perceived word boundaries (Intl.Segmenter): what duplicates and language are judged on.
const SEGMENTER = new Intl.Segmenter('en', { granularity: 'word' });

/** Every word, as written, in order. */
export const wordsOf = (text: string): readonly string[] =>
    [...SEGMENTER.segment(text)].flatMap((part) => (part.isWordLike === true ? [part.segment] : []));

/** Words joined by one space, case kept: whitespace and punctuation folded away, so a quote and its source compare equal. */
export const foldedOf = (text: string): string => wordsOf(text).join(' ');

/** The lower-cased words of at least three letters: what two items are compared on. */
export const tokensOf = (text: string): ReadonlySet<string> =>
    new Set(wordsOf(text).map((word) => word.toLowerCase()).filter((word) => word.length >= 3));

/** The share of tokens two items have in common: shared / all distinct. Two empty sets share nothing. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
    const shared = [...a].filter((word) => b.has(word)).length;
    const all = a.size + b.size - shared;
    return all === 0 ? 0 : shared / all;
}
