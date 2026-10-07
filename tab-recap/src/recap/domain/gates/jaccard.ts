// How alike two lines are: the share of their words they have in common (words of three letters or more, lower-cased).
const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });

export function tokensOf(text: string): ReadonlySet<string> {
    return new Set([...WORDS.segment(text.toLowerCase())].filter((part) => part.isWordLike === true && Array.from(part.segment).length >= 3).map((part) => part.segment));
}

export function jaccard(a: string, b: string): number {
    const [left, right] = [tokensOf(a), tokensOf(b)];
    const shared = [...left].filter((word) => right.has(word)).length;
    const union = left.size + right.size - shared;
    return union === 0 ? 0 : shared / union;
}
