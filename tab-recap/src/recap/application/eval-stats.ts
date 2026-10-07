// What `eval --agree` and `eval --gates` print: judge against operator, and the gates' counts. Pure.
import type { GateStats } from '#src/recap/domain/gates/index.ts';
import type { Pair } from '#src/ports/verdicts.ts';
import { percent, rankOf } from './eval-report.ts';

/** The share of verdicts the judge and the operator must agree on before the judge is trusted for a check. */
export const AGREEMENT_TARGET = 85;

export interface Agreement {
    readonly check: string;
    readonly items: number;
    readonly agreed: number;
    readonly percent: number;
    /** the judge passed what the operator failed */
    readonly falsePasses: number;
    /** the judge failed what the operator passed */
    readonly falseFails: number;
}

export function agreementOf(pairs: readonly Pair[]): readonly Agreement[] {
    const checks = [...new Set(pairs.map((pair) => pair.check))].toSorted((a, b) => rankOf(a) - rankOf(b));
    return checks.map((check) => {
        const mine = pairs.filter((pair) => pair.check === check);
        const agreed = mine.filter((pair) => pair.judge === pair.operator).length;
        return {
            check, items: mine.length, agreed, percent: percent(agreed, mine.length),
            falsePasses: mine.filter((pair) => pair.judge && !pair.operator).length,
            falseFails: mine.filter((pair) => !pair.judge && pair.operator).length,
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
