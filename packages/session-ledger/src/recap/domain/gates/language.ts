import type { Count } from '#src/contract/kernel.ts';
import { brand } from '../brand.ts';
import { textOf, type Text } from '../text.ts';
import { LISTED, said } from './item-gate.ts';
import type { Gate, Outcome } from './item-gate.ts';
import { wordsOf } from './words.ts';

export type LineLanguage = 'en' | 'es';

const ENGLISH: ReadonlySet<Text> = new Set(['the', 'and', 'of', 'to', 'is', 'are', 'with', 'for', 'in', 'on', 'that', 'this', 'it', 'was', 'were', 'has', 'have', 'been', 'will', 'not', 'from', 'after', 'before', 'when', 'until', 'because', 'but', 'its'].map(textOf));
const SPANISH: ReadonlySet<Text> = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'con', 'para', 'por', 'se', 'su', 'sus', 'al', 'lo', 'es', 'son', 'está', 'están', 'fue', 'sin', 'pero', 'hasta', 'después', 'antes', 'cuando', 'porque', 'ya'].map(textOf));

const hits = (words: readonly Text[], list: ReadonlySet<Text>): Count => brand<number, 'Count'>(words.filter((word) => list.has(word)).length);

export function languageOfLine(text: Text): LineLanguage | null {
    const words = wordsOf(text).map((word) => textOf(word.toLowerCase()));
    if (words.length < 4) {
        return null;
    }
    const en = hits(words, ENGLISH);
    const es = hits(words, SPANISH);
    if (en >= 2 && es === 0) {
        return 'en';
    }
    return es >= 2 && en === 0 ? 'es' : null;
}

export const wrongLanguage: Gate = {
    id: 'G5',
    check: (item, context): Outcome | null => {
        const wanted = context.language;
        const found = LISTED.includes(item.section) || item.section === 'goal' ? languageOfLine(item.text) : null;
        if ((wanted !== 'en' && wanted !== 'es') || found === null || found === wanted) {
            return null;
        }
        return { kind: 'refuse', gate: 'G5', reason: said(wanted, textOf(`write this item in English, not ${found === 'es' ? 'Spanish' : 'another language'}`), textOf('escribe este elemento en español, no en inglés')) };
    },
};
