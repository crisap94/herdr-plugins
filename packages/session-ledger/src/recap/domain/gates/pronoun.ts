import { textOf } from '../text.ts';
import { LISTED, said } from './item-gate.ts';
import type { Gate, Outcome } from './item-gate.ts';

const OPENERS = /^\W*(it|this|that|the issue|the bug|the problem|eso|esto|el problema|el error)(?![\p{L}\p{N}_-])/iu;

export const pronounOpener: Gate = {
    id: 'G9',
    check: (item, context): Outcome | null => (!LISTED.includes(item.section) || !OPENERS.test(item.text) ? null : {
        kind: 'flag', gate: 'G9',
        reason: said(context.language, textOf('opens with a pronoun: name the thing'), textOf('empieza con un pronombre: nombra la cosa')),
    }),
};
