import { brand } from '../brand.ts';
import { textOf, type Text } from '../text.ts';
import type { Similarity } from './jaccard.ts';

const SEGMENTER = new Intl.Segmenter('en', { granularity: 'word' });

export const wordsOf = (text: Text): readonly Text[] => [...SEGMENTER.segment(text)].flatMap((part) => (part.isWordLike === true ? [textOf(part.segment)] : []));

export const foldedOf = (text: Text): Text => textOf(wordsOf(text).join(' '));

export const tokensOf = (text: Text): ReadonlySet<Text> => new Set(wordsOf(text).map((word) => textOf(word.toLowerCase())).filter((word) => word.length >= 3));

export function jaccard(a: ReadonlySet<Text>, b: ReadonlySet<Text>): Similarity {
    const shared = [...a].filter((word) => b.has(word)).length;
    return brand<number, 'Similarity'>(a.size + b.size - shared === 0 ? 0 : shared / (a.size + b.size - shared));
}
