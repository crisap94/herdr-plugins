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

function count(findings: readonly Finding[], into: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
    const counted: Record<string, number> = { ...into };
    for (const finding of findings) {
        counted[finding.gate] = (counted[finding.gate] ?? 0) + 1;
    }
    return counted;
}

export const addStats = (before: GateStats, found: Gated, dropped = 0): GateStats =>
    ({ refused: count(found.refused, before.refused), flagged: count(found.flagged, {}), dropped: before.dropped + dropped });

export function quoted(op: Operation): string {
    if (op.op === 'add') {
        return `add ${op.section} "${op.text}"`;
    }
    return op.op === 'update' ? `update ${op.id} "${op.text}"` : `close ${op.id}`;
}

export const correctionOf = (ops: readonly Operation[], refused: readonly Finding[]): string =>
    refused.map((finding) => {
        const op = ops[finding.at];
        return `${finding.gate}: ${op === undefined ? '?' : quoted(op)} — ${finding.reason}`;
    }).join('\n');
