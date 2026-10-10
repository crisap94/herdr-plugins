import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { Pair } from '#src/ports/verdicts.ts';
import { percent, rankOf } from './eval-report.ts';
import { perCheck, WORST_PER_CHECK } from './judge-anchors.ts';
import type { Disagreed } from './judge-anchors.ts';

export const AGREEMENT_TARGET = 85;
export const KAPPA_BAR = 0.6;

export interface Agreement {
    readonly check: string;
    readonly items: number;
    readonly agreed: number;
    readonly percent: number;
    readonly falsePasses: number;
    readonly falseFails: number;
    readonly kappa: number | null;
    readonly worst: readonly Disagreed[];
}

export function kappaOf(pairs: readonly Pair[]): number | null {
    const n = pairs.length;
    const [judgePass, operatorPass] = [pairs.filter((pair) => pair.judge).length / n, pairs.filter((pair) => pair.operator).length / n];
    const observed = pairs.filter((pair) => pair.judge === pair.operator).length / n;
    const chance = judgePass * operatorPass + (1 - judgePass) * (1 - operatorPass);
    return n === 0 || chance === 1 ? null : Math.round(100 * ((observed - chance) / (1 - chance))) / 100;
}

export const trusted = (agreement: Pick<Agreement, 'kappa'>): boolean => agreement.kappa !== null && agreement.kappa >= KAPPA_BAR;

export function agreementOf(pairs: readonly Pair[], disagreed: readonly Disagreed[] = []): readonly Agreement[] {
    const checks = [...new Set(pairs.map((pair) => pair.check))].toSorted((a, b) => rankOf(a) - rankOf(b));
    const worst = perCheck(disagreed, WORST_PER_CHECK);
    return checks.map((check) => {
        const mine = pairs.filter((pair) => pair.check === check);
        const agreed = mine.filter((pair) => pair.judge === pair.operator).length;
        return {
            check, items: mine.length, agreed, percent: percent(agreed, mine.length),
            falsePasses: mine.filter((pair) => pair.judge && !pair.operator).length,
            falseFails: mine.filter((pair) => !pair.judge && pair.operator).length,
            kappa: kappaOf(mine), worst: worst.get(check) ?? [],
        };
    });
}

export interface GateRow {
    readonly gate: string;
    readonly refused: number;
    readonly flagged: number;
}

export interface GateReport {
    readonly runs: number;
    readonly rows: readonly GateRow[];
    readonly dropped: number;
}

export function gateReportOf(counts: readonly { readonly stats: GateStats }[]): GateReport {
    const gates = [...new Set(counts.flatMap(({ stats }) => [...Object.keys(stats.refused), ...Object.keys(stats.flagged)]))].toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return {
        runs: counts.length,
        rows: gates.map((gate) => ({ gate, refused: counts.reduce((sum, { stats }) => sum + (stats.refused[gate] ?? 0), 0), flagged: counts.reduce((sum, { stats }) => sum + (stats.flagged[gate] ?? 0), 0) })),
        dropped: counts.reduce((sum, { stats }) => sum + stats.dropped, 0),
    };
}
