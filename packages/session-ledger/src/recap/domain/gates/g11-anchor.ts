import { brand } from '../brand.ts';
import { textOf } from '../text.ts';
import type { Finding, Gate, GateContext } from './gate.ts';
import { ANCHOR_CHARS, anchorQuotedIn as quotedIn } from '../legacy.ts';

export { ANCHOR_CHARS, anchorQuotedIn as quotedIn } from '../legacy.ts';

const MISSING = textOf(`the anchor is missing: copy a quote of at most ${ANCHOR_CHARS} characters from the turn, tool call or note the fact comes from`);

export const anchorGate: Gate = {
    id: 'G11',
    check: (ops, context: GateContext): readonly Finding[] => ops.flatMap((op, at) => {
        if (op.op === 'close' || (op.op === 'update' && (op.anchor ?? '') === '')) {
            return [];
        }
        const anchor = op.anchor ?? '';
        if (anchor !== '' && quotedIn(anchor, context.source)) {
            return [];
        }
        return [{ at: brand<number, 'Count'>(at), gate: 'G11' as const, outcome: 'refuse' as const, reason: anchor === '' ? MISSING : textOf(`the anchor "${anchor}" is not in the input: copy it exactly from a turn, a tool call or an agent note, never paraphrase`) }];
    }),
};
