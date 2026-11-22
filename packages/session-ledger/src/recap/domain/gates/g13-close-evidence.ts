import { brand } from '../brand.ts';
import { textOf } from '../text.ts';
import type { Finding, Gate } from './gate.ts';
import { quotedIn, ANCHOR_CHARS } from './g11-anchor.ts';

export const closeEvidenceGate: Gate = {
    id: 'G13',
    check: (ops, context) => {
        const findings: Finding[] = [];
        for (const [index, op] of ops.entries()) {
            const at = brand<number, 'Count'>(index);
            if (op.op !== 'close' || (op.why !== 'done' && op.why !== 'wrong')) {
                continue;
            }
            const anchor = op.anchor ?? '';
            if (anchor === '') {
                findings.push({ at, gate: 'G13', outcome: 'refuse', reason: textOf(`closing ${op.id} as ${op.why} needs an anchor: copy a quote of at most ${ANCHOR_CHARS} characters from the input that shows it`) });
            } else if (!quotedIn(anchor, context.source)) {
                findings.push({ at, gate: 'G13', outcome: 'refuse', reason: textOf(`the anchor "${anchor}" of closing ${op.id} is not in the input: copy it exactly, never paraphrase`) });
            }
        }
        return findings;
    },
};
