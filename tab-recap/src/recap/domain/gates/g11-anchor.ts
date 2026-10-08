// G11 anchor: an added fact quotes the input it comes from (a turn, a tool call or an agent note), so "supported" is checked by a machine first.
// The quote must be found in the input after whitespace folding (words by Intl.Segmenter, case kept). An update may carry one; if it does it is checked too. A close never has one.
import type { Gate, GateContext } from './gate.ts';
import { foldedOf } from './words.ts';

/** The most characters an anchor keeps. */
export const ANCHOR_CHARS = 120;

/** Whether the folded `source` holds `anchor` as whole words in a row; false for an anchor with no words. */
export function quotedIn(anchor: string, source: string): boolean {
    const folded = foldedOf(anchor);
    return folded !== '' && ` ${source} `.includes(` ${folded} `);
}

const MISSING = `the anchor is missing: copy a quote of at most ${ANCHOR_CHARS} characters from the turn, tool call or note the fact comes from`;

const lost = (anchor: string): string => `the anchor "${anchor}" is not in the input: copy it exactly from a turn, a tool call or an agent note, never paraphrase`;

export const anchorGate: Gate = {
    id: 'G11',
    check: (ops, context: GateContext) => ops.flatMap((op, at) => {
        if (op.op === 'close' || (op.op === 'update' && (op.anchor ?? '') === '')) {
            return [];
        }
        const anchor = op.anchor ?? '';
        if (anchor !== '' && quotedIn(anchor, context.source)) {
            return [];
        }
        return [{ at, gate: 'G11', outcome: 'refuse' as const, reason: anchor === '' ? MISSING : lost(anchor) }];
    }),
};
