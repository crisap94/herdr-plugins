// What `eval --agree` and `eval --gates` print: judge against operator, and the gates' counts. Pure.
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { Pair } from '#src/ports/verdicts.ts';
import { percent, rankOf } from './eval-report.ts';
import { perCheck, WORST_PER_CHECK } from './judge-anchors.ts';
import type { Disagreed } from './judge-anchors.ts';

/** The share of verdicts the judge and the operator agree on, shown beside Cohen's kappa. */
export const AGREEMENT_TARGET = 85;
/** Cohen's kappa the judge must reach on a check before the operator trusts it for that check. */
export const KAPPA_BAR = 0.6;

export interface Agreement {
    readonly check: string;
    readonly items: number;
    readonly agreed: number;
    readonly percent: number;
    /** the judge passed what the operator failed */
    readonly falsePasses: number;
    /** the judge failed what the operator passed */
    readonly falseFails: number;
    /** agreement beyond chance, from -1 to 1; null when chance alone explains it (both always say the same one thing) */
    readonly kappa: number | null;
    /** the items they disagree on, the operator's newest ruling first (at most three) */
    readonly worst: readonly Disagreed[];
}

/** Cohen's kappa of two raters on pass/fail: (observed − chance) / (1 − chance), to two decimals. */
export function kappaOf(pairs: readonly Pair[]): number | null {
    const n = pairs.length;
    const [judgePass, operatorPass] = [pairs.filter((pair) => pair.judge).length / n, pairs.filter((pair) => pair.operator).length / n];
    const observed = pairs.filter((pair) => pair.judge === pair.operator).length / n;
    const chance = judgePass * operatorPass + (1 - judgePass) * (1 - operatorPass);
    return n === 0 || chance === 1 ? null : Math.round(100 * ((observed - chance) / (1 - chance))) / 100;
}

/** Whether a check clears the bar. A check with no kappa (nothing to disagree about yet) does not claim to. */
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

/** The counts of every run added up, per gate. */
export function gateReportOf(counts: readonly { readonly stats: GateStats }[]): GateReport {
    const gates = [...new Set(counts.flatMap(({ stats }) => [...Object.keys(stats.refused), ...Object.keys(stats.flagged)]))].toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    return {
        runs: counts.length,
        rows: gates.map((gate) => ({ gate, refused: counts.reduce((sum, { stats }) => sum + (stats.refused[gate] ?? 0), 0), flagged: counts.reduce((sum, { stats }) => sum + (stats.flagged[gate] ?? 0), 0) })),
        dropped: counts.reduce((sum, { stats }) => sum + stats.dropped, 0),
    };
}
