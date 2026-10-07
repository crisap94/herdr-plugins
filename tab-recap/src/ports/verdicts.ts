export type VerdictSource = 'judge' | 'operator';

/** One answer about one check of one item (or of the whole run: `item` null). */
export interface Verdict {
    /** the run's TypeID */
    readonly run: string;
    readonly item: string | null;
    /** `I1`…`I7`, `S-<section>`, `coverage`, `filler`, `readback-<n>` */
    readonly check: string;
    readonly pass: boolean;
    readonly critique: string | null;
    /** `claude · sonnet · medium`, or who the operator is */
    readonly judge: string;
    readonly at: number;
    readonly source: VerdictSource;
}

/** The judge's and the operator's verdict on the same item and check. */
export interface Pair {
    readonly check: string;
    readonly judge: boolean;
    readonly operator: boolean;
}

export interface Verdicts {
    /** all in one transaction */
    add(verdicts: readonly Verdict[]): void;
    ofRun(run: string): readonly Verdict[];
    /** `<run>|<item>` of every item the operator has labelled */
    labelled(): ReadonlySet<string>;
    /** the newest judge verdict and the newest operator verdict of each item and check that has both */
    pairs(): readonly Pair[];
}
