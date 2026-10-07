// G5 language: an item written in English where the recap is Spanish, or the other way round, is refused. Only en and es are told apart: another language is never refused.
import { LISTED, said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';
import { wordsOf } from './words.ts';

const ENGLISH = new Set(['the', 'and', 'of', 'to', 'is', 'are', 'with', 'for', 'in', 'on', 'that', 'this', 'it', 'was', 'were', 'has', 'have', 'been', 'will', 'not', 'from', 'after', 'before', 'when', 'until', 'because', 'but', 'its']);
const SPANISH = new Set(['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'con', 'para', 'por', 'se', 'su', 'sus', 'al', 'lo', 'es', 'son', 'está', 'están', 'fue', 'sin', 'pero', 'hasta', 'después', 'antes', 'cuando', 'porque', 'ya']);

const MINIMUM_WORDS = 4;

const hits = (words: readonly string[], list: ReadonlySet<string>): number => words.filter((word) => list.has(word)).length;

/** `en` or `es` when the line clearly is, null when it is too short, mixed or neither. */
export function languageOfLine(text: string): 'en' | 'es' | null {
    const words = wordsOf(text).map((word) => word.toLowerCase());
    if (words.length < MINIMUM_WORDS) {
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
    check: (item, context) => {
        const wanted = context.language;
        const found = LISTED.includes(item.section) || item.section === 'goal' ? languageOfLine(item.text) : null;
        if ((wanted !== 'en' && wanted !== 'es') || found === null || found === wanted) {
            return null;
        }
        return { kind: 'refuse', gate: 'G5', reason: said(wanted, `write this item in English, not ${found === 'es' ? 'Spanish' : 'another language'}`, 'escribe este elemento en español, no en inglés') };
    },
};
