import { gateName } from '#src/recap/domain/gates/gatekeeper.ts';
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { PairRecord } from '#src/ports/verdicts.ts';
import { countOf, type Count } from '#src/recap/domain/count.ts';
import { uncheckedRatio } from '#src/recap/domain/ids.ts';
import { trustedOf, type Trusted } from '#src/recap/domain/kappa.ts';
import type { Probability } from '#src/recap/domain/probability.ts';
import type { Text } from '#src/recap/domain/text.ts';
import type { GateName } from '@stateforge-labs/session-ledger/unstable/contract/kernel.ts';
import { inCheckOrder, percent } from './eval-report.ts';
import { perCheck, WORST_PER_CHECK } from './judge-anchors.ts';
import type { Disagreed } from './judge-anchors.ts';

export const AGREEMENT_TARGET = 85;
export const KAPPA_BAR = 0.6;

export interface Agreement {
    readonly check: Text;
    readonly items: Count;
    readonly agreed: Count;
    readonly percent: Probability;
    readonly falsePasses: Count;
    readonly falseFails: Count;
    readonly kappa: Probability | null;
    readonly worst: readonly Disagreed[];
}

export function kappaOf(pairs: readonly PairRecord[]): Probability | null {
    const n = pairs.length;
    const [judgePass, operatorPass] = [pairs.filter((pair) => pair.judge === 'pass').length / n, pairs.filter((pair) => pair.operator === 'pass').length / n];
    const observed = pairs.filter((pair) => pair.judge === pair.operator).length / n;
    const chance = judgePass * operatorPass + (1 - judgePass) * (1 - operatorPass);
    return n === 0 || chance === 1 ? null : uncheckedRatio(Math.round(100 * ((observed - chance) / (1 - chance))) / 100);
}

export const trusted = (agreement: Pick<Agreement, 'kappa'>): Trusted => trustedOf(agreement.kappa !== null && agreement.kappa >= KAPPA_BAR);

export function agreementOf(pairs: readonly PairRecord[], disagreed: readonly Disagreed[] = []): readonly Agreement[] {
    const checks = inCheckOrder([...new Set(pairs.map((pair) => pair.check))].map((check) => ({ check }))).map((row) => row.check);
    const worst = perCheck(disagreed, WORST_PER_CHECK);
    return checks.map((check) => {
        const mine = pairs.filter((pair) => pair.check === check);
        const agreed = mine.filter((pair) => pair.judge === pair.operator).length;
        return {
            check, items: countOf(mine.length), agreed: countOf(agreed), percent: percent(countOf(agreed), countOf(mine.length)),
            falsePasses: countOf(mine.filter((pair) => pair.judge === 'pass' && pair.operator === 'fail').length),
            falseFails: countOf(mine.filter((pair) => pair.judge === 'fail' && pair.operator === 'pass').length),
            kappa: kappaOf(mine), worst: worst.get(check) ?? [],
        };
    });
}

const GATE_ORDER = new Intl.Collator('en', { numeric: true });

export interface GateRow {
    readonly gate: GateName;
    readonly refused: Count;
    readonly flagged: Count;
}

export interface GateReport {
    readonly runs: Count;
    readonly rows: readonly GateRow[];
    readonly dropped: Count;
}

interface GateCount {
    readonly stats: GateStats;
}

export function gateReportOf(counts: readonly GateCount[]): GateReport {
    const gates = [...new Set(counts.flatMap(({ stats }) => [...Object.keys(stats.refused), ...Object.keys(stats.flagged)]))].toSorted(GATE_ORDER.compare);
    return {
        runs: countOf(counts.length),
        rows: gates.map((gate) => ({ gate: gateName(gate), refused: countOf(counts.reduce((sum, { stats }) => sum + (stats.refused[gateName(gate)] ?? 0), 0)), flagged: countOf(counts.reduce((sum, { stats }) => sum + (stats.flagged[gateName(gate)] ?? 0), 0)) })),
        dropped: countOf(counts.reduce((sum, { stats }) => sum + stats.dropped, 0)),
    };
}
