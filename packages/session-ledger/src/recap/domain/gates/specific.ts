import { brand, type Brand } from '../brand.ts';
import { textOf, type Text } from '../text.ts';
import { LISTED, said } from './item-gate.ts';
import type { Gate, Outcome } from './item-gate.ts';
import { hasReference } from './link.ts';
import { wordsOf } from './words.ts';

export type Specific = Brand<boolean, 'Specific'>;
type Named = Brand<boolean, 'Named'>;

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

const hasName = (text: Text): Named => brand<boolean, 'Named'>(wordsOf(text).slice(1).some((word) => /^\p{Lu}\p{L}+$/u.test(word)));

export const isSpecific = (text: Text): Specific => brand<boolean, 'Specific'>(SIGNS.some((sign) => sign.test(text)) || hasName(text) || hasReference(text));

export const notSpecific: Gate = {
    id: 'G8',
    check: (item, context): Outcome | null => (!LISTED.includes(item.section) || isSpecific(item.text) ? null : {
        kind: 'flag', gate: 'G8',
        reason: said(context.language, textOf('names nothing concrete: add a file, command, reference, number or version'), textOf('no nombra nada concreto: añade un archivo, comando, referencia, número o versión')),
    }),
};
