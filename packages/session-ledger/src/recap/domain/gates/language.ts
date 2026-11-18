import { LISTED, said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';
import { languageOfLine } from './legacy.ts';
import type { Outcome } from './legacy.ts';

export const wrongLanguage: Gate = {
    id: 'G5',
    check: (item, context): Outcome | null => {
        const wanted = context.language;
        const found = LISTED.includes(item.section) || item.section === 'goal' ? languageOfLine(item.text) : null;
        if ((wanted !== 'en' && wanted !== 'es') || found === null || found === wanted) {
            return null;
        }
        return { kind: 'refuse', gate: 'G5', reason: said(wanted, `write this item in English, not ${found === 'es' ? 'Spanish' : 'another language'}`, 'escribe este elemento en español, no en inglés') };
    },
};

export type { LineLanguage } from './legacy.ts';
export { languageOfLine } from './legacy.ts';
