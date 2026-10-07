// G9 pronoun opener (flag): the item opens with it / this / that / the issue / the bug / the problem — it cannot stand alone (I2).
import { LISTED, said } from './item-gate.ts';
import type { Gate } from './item-gate.ts';

const OPENERS = /^\W*(it|this|that|the issue|the bug|the problem|eso|esto|el problema|el error)(?![\p{L}\p{N}_-])/iu;

export const pronounOpener: Gate = {
    id: 'G9',
    check: (item, context) => (!LISTED.includes(item.section) || !OPENERS.test(item.text) ? null : {
        kind: 'flag', gate: 'G9',
        reason: said(context.language, 'opens with a pronoun: name the thing', 'empieza con un pronombre: nombra la cosa'),
    }),
};
