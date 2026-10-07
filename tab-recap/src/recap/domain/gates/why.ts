// G3 decision without a why: a "decisions" item needs a reason clause (S-decisions).
import { said } from './gate.ts';
import type { Gate } from './gate.ts';

const REASON_WORDS = /(?<![\p{L}\p{N}])(because|so that|so|since|to|instead of|rather than|therefore|otherwise|porque|para|para que|ya que|dado que|en vez de|en lugar de|así que|por eso|pues)(?![\p{L}\p{N}])/iu;
/** A colon or a dash followed by a clause of at least two words. */
const CLAUSE = /[:—]\s*\S+\s+\S+/u;

export const withoutWhy: Gate = {
    id: 'G3',
    check: (item, context) => (item.section !== 'decisions' || REASON_WORDS.test(item.text) || CLAUSE.test(item.text) ? null : {
        kind: 'refuse', gate: 'G3',
        reason: said(context.language, 'a decision needs its reason: add "because …", "so that …" or ": <why>"', 'una decisión necesita su razón: añade "porque …", "para que …" o ": <por qué>"'),
    }),
};
