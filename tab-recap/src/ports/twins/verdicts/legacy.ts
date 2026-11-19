export type VerdictSource = 'judge' | 'operator';

export interface Verdict {
    readonly run: string;
    readonly item: string | null;
    readonly check: string;
    readonly pass: boolean;
    readonly critique: string | null;
    readonly judge: string;
    readonly at: number;
    readonly source: VerdictSource;
}

export interface Pair {
    readonly check: string;
    readonly judge: boolean;
    readonly operator: boolean;
}

export interface Disagreement {
    readonly run: string;
    readonly item: string;
    readonly check: string;
    readonly judge: boolean;
    readonly operator: boolean;
    readonly judgeCritique: string | null;
    readonly reason: string | null;
    readonly at: number;
}

export interface Verdicts {
    add(verdicts: readonly Verdict[]): void;
    ofRun(run: string): readonly Verdict[];
    labelled(check?: string | null): ReadonlySet<string>;
    pairs(): readonly Pair[];
    disagreements(): readonly Disagreement[];
}
