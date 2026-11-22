import { brand, type Brand } from '../brand.ts';
import { textOf, type Text } from '../text.ts';

export type Similarity = Brand<number, 'Similarity'>;

const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });

export function tokensOf(text: Text): ReadonlySet<Text> {
    return new Set([...WORDS.segment(text.toLowerCase())].filter((part) => part.isWordLike === true && Array.from(part.segment).length >= 3).map((part) => textOf(part.segment)));
}

export function jaccard(a: Text, b: Text): Similarity {
    const [left, right] = [tokensOf(a), tokensOf(b)];
    const shared = [...left].filter((word) => right.has(word)).length;
    const union = left.size + right.size - shared;
    return brand<number, 'Similarity'>(union === 0 ? 0 : shared / union);
}
