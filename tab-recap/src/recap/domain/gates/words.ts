const SEGMENTER = new Intl.Segmenter('en', { granularity: 'word' });

export const wordsOf = (text: string): readonly string[] =>
    [...SEGMENTER.segment(text)].flatMap((part) => (part.isWordLike === true ? [part.segment] : []));

export const foldedOf = (text: string): string => wordsOf(text).join(' ');

export const tokensOf = (text: string): ReadonlySet<string> =>
    new Set(wordsOf(text).map((word) => word.toLowerCase()).filter((word) => word.length >= 3));

export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
    const shared = [...a].filter((word) => b.has(word)).length;
    const all = a.size + b.size - shared;
    return all === 0 ? 0 : shared / all;
}
