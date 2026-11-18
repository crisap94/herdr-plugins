import { LISTED, said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';
import { isSpecific } from './legacy.ts';
import type { Outcome } from './legacy.ts';

export const notSpecific: Gate = {
    id: 'G8',
    check: (item, context): Outcome | null => (!LISTED.includes(item.section) || isSpecific(item.text) ? null : {
        kind: 'flag', gate: 'G8',
        reason: said(context.language, 'names nothing concrete: add a file, command, reference, number or version', 'no nombra nada concreto: añade un archivo, comando, referencia, número o versión'),
    }),
};

export { isSpecific } from './legacy.ts';
