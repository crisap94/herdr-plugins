// G8 not specific (flag): the item names nothing concrete — no file, command, reference, number, version, error or person-role (I3).
import { LISTED, said } from './gate.ts';
import type { Gate } from './gate.ts';
import { hasReference } from './link.ts';
import { wordsOf } from './words.ts';

const ROLES = /(?<![\p{L}\p{N}])(operator|reviewer|user|owner|maintainer|operador|revisor|usuario)(?![\p{L}\p{N}])/iu;
const SIGNS = [
    /\d/u,
    /[`"“«]/u,
    /[/\\]/u,
    /[!#]\d/u,
    /[\p{Ll}][\p{Lu}]/u,
    /[\p{L}\p{N}][_-][\p{L}\p{N}]/u,
    /(?<![\p{L}])\p{Lu}{2,}(?![\p{L}])/u,
    ROLES,
];

/** A capitalised word that does not open the sentence: a name (Paris, Oslo). */
const hasName = (text: string): boolean => wordsOf(text).slice(1).some((word) => /^\p{Lu}\p{L}+$/u.test(word));

export const isSpecific = (text: string): boolean => SIGNS.some((sign) => sign.test(text)) || hasName(text) || hasReference(text);

export const notSpecific: Gate = {
    id: 'G8',
    check: (item, context) => (!LISTED.includes(item.section) || isSpecific(item.text) ? null : {
        kind: 'flag', gate: 'G8',
        reason: said(context.language, 'names nothing concrete: add a file, command, reference, number or version', 'no nombra nada concreto: añade un archivo, comando, referencia, número o versión'),
    }),
};
