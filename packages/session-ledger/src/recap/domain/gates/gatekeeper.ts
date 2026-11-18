import type { Operation } from '../ops.ts';
import type { Finding, Gate, GateContext } from './gate.ts';
import type { GateStats } from './item-gate.ts';

export type { GateStats } from './item-gate.ts';

export interface Gated {
    readonly kept: readonly Operation[];
    readonly refused: readonly Finding[];
    readonly flagged: readonly Finding[];
}

export const NO_STATS: GateStats = { refused: {}, flagged: {}, dropped: 0 };

export function gatekeeper(gates: readonly Gate[], ops: readonly Operation[], context: GateContext): Gated {
    const findings = gates.flatMap((gate) => gate.check(ops, context));
    const refused = findings.filter((finding) => finding.outcome === 'refuse');
    const out = new Set(refused.map((finding) => finding.at));
    return { kept: ops.filter((_, at) => !out.has(at)), refused, flagged: findings.filter((finding) => finding.outcome === 'flag') };
}

export { addStats, correctionOf, quoted } from './legacy.ts';
