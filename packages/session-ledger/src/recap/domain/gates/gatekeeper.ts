import type { Count, GateName } from '#src/contract/kernel.ts';
import { brand } from '../brand.ts';
import type { Operation } from '../ops.ts';
import { textOf, type Text } from '../text.ts';
import type { Finding, Gate, GateContext } from './gate.ts';
import type { GateStats } from './item-gate.ts';

export type { GateStats } from './item-gate.ts';

export interface Gated {
    readonly kept: readonly Operation[];
    readonly refused: readonly Finding[];
    readonly flagged: readonly Finding[];
}

export const gateName = brand<string, 'GateName'>;
const countOf = brand<number, 'Count'>;

type Counted = Readonly<Record<GateName, Count>>;

export const NO_STATS: GateStats = { refused: {}, flagged: {}, dropped: countOf(0) };

export function gatekeeper(gates: readonly Gate[], ops: readonly Operation[], context: GateContext): Gated {
    const findings = gates.flatMap((gate) => gate.check(ops, context));
    const refused = findings.filter((finding) => finding.outcome === 'refuse');
    const out = new Set(refused.map((finding) => finding.at));
    return { kept: ops.filter((_, at) => !out.has(countOf(at))), refused, flagged: findings.filter((finding) => finding.outcome === 'flag') };
}

function count(findings: readonly Finding[], into: Counted): Counted {
    const counted: Record<GateName, Count> = { ...into };
    for (const finding of findings) {
        const gate = gateName(finding.gate);
        counted[gate] = countOf((counted[gate] ?? 0) + 1);
    }
    return counted;
}

export const addStats = (before: GateStats, found: Gated, dropped: Count = countOf(0)): GateStats =>
    ({ refused: count(found.refused, before.refused), flagged: count(found.flagged, {}), dropped: countOf(before.dropped + dropped) });

export function quoted(op: Operation): Text {
    if (op.op === 'add') {
        return textOf(`add ${op.section} "${op.text}"`);
    }
    return textOf(op.op === 'update' ? `update ${op.id} "${op.text}"` : `close ${op.id}`);
}

export const correctionOf = (ops: readonly Operation[], refused: readonly Finding[]): Text =>
    textOf(refused.map((finding) => {
        const op = ops[finding.at];
        return `${finding.gate}: ${op === undefined ? '?' : quoted(op)} — ${finding.reason}`;
    }).join('\n'));
