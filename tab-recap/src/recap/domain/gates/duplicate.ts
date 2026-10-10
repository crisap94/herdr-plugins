import { said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';
import { jaccard, tokensOf } from './words.ts';

export const THRESHOLD = 0.6;

export const duplicate: Gate = {
    id: 'G2',
    check: (item, context) => {
        if (item.section === 'links') {
            return null;
        }
        const mine = tokensOf(item.text);
        const kept = context.earlier.find((other) => other.section !== 'links' && jaccard(mine, tokensOf(other.text)) >= THRESHOLD);
        return kept === undefined ? null : {
            kind: 'refuse', gate: 'G2',
            reason: said(context.language, `it repeats another item of this task: "${kept.text}" (${kept.section})`, `repite otro elemento de esta tarea: "${kept.text}" (${kept.section})`),
        };
    },
};
