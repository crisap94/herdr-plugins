import type { Finding, Gate } from './gate.ts';
import { quotedIn, ANCHOR_CHARS } from './g11-anchor.ts';

export const closeEvidenceGate: Gate = {
    id: 'G13',
    check: (ops, context) => {
        const findings: Finding[] = [];
        for (const [at, op] of ops.entries()) {
            if (op.op !== 'close' || (op.why !== 'done' && op.why !== 'wrong')) {
                continue;
            }
            const anchor = op.anchor ?? '';
            if (anchor === '') {
                findings.push({ at, gate: 'G13', outcome: 'refuse', reason: `closing ${op.id} as ${op.why} needs an anchor: copy a quote of at most ${ANCHOR_CHARS} characters from the input that shows it` });
            } else if (!quotedIn(anchor, context.source)) {
                findings.push({ at, gate: 'G13', outcome: 'refuse', reason: `the anchor "${anchor}" of closing ${op.id} is not in the input: copy it exactly, never paraphrase` });
            }
        }
        return findings;
    },
};
